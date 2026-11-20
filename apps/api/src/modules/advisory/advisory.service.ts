import { createHash } from 'node:crypto';
import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { ProductModel } from '../products/model';
import { AdvisoryRunModel, BenchmarkModel, InsightModel, type InsightAttrs } from './model';
import { claudeCaller, narrate, type LlmCall } from './narrator';
import { collectSignals, type ScanOptions } from './signals.service';
import { INSIGHT_TYPES, levelRank, type InsightStatus, type InsightType, type Level, type Signal } from './types';

const oid = (id: string) => new Types.ObjectId(id);
const sha = (s: string) => createHash('sha1').update(s).digest('hex');
const NARRATION_CONCURRENCY = 3;
const SCAN_LOCK_MS = 3 * 60_000;
const IMPACT_COUNTED_KINDS = ['savings'];

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

// ====================================================================== scan

export interface ScanParams extends ScanOptions {
  /** injectable for tests; defaults to Claude when ANTHROPIC_API_KEY is set, else template-only */
  llm?: LlmCall | null;
}

/** Runs the deterministic signal engine, then narrates new/changed insights (LLM optional, always grounded). */
export async function runScan(tenantId: string, userId: string, params: ScanParams) {
  const tid = oid(tenantId);
  const recent = await AdvisoryRunModel.findOne({ tenantId: tid, status: 'running', startedAt: { $gt: new Date(Date.now() - SCAN_LOCK_MS) } });
  if (recent) throw new AppError(409, 'SCAN_IN_PROGRESS', 'An advisory scan is already running for this organization');

  const started = new Date();
  const run = await AdvisoryRunModel.create({ tenantId: tid, startedAt: started, params: { windowDays: params.windowDays ?? null, minVendors: params.minVendors, asOf: params.asOf ?? null } });
  try {
    const result = await collectSignals(tenantId, params);
    const existing = await InsightModel.find({ tenantId: tid });
    const byFp = new Map(existing.map((i) => [i.fingerprint, i]));
    const llm = params.llm === undefined ? claudeCaller() : params.llm;
    let llmBudget = llm ? env.ADVISORY_LLM_MAX_PER_RUN : 0;
    const now = new Date();
    const counts = { created: 0, updated: 0, unchanged: 0, reopened: 0, markedStale: 0, narratedByLlm: 0, narratedByTemplate: 0, llmFallbacks: 0 };

    const work = result.signals.map((s) => {
      const hash = sha(JSON.stringify({ f: s.facts, s: s.severity, c: s.confidence, i: s.impact }));
      const prev = byFp.get(s.fingerprint);
      const needsText = !prev || prev.evidenceHash !== hash;
      const useLlm = needsText && llmBudget > 0;
      if (useLlm) llmBudget -= 1;
      return { s, hash, prev, needsText, useLlm };
    });

    await mapLimit(work, NARRATION_CONCURRENCY, async ({ s, hash, prev, needsText, useLlm }) => {
      if (prev && !needsText) {
        await InsightModel.updateOne({ _id: prev._id, tenantId: tid }, { $set: { lastDetectedAt: now, stale: false, asOf: result.asOf } });
        counts.unchanged += 1;
        return;
      }
      const n = await narrate(s, useLlm ? llm : null);
      if (n.generator === 'llm') counts.narratedByLlm += 1;
      else counts.narratedByTemplate += 1;
      if (n.fallbackReason) counts.llmFallbacks += 1;
      const fields = {
        type: s.type,
        severity: s.severity,
        severityRank: levelRank[s.severity],
        confidence: s.confidence,
        stale: false,
        ...n.narration,
        generator: n.generator,
        model: n.model ?? null,
        fallbackReason: n.fallbackReason ?? null,
        impact: s.impact,
        entities: { productIds: s.entities.productIds.map(oid), vendorIds: s.entities.vendorIds.map(oid) },
        window: s.window ?? undefined,
        evidence: s.facts,
        rfq: s.rfq,
        evidenceHash: hash,
        asOf: result.asOf,
        lastDetectedAt: now,
      };
      if (!prev) {
        await InsightModel.create({ tenantId: tid, fingerprint: s.fingerprint, ...fields, status: 'ACTIVE', firstDetectedAt: now, statusHistory: [{ status: 'ACTIVE', at: now, by: 'system', note: 'Detected by scan' }] });
        counts.created += 1;
        return;
      }
      const escalated = levelRank[s.severity] > prev.severityRank;
      const reopen = escalated && (prev.status === 'DISMISSED' || prev.status === 'ACTIONED');
      await InsightModel.updateOne(
        { _id: prev._id, tenantId: tid },
        {
          $set: { ...fields, ...(reopen ? { status: 'ACTIVE', snoozedUntil: null } : {}) },
          ...(reopen ? { $push: { statusHistory: { status: 'ACTIVE', at: now, by: 'system', note: `Reopened: severity increased from ${prev.severity} to ${s.severity}` } } } : {}),
        },
      );
      counts.updated += 1;
      if (reopen) counts.reopened += 1;
    });

    // conditions that were not found this time are hidden (kept for history; user decisions are untouched)
    const found = new Set(result.signals.map((s) => s.fingerprint));
    const gone = existing.filter((i) => !found.has(i.fingerprint) && !i.stale && (i.status === 'ACTIVE' || i.status === 'SNOOZED'));
    if (gone.length) {
      await InsightModel.updateMany({ tenantId: tid, _id: { $in: gone.map((g) => g._id) } }, { $set: { stale: true } });
      counts.markedStale = gone.length;
    }

    const byType = Object.fromEntries(INSIGHT_TYPES.map((t) => [t, result.signals.filter((s) => s.type === t).length]));
    const summary = {
      asOf: result.asOf,
      asOfReason: result.asOfReason,
      freshness: result.freshness,
      pointsAnalysed: result.pointsAnalysed,
      signalsDetected: result.signals.length,
      byType,
      skippedQuietReorder: result.skippedQuietReorder,
      suppressedByCap: result.suppressedByCap,
      llmEnabled: Boolean(llm),
      ...counts,
    };
    await AdvisoryRunModel.updateOne({ _id: run._id }, { $set: { status: 'completed', finishedAt: new Date(), asOf: result.asOf, asOfReason: result.asOfReason, summary } });
    void userId;
    return { runId: String(run._id), ...summary };
  } catch (e) {
    await AdvisoryRunModel.updateOne({ _id: run._id }, { $set: { status: 'failed', finishedAt: new Date(), error: e instanceof Error ? e.message : 'Scan failed' } });
    throw e;
  }
}

// ====================================================================== read / lifecycle

export interface ListInsightsQuery {
  page: number;
  limit: number;
  type?: InsightType;
  severity?: Level;
  status?: InsightStatus | 'ALL';
  includeStale: boolean;
}

/** Snoozed insights whose snooze has expired become active again. */
async function wakeSnoozed(tid: Types.ObjectId) {
  const now = new Date();
  await InsightModel.updateMany(
    { tenantId: tid, status: 'SNOOZED', snoozedUntil: { $lte: now } },
    { $set: { status: 'ACTIVE', snoozedUntil: null }, $push: { statusHistory: { status: 'ACTIVE', at: now, by: 'system', note: 'Snooze expired' } } },
  );
}

const listProjection = { evidence: 0, rfq: 0, statusHistory: 0 } as const;

export async function listInsights(tenantId: string, q: ListInsightsQuery) {
  const tid = oid(tenantId);
  await wakeSnoozed(tid);
  const filter: FilterQuery<InsightAttrs> = { tenantId: tid };
  if (!q.includeStale) filter.stale = { $ne: true };
  const status = q.status ?? 'ACTIVE';
  if (status !== 'ALL') filter.status = status;
  if (q.type) filter.type = q.type;
  if (q.severity) filter.severity = q.severity;
  const [items, total] = await Promise.all([
    InsightModel.find(filter, listProjection)
      .sort({ severityRank: -1, 'impact.amountInr': -1, lastDetectedAt: -1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    InsightModel.countDocuments(filter),
  ]);
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

export async function getInsight(tenantId: string, id: string) {
  const insight = await InsightModel.findOne({ _id: id, tenantId });
  if (!insight) throw AppError.notFound('Insight not found');
  return insight;
}

export async function updateInsightStatus(tenantId: string, userId: string, id: string, input: { status: InsightStatus; snoozeDays?: number; note?: string }) {
  const insight = await getInsight(tenantId, id);
  const now = new Date();
  insight.status = input.status;
  if (input.status === 'SNOOZED') insight.snoozedUntil = new Date(now.getTime() + (input.snoozeDays ?? 14) * 86_400_000);
  else insight.set('snoozedUntil', null);
  insight.statusHistory.push({ status: input.status, at: now, by: userId, note: input.note ?? (input.status === 'SNOOZED' ? `Snoozed for ${input.snoozeDays ?? 14} days` : undefined) });
  await insight.save();
  return insight;
}

/** Counts for the command-center strip. Impact is summed per type and never across types (the same saving can appear under several). */
export async function getSummary(tenantId: string) {
  const tid = oid(tenantId);
  await wakeSnoozed(tid);
  const [byType, bySeverity, byStatus, lastRun] = await Promise.all([
    InsightModel.aggregate<{ _id: InsightType; count: number; potentialSavings: number }>([
      { $match: { tenantId: tid, status: 'ACTIVE', stale: { $ne: true } } },
      { $group: { _id: '$type', count: { $sum: 1 }, potentialSavings: { $sum: { $cond: [{ $in: ['$impact.kind', IMPACT_COUNTED_KINDS] }, { $ifNull: ['$impact.amountInr', 0] }, 0] } } } },
    ]),
    InsightModel.aggregate<{ _id: Level; count: number }>([{ $match: { tenantId: tid, status: 'ACTIVE', stale: { $ne: true } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    InsightModel.aggregate<{ _id: InsightStatus; count: number }>([{ $match: { tenantId: tid, stale: { $ne: true } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    AdvisoryRunModel.findOne({ tenantId: tid, status: 'completed' }).sort({ startedAt: -1 }).lean(),
  ]);
  const typeMap = new Map(byType.map((t) => [t._id, t]));
  return {
    activeTotal: byType.reduce((n, t) => n + t.count, 0),
    byType: Object.fromEntries(INSIGHT_TYPES.map((t) => [t, { count: typeMap.get(t)?.count ?? 0, potentialSavings: Math.round((typeMap.get(t)?.potentialSavings ?? 0) * 100) / 100 }])),
    bySeverity: { HIGH: bySeverity.find((s) => s._id === 'HIGH')?.count ?? 0, MEDIUM: bySeverity.find((s) => s._id === 'MEDIUM')?.count ?? 0, LOW: bySeverity.find((s) => s._id === 'LOW')?.count ?? 0 },
    byStatus: Object.fromEntries(['ACTIVE', 'ACTIONED', 'DISMISSED', 'SNOOZED'].map((s) => [s, byStatus.find((x) => x._id === s)?.count ?? 0])),
    lastScan: lastRun ? { finishedAt: lastRun.finishedAt, asOf: lastRun.asOf, asOfReason: lastRun.asOfReason, summary: lastRun.summary } : null,
    llmEnabled: Boolean(env.ANTHROPIC_API_KEY),
    note: 'Potential savings are shown per insight type and are not additive across types: one price gap can surface under several.',
  };
}

// ====================================================================== market benchmarks

export interface BenchmarkInput {
  productId: string;
  priceBase: number;
  sourceName: string;
  sourceUrl?: string;
  observedAt: Date;
  verified: boolean;
  notes?: string;
}

export async function createBenchmark(tenantId: string, userEmail: string, input: BenchmarkInput) {
  const product = await ProductModel.findOne({ _id: input.productId, tenantId });
  if (!product) throw AppError.notFound('Product not found');
  if (input.verified && !input.sourceUrl) throw AppError.badRequest('A verified benchmark must include a sourceUrl');
  return BenchmarkModel.create({
    tenantId,
    productId: product._id,
    priceBase: input.priceBase,
    sourceName: input.sourceName,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    observedAt: input.observedAt,
    verified: input.verified,
    ...(input.verified ? { verifiedBy: userEmail, verifiedAt: new Date() } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  });
}

export async function listBenchmarks(tenantId: string, productId?: string) {
  return BenchmarkModel.find({ tenantId, ...(productId ? { productId } : {}) }).sort({ observedAt: -1 }).limit(200);
}

export async function deleteBenchmark(tenantId: string, id: string) {
  const b = await BenchmarkModel.findOneAndDelete({ _id: id, tenantId });
  if (!b) throw AppError.notFound('Benchmark not found');
  return b;
}

export type { Signal };
