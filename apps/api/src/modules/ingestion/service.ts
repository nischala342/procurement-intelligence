import { createHash } from 'node:crypto';
import path from 'node:path';
import { Types, type AnyBulkWriteOperation } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { BASE_CURRENCY } from '../reference/currency';
import { ProductModel } from '../products/model';
import { TransactionModel, type TransactionAttrs } from '../transactions/model';
import { VendorModel } from '../vendors/model';
import { IngestionJobModel, RawRecordModel } from './model';
import { normalizeProductName, normalizeSku, normalizeVendorName } from './normalise/names';
import { normalizeRow } from './normalise/row';
import { PARSERS, ALLOWED_EXTENSIONS, type ParsedRow, type ParseResult, type SourceType } from './parsers';
import { EntityResolver } from './resolver';

export const MAX_ROWS = 20_000;
const MAX_STORED_ERRORS = 200;

export interface IngestInput {
  /** Owner of everything this ingestion creates. Always taken from the authenticated session. */
  tenantId: string;
  buffer: Buffer;
  originalName: string;
  sourceType: SourceType;
  dayFirst?: boolean;
  defaultCurrency?: string;
  /** Re-process a previously ingested file. Transactions are still de-duplicated by fingerprint. */
  allowDuplicate?: boolean;
}

const sha = (algo: 'sha1' | 'sha256', s: string | Buffer) => createHash(algo).update(s).digest('hex');

function fingerprintBase(sourceType: string, row: ParsedRow, n: { amount?: number; unitPrice?: number; quantity?: number; date: Date | null }) {
  return sha('sha1', [
    sourceType,
    row.kind,
    normalizeVendorName(row.vendorName ?? ''),
    row.reference ?? '',
    n.date ? n.date.toISOString().slice(0, 10) : '',
    row.sku ? normalizeSku(row.sku) : '',
    normalizeProductName(row.productName ?? ''),
    n.quantity ?? '',
    n.unitPrice ?? '',
    n.amount ?? '',
    row.kind === 'payment' ? normalizeProductName(row.description ?? '') : '',
  ].join('|'));
}

export async function runIngestion(input: IngestInput) {
  const ext = path.extname(input.originalName).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS[input.sourceType];
  if (!allowed.includes(ext)) {
    throw new AppError(400, 'UNSUPPORTED_FILE_TYPE', `sourceType "${input.sourceType}" accepts ${allowed.join(', ')} files; got "${ext || 'no extension'}"`);
  }
  if (input.buffer.length === 0) throw new AppError(400, 'EMPTY_FILE', 'Uploaded file is empty');

  const tenantOid = new Types.ObjectId(input.tenantId);
  const fileHash = sha('sha256', input.buffer);
  const dayFirst = input.dayFirst ?? true;
  const defaultCurrency = input.defaultCurrency ?? BASE_CURRENCY;

  if (!input.allowDuplicate) {
    const prior = await IngestionJobModel.findOne({
      tenantId: tenantOid,
      fileHash,
      sourceType: input.sourceType,
      status: { $in: ['completed', 'completed_with_errors'] },
    });
    if (prior) {
      throw new AppError(409, 'DUPLICATE_FILE', 'This exact file was already ingested', { jobId: String(prior._id) });
    }
  }

  const jobBase = {
    tenantId: tenantOid,
    sourceType: input.sourceType,
    filename: input.originalName,
    fileSize: input.buffer.length,
    fileHash,
    options: { dayFirst, defaultCurrency },
  };

  // --- parse (pure). A 501 means the adapter is not enabled; no job is recorded for that.
  let parsed: ParseResult;
  try {
    parsed = await PARSERS[input.sourceType](input.buffer, { filename: input.originalName });
    if (parsed.rows.length + parsed.errors.length > MAX_ROWS) {
      throw new AppError(422, 'PARSE_FAILED', `File has more than ${MAX_ROWS} rows; split it and upload in parts`);
    }
    if (parsed.rows.length + parsed.errors.length === 0) {
      throw new AppError(422, 'PARSE_FAILED', 'File contains no data rows');
    }
  } catch (e) {
    if (e instanceof AppError && e.statusCode === 501) throw e;
    const message = e instanceof Error ? e.message : 'Parse failed';
    const failed = await IngestionJobModel.create({ ...jobBase, status: 'failed', failureReason: message, completedAt: new Date() });
    throw new AppError(422, 'PARSE_FAILED', message, { jobId: String(failed._id) });
  }

  const job = await IngestionJobModel.create({ ...jobBase, status: 'processing' });
  const stats = {
    rowsParsed: parsed.rows.length,
    rowsSkipped: parsed.skipped,
    rowsFailed: parsed.errors.length,
    transactionsCreated: 0,
    duplicatesIgnored: 0,
    vendorsCreated: 0,
    vendorsMatched: 0,
    productsCreated: 0,
    productsMatched: 0,
    needsReview: 0,
  };
  const errors = [...parsed.errors];

  try {
    const resolver = new EntityResolver(input.tenantId);
    await resolver.init();

    const raws: Array<{ _id: Types.ObjectId; tenantId: Types.ObjectId; jobId: Types.ObjectId; rowNumber: number; payload: unknown; status: 'normalized' | 'error'; error?: string }> = [];
    for (const e of parsed.errors) {
      raws.push({ _id: new Types.ObjectId(), tenantId: tenantOid, jobId: job._id, rowNumber: e.rowNumber, payload: {}, status: 'error', error: e.message });
    }
    const ops: AnyBulkWriteOperation<TransactionAttrs>[] = [];
    const seen = new Map<string, number>();

    for (const row of parsed.rows) {
      const rawId = new Types.ObjectId();
      const norm = normalizeRow(row, { dayFirst, defaultCurrency });
      if (!norm.ok) {
        errors.push({ rowNumber: row.rowNumber, message: norm.error });
        raws.push({ _id: rawId, tenantId: tenantOid, jobId: job._id, rowNumber: row.rowNumber, payload: row.raw, status: 'error', error: norm.error });
        stats.rowsFailed++;
        continue;
      }
      const n = norm.value;
      const warnings = [...n.warnings];

      let vendorId: Types.ObjectId | undefined;
      if (row.vendorName?.trim()) {
        const v = await resolver.resolveVendor(row.vendorName, row.vendorTaxId);
        if (v) {
          vendorId = v.id;
          if (v.outcome === 'created') stats.vendorsCreated++;
          else if (v.outcome === 'review') (stats.vendorsCreated++, stats.needsReview++);
          else stats.vendorsMatched++;
        }
      } else if (row.kind !== 'payment') warnings.push('MISSING_VENDOR');

      let productId: Types.ObjectId | undefined;
      if (row.kind !== 'payment' && (row.productName?.trim() || row.sku?.trim())) {
        const p = await resolver.resolveProduct({
          ...(row.productName ? { name: row.productName } : {}),
          ...(row.sku ? { sku: row.sku } : {}),
          baseUnit: n.baseUnit ?? 'pcs',
          dimension: n.dimension,
        });
        if (p) {
          productId = p.id;
          if (p.outcome === 'created') stats.productsCreated++;
          else if (p.outcome === 'review') (stats.productsCreated++, stats.needsReview++);
          else stats.productsMatched++;
        }
      }

      const base = fingerprintBase(input.sourceType, row, n);
      const occurrence = (seen.get(base) ?? 0) + 1; // identical lines inside one file stay distinct
      seen.set(base, occurrence);

      raws.push({ _id: rawId, tenantId: tenantOid, jobId: job._id, rowNumber: row.rowNumber, payload: row.raw, status: 'normalized' });
      const { dimension: _dimension, date, ...rest } = n;
      void _dimension;
      ops.push({
        updateOne: {
          filter: { tenantId: tenantOid, fingerprint: `${base}#${occurrence}` },
          update: {
            $setOnInsert: {
              tenantId: tenantOid,
              ...rest,
              ...(date ? { date } : {}),
              warnings,
              sourceType: input.sourceType,
              jobId: job._id,
              rawRecordId: rawId,
              ...(vendorId ? { vendorId } : {}),
              ...(productId ? { productId } : {}),
              ...(row.reference ? { reference: row.reference } : {}),
              ...(row.description ? { description: row.description } : {}),
              fingerprint: `${base}#${occurrence}`,
            } as Partial<TransactionAttrs>,
          },
          upsert: true,
        },
      });
    }

    if (raws.length) await RawRecordModel.insertMany(raws, { ordered: false });
    if (ops.length) {
      const res = await TransactionModel.bulkWrite(ops, { ordered: false });
      stats.transactionsCreated = res.upsertedCount;
      stats.duplicatesIgnored = ops.length - res.upsertedCount;
    }

    job.set({
      status: errors.length ? 'completed_with_errors' : 'completed',
      stats,
      rowErrors: errors.slice(0, MAX_STORED_ERRORS),
      completedAt: new Date(),
    });
    await job.save();
    return job;
  } catch (e) {
    job.set({ status: 'failed', stats, failureReason: e instanceof Error ? e.message : 'Unexpected error', completedAt: new Date() });
    await job.save();
    throw e;
  }
}

type JobDoc = InstanceType<typeof IngestionJobModel>;

/** Serialises a job with `reviewPending`: how many of its vendors/products still await a human decision. */
export async function withReviewPending(job: JobDoc) {
  const json = job.toJSON() as unknown as Record<string, unknown>;
  let reviewPending = 0;
  if ((job.stats?.needsReview ?? 0) > 0) {
    const [vendorIds, productIds] = await Promise.all([
      TransactionModel.distinct('vendorId', { tenantId: job.tenantId, jobId: job._id }),
      TransactionModel.distinct('productId', { tenantId: job.tenantId, jobId: job._id }),
    ]);
    const [v, p] = await Promise.all([
      VendorModel.countDocuments({ tenantId: job.tenantId, _id: { $in: vendorIds }, status: 'needs_review' }),
      ProductModel.countDocuments({ tenantId: job.tenantId, _id: { $in: productIds }, status: 'needs_review' }),
    ]);
    reviewPending = v + p;
  }
  return { ...json, reviewPending };
}

export async function listJobs(tenantId: string, page: number, limit: number) {
  const [docs, total] = await Promise.all([
    IngestionJobModel.find({ tenantId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    IngestionJobModel.countDocuments({ tenantId }),
  ]);
  const items = await Promise.all(docs.map(withReviewPending));
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

// Reads filter by tenant: another tenant's id behaves exactly like a non-existent id (404, never 403).
export async function getJob(tenantId: string, id: string) {
  const job = await IngestionJobModel.findOne({ _id: id, tenantId });
  if (!job) throw AppError.notFound('Ingestion job not found');
  return job;
}

export async function getRawRecord(tenantId: string, id: string) {
  const rec = await RawRecordModel.findOne({ _id: id, tenantId });
  if (!rec) throw AppError.notFound('Raw record not found');
  return rec;
}

export async function listJobRecords(tenantId: string, id: string, page: number, limit: number, status?: 'normalized' | 'error') {
  await getJob(tenantId, id);
  const filter = { tenantId, jobId: id, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    RawRecordModel.find(filter).sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit),
    RawRecordModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
