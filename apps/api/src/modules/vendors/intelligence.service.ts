import { Types, type PipelineStage } from 'mongoose';
import { AppError } from '../../utils/AppError';
import { escapeRegex } from '../../utils/regex';
import { similarity } from '../ingestion/normalise/similarity';
import { ProductModel } from '../products/model';
import { TransactionModel } from '../transactions/model';
import { tenantCurrency } from '../auth/tenantSettings';
import * as math from './intelligence.math';
import { VendorModel } from './model';
import type { ListVendorsQuery } from './schema';
import { getVendor } from './service';

/**
 * Vendor intelligence is computed on demand with MongoDB aggregation pipelines (no cached pre-computation).
 * Every pipeline starts with `$match: { tenantId, ... }` so it can use the `{ tenantId, vendorId, date }` /
 * `{ tenantId, productId }` indexes and can never read another tenant's data.
 *
 * Data model mapping (one Transaction per source line):
 *  - purchases      = kind `invoice_line`; an "order" is the set of lines sharing a `reference` (or a lone line)
 *  - price points   = `invoice_line` + `price_quote` rows with a `unitPriceBase` (base currency per base unit)
 *  - payments       = kind `payment` (bank debits / Tally payment vouchers)
 *  - all money      = `amountBase` / `unitPriceBase`, i.e. in the tenant's base currency, so mixed currencies are comparable
 */

const PRICE_KINDS = ['invoice_line', 'price_quote'];
const SIMILAR_PRODUCT_THRESHOLD = 0.75;
const MAX_COMPARE_PRODUCTS = 10;

const oid = (id: string) => new Types.ObjectId(id);
const pick = <T>(rows: T[], predicate: (r: T) => boolean) => rows.find(predicate);

// ====================================================================== directory list with summary metrics

interface OrderDateRow {
  _id: { v: Types.ObjectId; ref: string };
  date: Date;
}

/** Distinct order dates (one per invoice reference) per vendor, for cadence. */
async function orderDatesByVendor(tid: Types.ObjectId, vendorIds: Types.ObjectId[]): Promise<Map<string, Date[]>> {
  if (!vendorIds.length) return new Map();
  const rows = await TransactionModel.aggregate<OrderDateRow>([
    { $match: { tenantId: tid, vendorId: { $in: vendorIds }, kind: 'invoice_line', date: { $type: 'date' } } },
    { $group: { _id: { v: '$vendorId', ref: { $ifNull: ['$reference', { $toString: '$_id' }] } }, date: { $min: '$date' } } },
  ]);
  const out = new Map<string, Date[]>();
  for (const r of rows) {
    const key = String(r._id.v);
    (out.get(key) ?? out.set(key, []).get(key)!).push(r.date);
  }
  return out;
}

const fromKinds = (kind: string, field: string) => ({
  $first: { $map: { input: { $filter: { input: '$k', as: 'x', cond: { $eq: ['$$x._id', kind] } } }, as: 'x', in: `$$x.${field}` } },
});

export interface VendorSummary {
  totalSpend: number;
  totalPaid: number;
  orderCount: number;
  lastPurchaseDate: Date | null;
  avgDaysBetweenOrders: number | null;
  frequencyStatus: math.FrequencyStatus;
}

/** Vendor directory: vendors plus headline metrics, filterable, sortable and paginated in the database. */
export async function listVendorsWithSummary(tenantId: string, q: ListVendorsQuery) {
  const tid = oid(tenantId);
  const match: Record<string, unknown> = { tenantId: tid };
  if (q.status) match.status = q.status;
  else if (q.hideMerged) match.status = { $ne: 'merged' };
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    match.$or = [{ name: rx }, { aliases: rx }, { taxId: rx }];
  }
  const field = q.sort.replace(/^-/, '');
  const dir = q.sort.startsWith('-') ? -1 : 1;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'transactions',
        localField: '_id',
        foreignField: 'vendorId',
        as: 'k',
        pipeline: [
          { $match: { tenantId: tid, kind: { $in: ['invoice_line', 'payment'] } } },
          {
            $group: {
              _id: '$kind',
              total: { $sum: '$amountBase' },
              last: { $max: '$date' },
              refs: { $addToSet: { $ifNull: ['$reference', { $toString: '$_id' }] } },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        totalSpend: { $ifNull: [fromKinds('invoice_line', 'total'), 0] },
        totalPaid: { $ifNull: [fromKinds('payment', 'total'), 0] },
        lastPurchaseDate: { $ifNull: [fromKinds('invoice_line', 'last'), null] },
        orderCount: {
          $ifNull: [{ $first: { $map: { input: { $filter: { input: '$k', as: 'x', cond: { $eq: ['$$x._id', 'invoice_line'] } } }, as: 'x', in: { $size: '$$x.refs' } } } }, 0],
        },
      },
    },
    { $project: { k: 0, aliasKeys: 0, tenantId: 0 } },
    { $sort: { [field]: dir, _id: 1 } },
    { $facet: { meta: [{ $count: 'total' }], items: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }] } },
  ];
  const [res] = await VendorModel.aggregate<{ meta: Array<{ total: number }>; items: Array<Record<string, any>> }>(pipeline).collation({ locale: 'en', strength: 2 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const total = res?.meta[0]?.total ?? 0;
  const rows = res?.items ?? [];

  const dates = await orderDatesByVendor(tid, rows.map((r) => r._id as Types.ObjectId));
  const items = rows.map((v) => {
    const avg = math.meanGapDays(dates.get(String(v._id)) ?? []);
    const summary: VendorSummary = {
      totalSpend: math.round(v.totalSpend),
      totalPaid: math.round(v.totalPaid),
      orderCount: v.orderCount,
      lastPurchaseDate: v.lastPurchaseDate ?? null,
      avgDaysBetweenOrders: avg,
      frequencyStatus: math.classifyFrequency(avg),
    };
    return {
      id: String(v._id),
      name: v.name,
      normalizedName: v.normalizedName,
      aliases: v.aliases ?? [],
      taxId: v.taxId,
      status: v.status,
      possibleDuplicateOf: v.possibleDuplicateOf ? String(v.possibleDuplicateOf) : undefined,
      similarityScore: v.similarityScore,
      mergedInto: v.mergedInto ? String(v.mergedInto) : undefined,
      paymentTermsDays: v.paymentTermsDays ?? null,
      paymentTerms: math.labelTerms(v.paymentTermsDays),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      summary,
    };
  });
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

// ====================================================================== supplier comparison

export interface SupplierRow {
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  matchType: 'identical' | 'similar';
  similarity: number;
  isBaseline: boolean;
  lastPrice: number;
  lastPriceKind: 'purchase' | 'quote';
  lastDate: Date | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePoints: number;
  volatilityCv: number | null;
  stability: math.StabilityRating;
  /** Lead times are not captured by any ingestion source yet. */
  leadTimeDays: null;
  rank: number;
  isCheapest: boolean;
  deltaVsCheapestPct: number | null;
  /** Negative = cheaper than the baseline vendor's latest price. Null when no baseline. */
  deltaVsBaselinePct: number | null;
}

interface PairStats {
  _id: { p: Types.ObjectId; v: Types.ObjectId };
  avg: number;
  std: number | null;
  min: number;
  max: number;
  count: number;
  lastPrice: number;
  lastKind: string;
  lastDate: Date | null;
}

export interface ProductComparison {
  product: { id: string; name: string; sku?: string; baseUnit: string };
  suppliers: SupplierRow[];
  alternativeCount: number;
}

/**
 * Cross-vendor comparison for canonical products. "Identical" = same canonical product; "similar" = a different
 * product in the same tenant with the same base unit and a name similarity >= 0.75 (a plausible substitute).
 * Suppliers are ranked by latest base-currency price per base unit (lowest first), then by price stability.
 */
export async function compareSuppliers(
  tenantId: string,
  productIds: string[],
  opts: { baselineVendorId?: string; includeSimilar?: boolean } = {},
): Promise<ProductComparison[]> {
  const tid = oid(tenantId);
  const requested = await ProductModel.find({ tenantId: tid, _id: { $in: productIds.map(oid) }, status: { $ne: 'merged' } }).select('name sku baseUnit normalizedName');
  if (!requested.length) throw AppError.notFound('No matching products found');

  // similar (substitute) products
  const similarOf = new Map<string, Array<{ id: string; name: string; score: number }>>();
  if (opts.includeSimilar ?? true) {
    const candidates = await ProductModel.find({ tenantId: tid, status: { $ne: 'merged' }, _id: { $nin: requested.map((r) => r._id) } })
      .select('name baseUnit normalizedName')
      .limit(5000);
    for (const r of requested) {
      const hits = candidates
        .filter((c) => c.baseUnit === r.baseUnit)
        .map((c) => ({ id: String(c._id), name: c.name, score: similarity(r.normalizedName, c.normalizedName) }))
        .filter((c) => c.score >= SIMILAR_PRODUCT_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      similarOf.set(String(r._id), hits);
    }
  }
  const allIds = new Set<string>(requested.map((r) => String(r._id)));
  for (const hits of similarOf.values()) for (const h of hits) allIds.add(h.id);

  const stats = await TransactionModel.aggregate<PairStats>([
    {
      $match: {
        tenantId: tid,
        productId: { $in: [...allIds].map(oid) },
        vendorId: { $exists: true },
        kind: { $in: PRICE_KINDS },
        unitPriceBase: { $type: 'number' },
      },
    },
    { $sort: { date: 1, _id: 1 } },
    {
      $group: {
        _id: { p: '$productId', v: '$vendorId' },
        avg: { $avg: '$unitPriceBase' },
        std: { $stdDevPop: '$unitPriceBase' },
        min: { $min: '$unitPriceBase' },
        max: { $max: '$unitPriceBase' },
        count: { $sum: 1 },
        lastPrice: { $last: '$unitPriceBase' },
        lastKind: { $last: '$kind' },
        lastDate: { $last: '$date' },
      },
    },
  ]);

  const vendorIds = [...new Set(stats.map((s) => String(s._id.v)))].map(oid);
  const vendors = await VendorModel.find({ tenantId: tid, _id: { $in: vendorIds }, status: { $ne: 'merged' } }).select('name');
  const vendorName = new Map(vendors.map((v) => [String(v._id), v.name]));
  const productName = new Map<string, string>([...requested.map((r) => [String(r._id), r.name] as const)]);
  for (const hits of similarOf.values()) for (const h of hits) productName.set(h.id, h.name);

  return requested.map((product) => {
    const pid = String(product._id);
    const sources: Array<{ id: string; matchType: 'identical' | 'similar'; score: number }> = [
      { id: pid, matchType: 'identical', score: 1 },
      ...(similarOf.get(pid) ?? []).map((h) => ({ id: h.id, matchType: 'similar' as const, score: h.score })),
    ];
    const unranked: Omit<SupplierRow, 'rank' | 'isCheapest' | 'deltaVsCheapestPct' | 'deltaVsBaselinePct'>[] = [];
    for (const src of sources) {
      for (const s of stats.filter((x) => String(x._id.p) === src.id && vendorName.has(String(x._id.v)))) {
        const cv = math.coefficientOfVariation(s.std, s.avg, s.count);
        unranked.push({
          vendorId: String(s._id.v),
          vendorName: vendorName.get(String(s._id.v))!,
          productId: src.id,
          productName: productName.get(src.id) ?? '',
          matchType: src.matchType,
          similarity: math.round(src.score, 3),
          isBaseline: src.matchType === 'identical' && String(s._id.v) === opts.baselineVendorId,
          lastPrice: math.round(s.lastPrice, 4),
          lastPriceKind: s.lastKind === 'invoice_line' ? 'purchase' : 'quote',
          lastDate: s.lastDate ?? null,
          avgPrice: math.round(s.avg, 4),
          minPrice: math.round(s.min, 4),
          maxPrice: math.round(s.max, 4),
          pricePoints: s.count,
          volatilityCv: cv,
          stability: math.stabilityFromCv(cv).rating,
          leadTimeDays: null,
        });
      }
    }
    const ranked = math.rankSuppliers(unranked);
    const cheapest = ranked[0]?.lastPrice;
    const baseline = pick(ranked, (r) => r.isBaseline);
    const suppliers: SupplierRow[] = ranked.map((r) => ({
      ...r,
      isCheapest: r.rank === 1,
      deltaVsCheapestPct: r.rank === 1 ? 0 : math.pctChange(cheapest, r.lastPrice),
      deltaVsBaselinePct: baseline && !r.isBaseline ? math.pctChange(baseline.lastPrice, r.lastPrice) : null,
    }));
    return {
      product: { id: pid, name: product.name, ...(product.sku ? { sku: product.sku } : {}), baseUnit: product.baseUnit },
      suppliers,
      alternativeCount: suppliers.filter((s) => !s.isBaseline).length,
    };
  });
}

// ====================================================================== deep-dive payload

interface OrderRow {
  _id: string;
  date: Date | null;
  total: number;
  lines: number;
  missingBase: number;
}
interface ProductStatRow {
  _id: Types.ObjectId;
  avg: number;
  std: number | null;
  min: number;
  max: number;
  count: number;
  firstPrice: number;
  lastPrice: number;
  lastKind: string;
  lastDate: Date | null;
  units: number;
  spend: number;
}
interface SeriesRow {
  _id: { p: Types.ObjectId; period: string };
  avg: number;
  min: number;
  max: number;
  count: number;
}

export type Granularity = 'month' | 'quarter';

export async function getVendorIntelligence(tenantId: string, vendorId: string, granularity: Granularity) {
  const vendor = await getVendor(tenantId, vendorId); // 404 for unknown or other tenants' vendors
  const tid = oid(tenantId);
  const vid = vendor._id;

  const priceMatch = { tenantId: tid, vendorId: vid, kind: { $in: PRICE_KINDS }, unitPriceBase: { $type: 'number' }, productId: { $exists: true } };
  const period =
    granularity === 'quarter'
      ? { $concat: [{ $toString: { $year: '$date' } }, '-Q', { $toString: { $ceil: { $divide: [{ $month: '$date' }, 3] } } }] }
      : { $dateToString: { format: '%Y-%m', date: '$date' } };

  const [orders, payments, stats, seriesRows] = await Promise.all([
    // orders: invoice lines grouped by invoice reference
    TransactionModel.aggregate<OrderRow>([
      { $match: { tenantId: tid, vendorId: vid, kind: 'invoice_line' } },
      {
        $group: {
          _id: { $ifNull: ['$reference', { $toString: '$_id' }] },
          date: { $min: '$date' },
          total: { $sum: '$amountBase' },
          lines: { $sum: 1 },
          missingBase: { $sum: { $cond: [{ $eq: [{ $type: '$amountBase' }, 'missing'] }, 1, 0] } },
        },
      },
      { $sort: { date: 1 } },
    ]),
    TransactionModel.find({ tenantId: tid, vendorId: vid, kind: 'payment', date: { $ne: null }, amountBase: { $ne: null } })
      .select('date amountBase sourceType')
      .sort({ date: 1 })
      .lean(),
    // per-product price statistics
    TransactionModel.aggregate<ProductStatRow>([
      { $match: priceMatch },
      { $sort: { date: 1, _id: 1 } },
      {
        $group: {
          _id: '$productId',
          avg: { $avg: '$unitPriceBase' },
          std: { $stdDevPop: '$unitPriceBase' },
          min: { $min: '$unitPriceBase' },
          max: { $max: '$unitPriceBase' },
          count: { $sum: 1 },
          firstPrice: { $first: '$unitPriceBase' },
          lastPrice: { $last: '$unitPriceBase' },
          lastKind: { $last: '$kind' },
          lastDate: { $last: '$date' },
          units: { $sum: { $cond: [{ $eq: ['$kind', 'invoice_line'] }, { $ifNull: ['$baseQuantity', 0] }, 0] } },
          spend: { $sum: { $cond: [{ $eq: ['$kind', 'invoice_line'] }, { $ifNull: ['$amountBase', 0] }, 0] } },
        },
      },
    ]),
    // price time series per product and period
    TransactionModel.aggregate<SeriesRow>([
      { $match: { ...priceMatch, date: { $type: 'date' } } },
      { $group: { _id: { p: '$productId', period }, avg: { $avg: '$unitPriceBase' }, min: { $min: '$unitPriceBase' }, max: { $max: '$unitPriceBase' }, count: { $sum: 1 } } },
      { $sort: { '_id.period': 1 } },
    ]),
  ]);

  // the same payment can be recorded in two sources (Tally voucher + bank debit): count it once
  const { kept: paymentsKept, excluded: paymentsExcluded } = math.dedupeCrossSourcePayments(
    payments.map((p) => ({ date: p.date as Date, amount: p.amountBase as number, sourceType: p.sourceType as string })),
  );

  // ---- purchases
  const dated = orders.filter((o): o is OrderRow & { date: Date } => o.date instanceof Date);
  const totalSpend = math.round(orders.reduce((n, o) => n + o.total, 0));
  const orderCount = orders.length;
  const lastPurchase = dated.length ? dated[dated.length - 1]!.date : null;
  const summary = {
    totalSpend,
    totalPaid: math.round(paymentsKept.reduce((n, p) => n + p.amount, 0)),
    orderCount,
    invoiceLineCount: orders.reduce((n, o) => n + o.lines, 0),
    avgOrderValue: orderCount ? math.round(totalSpend / orderCount) : null,
    firstPurchaseDate: dated[0]?.date ?? null,
    lastPurchaseDate: lastPurchase,
    daysSinceLastPurchase: lastPurchase ? Math.floor((Date.now() - lastPurchase.getTime()) / math.DAY_MS) : null,
    avgUnitPrice: null as number | null,
    productCount: stats.length,
  };

  // ---- cadence
  const avgGap = math.meanGapDays(dated.map((o) => o.date));
  const frequency = { avgDaysBetweenOrders: avgGap, status: math.classifyFrequency(avgGap), ordersConsidered: dated.length };

  // ---- payment terms & estimated delay
  const analysis = math.analyzePayments(
    dated.map((o) => ({ date: o.date, amount: o.total })),
    paymentsKept,
  );
  const termsDays = vendor.paymentTermsDays ?? null;
  const paymentTerms = {
    termsDays,
    label: math.labelTerms(termsDays),
    source: termsDays == null ? ('not_set' as const) : ((vendor.paymentTermsSource as 'configured' | 'extracted' | undefined) ?? ('configured' as const)),
    avgDaysToPay: math.averageDaysToPay(analysis.paid),
    onTimeRate: math.onTimeRate(analysis.paid, termsDays),
    invoicesPaid: analysis.paid.length,
    invoicesOutstanding: analysis.outstandingInvoices,
    outstandingAmount: analysis.outstandingAmount,
    unappliedCredit: analysis.unappliedCredit,
    method: 'fifo-estimate' as const, // payments are not linked to invoices in the source data
  };

  // ---- products (catalog)
  const productDocs = await ProductModel.find({ tenantId: tid, _id: { $in: stats.map((s) => s._id) } }).select('name sku baseUnit');
  const meta = new Map(productDocs.map((p) => [String(p._id), p]));
  const totalPoints = stats.reduce((n, s) => n + s.count, 0);
  summary.avgUnitPrice = totalPoints ? math.round(stats.reduce((n, s) => n + s.avg * s.count, 0) / totalPoints, 4) : null;

  const products = stats
    .map((s) => {
      const p = meta.get(String(s._id));
      return {
        productId: String(s._id),
        name: p?.name ?? '(unknown product)',
        sku: p?.sku,
        baseUnit: p?.baseUnit ?? 'pcs',
        unitsSupplied: math.round(s.units, 4),
        totalSpend: math.round(s.spend),
        firstPrice: math.round(s.firstPrice, 4),
        lastPrice: math.round(s.lastPrice, 4),
        lastPriceKind: s.lastKind === 'invoice_line' ? ('purchase' as const) : ('quote' as const),
        lastDate: s.lastDate ?? null,
        avgPrice: math.round(s.avg, 4),
        minPrice: math.round(s.min, 4),
        maxPrice: math.round(s.max, 4),
        priceChangePct: math.pctChange(s.firstPrice, s.lastPrice),
        pricePoints: s.count,
        volatilityCv: math.coefficientOfVariation(s.std, s.avg, s.count),
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend || b.pricePoints - a.pricePoints || a.name.localeCompare(b.name));

  // ---- price consistency
  const cvs = products.map((p) => p.volatilityCv).filter((c): c is number => c != null);
  const volatilityCv = cvs.length ? math.round(cvs.reduce((n, c) => n + c, 0) / cvs.length, 4) : null;
  const stability = math.stabilityFromCv(volatilityCv);
  const priceConsistency = { volatilityCv, stabilityIndex: stability.index, rating: stability.rating, productsAssessed: cvs.length };

  // ---- price history / inflation
  const byProduct = new Map<string, SeriesRow[]>();
  for (const r of seriesRows) (byProduct.get(String(r._id.p)) ?? byProduct.set(String(r._id.p), []).get(String(r._id.p))!).push(r);
  const series = [...byProduct.entries()]
    .map(([pid, rows]) => {
      const p = products.find((x) => x.productId === pid);
      const points = rows.map((r) => ({ period: r._id.period, avgPrice: math.round(r.avg, 4), minPrice: math.round(r.min, 4), maxPrice: math.round(r.max, 4), samples: r.count }));
      return {
        productId: pid,
        name: p?.name ?? '(unknown product)',
        baseUnit: p?.baseUnit ?? 'pcs',
        changePct: points.length >= 2 ? math.pctChange(points[0]!.avgPrice, points[points.length - 1]!.avgPrice) : null,
        points,
      };
    })
    .sort((a, b) => (products.findIndex((p) => p.productId === a.productId) - products.findIndex((p) => p.productId === b.productId)));
  const changes = series.map((s) => s.changePct).filter((c): c is number => c != null);
  const priceHistory = { granularity, inflationPct: changes.length ? math.round(changes.reduce((n, c) => n + c, 0) / changes.length, 2) : null, series };

  // ---- alternatives for the vendor's main products
  const topIds = products.slice(0, MAX_COMPARE_PRODUCTS).map((p) => p.productId);
  const comparisons = topIds.length ? await compareSuppliers(tenantId, topIds, { baselineVendorId: String(vid), includeSimilar: true }) : [];
  const alternatives = comparisons.filter((c) => c.alternativeCount > 0);

  return {
    vendor: { id: String(vendor._id), name: vendor.name, taxId: vendor.taxId, status: vendor.status, profile: vendor.profile ?? null },
    currency: await tenantCurrency(tenantId),
    generatedAt: new Date(),
    summary,
    frequency,
    paymentTerms,
    priceConsistency,
    priceHistory,
    products,
    alternatives: { comparedProducts: comparisons.length, productsWithAlternatives: alternatives.length, items: alternatives },
    dataQuality: {
      invoiceLinesWithoutBaseAmount: orders.reduce((n, o) => n + o.missingBase, 0),
      leadTimes: 'not_captured' as const,
      duplicatePaymentsExcluded: paymentsExcluded.length,
    },
  };
}
