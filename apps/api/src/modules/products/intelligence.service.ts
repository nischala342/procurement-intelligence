import { Types, type PipelineStage } from 'mongoose';
import { escapeRegex } from '../../utils/regex';
import { tenantCurrency } from '../auth/tenantSettings';
import { TransactionModel } from '../transactions/model';
import * as vmath from '../vendors/intelligence.math';
import { VendorModel } from '../vendors/model';
import { compareSuppliers, type SupplierRow } from '../vendors/intelligence.service';
import * as math from './intelligence.math';
import { ProductModel } from './model';
import type { ListProductsQuery } from './schema';
import { getProduct } from './service';

/**
 * Product economics, computed on demand with tenant-matched aggregation pipelines.
 *
 *  - "purchase"  = `invoice_line` rows (what was actually paid); "quote" = `price_quote` rows (what a supplier offered)
 *  - prices are base-currency per base unit (`unitPriceBase`); spend is `amountBase` (tenant base currency)
 *  - weighted average price = sum(unitPriceBase x baseQuantity) / sum(baseQuantity) over purchases
 *  - not captured by any source and therefore never invented: lead times (configurable, default flagged),
 *    stock on hand (estimated from purchase velocity), supplier delivery performance (reliability is a proxy)
 */

const PRICE_KINDS = ['invoice_line', 'price_quote'];
const oid = (id: string) => new Types.ObjectId(id);
const HISTORY_POINT_CAP = 500;

// ====================================================================== shared aggregations

interface PairRow {
  _id: { p: Types.ObjectId; v: Types.ObjectId };
  avg: number;
  std: number | null;
  min: number;
  max: number;
  count: number;
  purchaseCount: number;
  lastPrice: number;
  lastKind: string;
  lastDate: Date | null;
}

/** Per (product, vendor) price statistics over purchases + quotes. */
async function pairStats(tid: Types.ObjectId, productIds: Types.ObjectId[]): Promise<PairRow[]> {
  if (!productIds.length) return [];
  return TransactionModel.aggregate<PairRow>([
    { $match: { tenantId: tid, productId: { $in: productIds }, vendorId: { $exists: true }, kind: { $in: PRICE_KINDS }, unitPriceBase: { $type: 'number' } } },
    { $sort: { date: 1, _id: 1 } },
    {
      $group: {
        _id: { p: '$productId', v: '$vendorId' },
        avg: { $avg: '$unitPriceBase' },
        std: { $stdDevPop: '$unitPriceBase' },
        min: { $min: '$unitPriceBase' },
        max: { $max: '$unitPriceBase' },
        count: { $sum: 1 },
        purchaseCount: { $sum: { $cond: [{ $eq: ['$kind', 'invoice_line'] }, 1, 0] } },
        lastPrice: { $last: '$unitPriceBase' },
        lastKind: { $last: '$kind' },
        lastDate: { $last: '$date' },
      },
    },
  ]);
}

async function tenantPurchaseSpend(tid: Types.ObjectId): Promise<number> {
  const [r] = await TransactionModel.aggregate<{ total: number }>([
    { $match: { tenantId: tid, kind: 'invoice_line' } },
    { $group: { _id: null, total: { $sum: '$amountBase' } } },
  ]);
  return r?.total ?? 0;
}

async function vendorNames(tid: Types.ObjectId, ids: Array<Types.ObjectId | string>): Promise<Map<string, string>> {
  const vendors = await VendorModel.find({ tenantId: tid, _id: { $in: [...new Set(ids.map(String))].map(oid) }, status: { $ne: 'merged' } }).select('name');
  return new Map(vendors.map((v) => [String(v._id), v.name]));
}

const kindLabel = (k: string): 'purchase' | 'quote' => (k === 'invoice_line' ? 'purchase' : 'quote');

/** Scores the suppliers of each product; returns productId -> ranked scores. */
function scoreByProduct(rows: PairRow[], names: Map<string, string>) {
  const grouped = new Map<string, PairRow[]>();
  for (const r of rows) {
    if (!names.has(String(r._id.v))) continue;
    (grouped.get(String(r._id.p)) ?? grouped.set(String(r._id.p), []).get(String(r._id.p))!).push(r);
  }
  const out = new Map<string, Array<ReturnType<typeof math.scoreVendors>[number] & { pair: PairRow }>>();
  for (const [pid, list] of grouped) {
    const scores = math.scoreVendors(
      list.map((r) => ({ vendorId: String(r._id.v), lastPrice: r.lastPrice, lastDate: r.lastDate ?? null, avg: r.avg, std: r.std, count: r.count, purchaseCount: r.purchaseCount })),
    );
    out.set(pid, scores.map((s) => ({ ...s, pair: list.find((r) => String(r._id.v) === s.vendorId)! })));
  }
  return out;
}

// ====================================================================== catalog list with summary metrics

export async function listProductsWithSummary(tenantId: string, q: ListProductsQuery) {
  const tid = oid(tenantId);
  const match: Record<string, unknown> = { tenantId: tid };
  if (q.status) match.status = q.status;
  else if (q.hideMerged) match.status = { $ne: 'merged' };
  if (q.dimension) match.dimension = q.dimension;
  if (q.category) match.category = q.category;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    match.$or = [{ name: rx }, { aliases: rx }, { sku: rx }];
  }
  const field = q.sort.replace(/^-/, '');
  const dir = q.sort.startsWith('-') ? -1 : 1;

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'transactions',
        localField: '_id',
        foreignField: 'productId',
        as: 't',
        pipeline: [
          { $match: { tenantId: tid, kind: { $in: PRICE_KINDS }, unitPriceBase: { $type: 'number' } } },
          { $sort: { date: 1, _id: 1 } },
          {
            $group: {
              _id: { v: '$vendorId', k: '$kind' },
              count: { $sum: 1 },
              spend: { $sum: { $ifNull: ['$amountBase', 0] } },
              units: { $sum: { $ifNull: ['$baseQuantity', 0] } },
              wsum: { $sum: { $multiply: ['$unitPriceBase', { $ifNull: ['$baseQuantity', 0] }] } },
              lastPrice: { $last: '$unitPriceBase' },
              lastDate: { $last: '$date' },
            },
          },
        ],
      },
    },
    {
      $addFields: {
        purchaseRows: { $filter: { input: '$t', as: 'r', cond: { $eq: ['$$r._id.k', 'invoice_line'] } } },
        quoteRows: { $filter: { input: '$t', as: 'r', cond: { $eq: ['$$r._id.k', 'price_quote'] } } },
      },
    },
    {
      $addFields: {
        totalSpend: { $sum: '$purchaseRows.spend' },
        unitsPurchased: { $sum: '$purchaseRows.units' },
        weightedSum: { $sum: '$purchaseRows.wsum' },
        purchaseCount: { $sum: '$purchaseRows.count' },
        hasPurchases: { $gt: [{ $size: '$purchaseRows' }, 0] },
        cur: { $first: { $sortArray: { input: { $cond: [{ $gt: [{ $size: '$purchaseRows' }, 0] }, '$purchaseRows', '$quoteRows'] }, sortBy: { lastDate: -1 } } } },
        primary: { $first: { $sortArray: { input: '$purchaseRows', sortBy: { spend: -1, count: -1 } } } },
      },
    },
    {
      $addFields: {
        avgPurchasePrice: { $cond: [{ $gt: ['$unitsPurchased', 0] }, { $divide: ['$weightedSum', '$unitsPurchased'] }, null] },
        currentPrice: '$cur.lastPrice',
        currentPriceDate: '$cur.lastDate',
        currentPriceKind: { $cond: ['$hasPurchases', 'purchase', 'quote'] },
        primaryVendorId: '$primary._id.v',
      },
    },
    { $project: { t: 0, purchaseRows: 0, quoteRows: 0, cur: 0, primary: 0, weightedSum: 0, hasPurchases: 0, aliasKeys: 0, tenantId: 0 } },
    { $sort: { [field]: dir, _id: 1 } },
    { $facet: { meta: [{ $count: 'total' }], items: [{ $skip: (q.page - 1) * q.limit }, { $limit: q.limit }] } },
  ];
  const [res] = await ProductModel.aggregate<{ meta: Array<{ total: number }>; items: Array<Record<string, any>> }>(pipeline).collation({ locale: 'en', strength: 2 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const total = res?.meta[0]?.total ?? 0;
  const rows = res?.items ?? [];

  // page-level enrichment: spend share, vendor names, best-performing vendor
  const productIds = rows.map((r) => r._id as Types.ObjectId);
  const [tenantSpend, pairs] = await Promise.all([tenantPurchaseSpend(tid), pairStats(tid, productIds)]);
  const names = await vendorNames(tid, [...pairs.map((p) => p._id.v), ...rows.map((r) => r.primaryVendorId).filter(Boolean)]);
  const scored = scoreByProduct(pairs, names);

  const items = rows.map((p) => {
    const best = scored.get(String(p._id))?.[0];
    return {
      id: String(p._id),
      name: p.name,
      normalizedName: p.normalizedName,
      sku: p.sku,
      aliases: p.aliases ?? [],
      baseUnit: p.baseUnit,
      dimension: p.dimension,
      category: p.category ?? null,
      subCategory: p.subCategory ?? null,
      status: p.status,
      possibleDuplicateOf: p.possibleDuplicateOf ? String(p.possibleDuplicateOf) : undefined,
      similarityScore: p.similarityScore,
      mergedInto: p.mergedInto ? String(p.mergedInto) : undefined,
      leadTimeDays: p.leadTimeDays ?? null,
      safetyStockDays: p.safetyStockDays ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      summary: {
        totalSpend: vmath.round(p.totalSpend),
        spendSharePct: tenantSpend > 0 ? vmath.round((p.totalSpend / tenantSpend) * 100, 2) : null,
        unitsPurchased: vmath.round(p.unitsPurchased, 4),
        purchaseCount: p.purchaseCount,
        avgPurchasePrice: p.avgPurchasePrice != null ? vmath.round(p.avgPurchasePrice, 4) : null,
        currentPrice: p.currentPrice != null ? vmath.round(p.currentPrice, 4) : null,
        currentPriceKind: p.currentPrice != null ? (p.currentPriceKind as 'purchase' | 'quote') : null,
        currentPriceDate: p.currentPriceDate ?? null,
        primaryVendor: p.primaryVendorId && names.has(String(p.primaryVendorId)) ? { id: String(p.primaryVendorId), name: names.get(String(p.primaryVendorId))! } : null,
        bestVendor: best ? { id: best.vendorId, name: names.get(best.vendorId)!, score: best.composite } : null,
        vendorCount: (scored.get(String(p._id)) ?? []).length,
      },
    };
  });
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

// ====================================================================== alternatives

export interface SubstituteProduct {
  product: { id: string; name: string; baseUnit: string; similarity: number };
  suppliers: SupplierRow[];
  cheapestPrice: number | null;
  cheapestVendor: string | null;
  /** negative = the substitute's cheapest supplier is cheaper than what is paid now */
  deltaVsCurrentPct: number | null;
}

async function primaryVendorOf(tid: Types.ObjectId, productId: Types.ObjectId): Promise<string | undefined> {
  const [r] = await TransactionModel.aggregate<{ _id: Types.ObjectId }>([
    { $match: { tenantId: tid, productId, kind: 'invoice_line', vendorId: { $exists: true } } },
    { $group: { _id: '$vendorId', spend: { $sum: { $ifNull: ['$amountBase', 0] } }, n: { $sum: 1 } } },
    { $sort: { spend: -1, n: -1 } },
    { $limit: 1 },
  ]);
  return r ? String(r._id) : undefined;
}

async function buildAlternatives(tenantId: string, productId: string, baselineVendorId: string | undefined, includeSimilar: boolean) {
  const [cmp] = await compareSuppliers(tenantId, [productId], { ...(baselineVendorId ? { baselineVendorId } : {}), includeSimilar });
  const all = cmp?.suppliers ?? [];
  const vendors = all.filter((s) => s.matchType === 'identical').map((s, i) => ({ ...s, rank: i + 1 }));
  const baseline = vendors.find((s) => s.isBaseline);

  const byProduct = new Map<string, SupplierRow[]>();
  for (const s of all.filter((x) => x.matchType === 'similar')) (byProduct.get(s.productId) ?? byProduct.set(s.productId, []).get(s.productId)!).push(s);
  const substitutes: SubstituteProduct[] = [...byProduct.values()]
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => a.lastPrice - b.lastPrice).map((r, i) => ({ ...r, rank: i + 1 }));
      const cheapest = sorted[0]!;
      return {
        product: { id: cheapest.productId, name: cheapest.productName, baseUnit: cmp!.product.baseUnit, similarity: cheapest.similarity },
        suppliers: sorted,
        cheapestPrice: cheapest.lastPrice,
        cheapestVendor: cheapest.vendorName,
        deltaVsCurrentPct: baseline ? vmath.pctChange(baseline.lastPrice, cheapest.lastPrice) : null,
      };
    })
    .sort((a, b) => (a.cheapestPrice ?? Infinity) - (b.cheapestPrice ?? Infinity));
  return {
    product: cmp?.product ?? null,
    baselineVendor: baseline ? { id: baseline.vendorId, name: baseline.vendorName, lastPrice: baseline.lastPrice } : null,
    vendors,
    substitutes,
    cheaperVendorCount: baseline ? vendors.filter((v) => !v.isBaseline && v.lastPrice < baseline.lastPrice).length : 0,
  };
}

export async function getProductAlternatives(tenantId: string, productId: string, includeSimilar: boolean) {
  const product = await getProduct(tenantId, productId); // 404 for unknown / other tenants' products
  const tid = oid(tenantId);
  const primary = await primaryVendorOf(tid, product._id);
  return { currency: await tenantCurrency(tenantId), priceBasis: 'latest price per base unit, in the base currency', ...(await buildAlternatives(tenantId, productId, primary, includeSimilar)) };
}

// ====================================================================== deep-dive payload

interface PointDoc {
  date?: Date | null;
  vendorId?: Types.ObjectId;
  kind: string;
  unitPriceBase: number;
  baseQuantity?: number | null;
  amountBase?: number | null;
  reference?: string | null;
}
interface MonthRow {
  _id: { period: string; k: string };
  avg: number;
  min: number;
  max: number;
  count: number;
}

const stdPop = (v: number[]) => {
  if (!v.length) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((n, x) => n + (x - m) ** 2, 0) / v.length);
};

export async function getProductIntelligence(tenantId: string, productId: string, opts: { asOf?: Date } = {}) {
  const product = await getProduct(tenantId, productId);
  const tid = oid(tenantId);
  const pid = product._id;
  const asOf = opts.asOf ?? new Date();
  const priceMatch = { tenantId: tid, productId: pid, kind: { $in: PRICE_KINDS }, unitPriceBase: { $type: 'number' } };

  const [points, pairs, monthly, tenantSpend, primaryId] = await Promise.all([
    TransactionModel.find({ tenantId: tid, productId: pid, kind: { $in: PRICE_KINDS }, unitPriceBase: { $ne: null } })
      .select('date vendorId kind unitPriceBase baseQuantity amountBase reference')
      .sort({ date: 1, _id: 1 })
      .limit(5000)
      .lean<PointDoc[]>(),
    pairStats(tid, [pid]),
    TransactionModel.aggregate<MonthRow>([
      { $match: { ...priceMatch, date: { $type: 'date' } } },
      { $group: { _id: { period: { $dateToString: { format: '%Y-%m', date: '$date' } }, k: '$kind' }, avg: { $avg: '$unitPriceBase' }, min: { $min: '$unitPriceBase' }, max: { $max: '$unitPriceBase' }, count: { $sum: 1 } } },
      { $sort: { '_id.period': 1 } },
    ]),
    tenantPurchaseSpend(tid),
    primaryVendorOf(tid, pid),
  ]);
  const names = await vendorNames(tid, [...points.map((p) => p.vendorId).filter((v): v is Types.ObjectId => Boolean(v)), ...pairs.map((p) => p._id.v)]);
  const nameOf = (v?: Types.ObjectId | string | null) => (v ? (names.get(String(v)) ?? null) : null);

  const purchases = points.filter((p) => p.kind === 'invoice_line');
  const quotes = points.filter((p) => p.kind === 'price_quote');

  // ---- 1. history, 2. lowest, 3. average
  const toPoint = (p: PointDoc) => ({
    date: p.date ?? null,
    price: vmath.round(p.unitPriceBase, 4),
    kind: kindLabel(p.kind),
    vendorId: p.vendorId ? String(p.vendorId) : null,
    vendorName: nameOf(p.vendorId),
    quantity: p.baseQuantity ?? null,
    reference: p.reference ?? null,
  });
  const extreme = (rows: PointDoc[], pick: 'min' | 'max') => {
    if (!rows.length) return null;
    const best = rows.reduce((b, r) => ((pick === 'min' ? r.unitPriceBase < b.unitPriceBase : r.unitPriceBase > b.unitPriceBase) ? r : b));
    return toPoint(best);
  };
  const sumQty = purchases.reduce((n, p) => n + (p.baseQuantity ?? 0), 0);
  const weightedAvg = sumQty > 0 ? purchases.reduce((n, p) => n + p.unitPriceBase * (p.baseQuantity ?? 0), 0) / sumQty : null;
  const meanPurchase = purchases.length ? purchases.reduce((n, p) => n + p.unitPriceBase, 0) / purchases.length : null;
  const totalSpend = purchases.reduce((n, p) => n + (p.amountBase ?? 0), 0);

  const lastPurchase = purchases.length ? purchases[purchases.length - 1]! : null;
  const lastQuote = quotes.length ? quotes[quotes.length - 1]! : null;
  const currentRow = lastPurchase ?? lastQuote;
  const current = currentRow ? toPoint(currentRow) : null;
  const lowestPurchase = extreme(purchases, 'min');
  const highestPurchase = extreme(purchases, 'max');
  const lowestQuote = extreme(quotes, 'min');

  const summary = {
    totalSpend: vmath.round(totalSpend),
    spendSharePct: tenantSpend > 0 ? vmath.round((totalSpend / tenantSpend) * 100, 2) : null,
    unitsPurchased: vmath.round(sumQty, 4),
    purchaseLines: purchases.length,
    orderCount: new Set(purchases.map((p, i) => p.reference ?? `line-${i}`)).size,
    vendorCount: new Set(points.map((p) => String(p.vendorId))).size,
    weightedAvgPurchasePrice: weightedAvg != null ? vmath.round(weightedAvg, 4) : null,
    meanPurchasePrice: meanPurchase != null ? vmath.round(meanPurchase, 4) : null,
    currentPrice: current,
    firstPurchaseDate: purchases.find((p) => p.date)?.date ?? null,
    lastPurchaseDate: lastPurchase?.date ?? null,
  };
  const priceComparison = {
    currentVsLowestPct: vmath.pctChange(lowestPurchase?.price, current?.price),
    currentVsAveragePct: vmath.pctChange(weightedAvg, current?.price),
  };

  // ---- 5. fluctuations (month over month)
  const rowsOf = (kind: string) => monthly.filter((m) => m._id.k === kind);
  const purchaseMonths = rowsOf('invoice_line');
  const basis: 'purchases' | 'all_observations' = purchaseMonths.length >= 2 ? 'purchases' : 'all_observations';
  const byPeriod = new Map<string, { w: number; n: number; min: number; max: number }>();
  for (const r of basis === 'purchases' ? purchaseMonths : monthly) {
    const cur = byPeriod.get(r._id.period) ?? { w: 0, n: 0, min: Infinity, max: -Infinity };
    cur.w += r.avg * r.count;
    cur.n += r.count;
    cur.min = Math.min(cur.min, r.min);
    cur.max = Math.max(cur.max, r.max);
    byPeriod.set(r._id.period, cur);
  }
  const series = [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, v]) => ({ period, avgPrice: vmath.round(v.w / v.n, 4), minPrice: vmath.round(v.min, 4), maxPrice: vmath.round(v.max, 4), samples: v.n }));
  const changes = math.monthlyChanges(series);
  const moms = changes.map((c) => c.changePct).filter((c): c is number => c != null);
  const basisPoints = (basis === 'purchases' ? purchases : points).map((p) => p.unitPriceBase);
  const cv = vmath.coefficientOfVariation(stdPop(basisPoints), basisPoints.length ? basisPoints.reduce((a, b) => a + b, 0) / basisPoints.length : null, basisPoints.length);
  const trendPct = math.trendPctPerPeriod(series.map((s) => s.avgPrice));
  const fluctuation = {
    basis,
    changePct: series.length >= 2 ? vmath.pctChange(series[0]!.avgPrice, series[series.length - 1]!.avgPrice) : null,
    avgMonthOverMonthPct: moms.length ? vmath.round(moms.reduce((a, b) => a + b, 0) / moms.length, 2) : null,
    trendPctPerMonth: trendPct,
    trend: math.classifyTrend(trendPct),
    rangePct: basisPoints.length >= 2 ? vmath.pctChange(Math.min(...basisPoints), Math.max(...basisPoints)) : null,
    volatilityCv: cv,
    stability: vmath.stabilityFromCv(cv),
    monthly: changes,
  };

  // ---- 4. best-performing vendor
  const scored = scoreByProduct(pairs, names).get(String(pid)) ?? [];
  const vendors = scored.map((s) => ({
    rank: s.rank,
    vendorId: s.vendorId,
    vendorName: names.get(s.vendorId)!,
    score: s.composite,
    breakdown: { price: s.priceScore, stability: s.stabilityScore, reliability: s.reliabilityScore },
    lastPrice: vmath.round(s.pair.lastPrice, 4),
    lastPriceKind: kindLabel(s.pair.lastKind),
    lastDate: s.pair.lastDate ?? null,
    avgPrice: vmath.round(s.pair.avg, 4),
    minPrice: vmath.round(s.pair.min, 4),
    maxPrice: vmath.round(s.pair.max, 4),
    pricePoints: s.pair.count,
    purchaseCount: s.pair.purchaseCount,
    volatilityCv: s.volatilityCv,
    stability: vmath.stabilityFromCv(s.volatilityCv).rating,
    isCurrentSupplier: current?.vendorId === s.vendorId,
  }));
  const best = vendors[0] ?? null;
  const cheapest = vendors.length ? vendors.reduce((b, v) => (v.lastPrice < b.lastPrice ? v : b)) : null;
  const savings =
    current && cheapest && cheapest.lastPrice < current.price
      ? {
          cheapestVendorId: cheapest.vendorId,
          cheapestVendorName: cheapest.vendorName,
          perUnit: vmath.round(current.price - cheapest.lastPrice, 4),
          pct: vmath.round(((current.price - cheapest.lastPrice) / current.price) * 100, 2),
          onHistoricalVolume: math.savingsOnVolume(totalSpend, sumQty, cheapest.lastPrice),
        }
      : null;
  const bestVendor = best
    ? {
        ...best,
        onlySupplier: vendors.length === 1,
        savings,
        method: { weights: math.SCORE_WEIGHTS, reliability: 'proxy: purchase history depth and recency (delivery performance is not captured)' },
      }
    : null;

  // ---- 6. consumption & reorder
  const events = purchases.filter((p) => p.date && (p.baseQuantity ?? 0) > 0).map((p) => ({ date: p.date as Date, qty: p.baseQuantity as number }));
  const consumption = math.consumptionFromPurchases(events);
  const leadTimeDays = product.leadTimeDays ?? math.DEFAULT_LEAD_TIME_DAYS;
  let reorder: Record<string, unknown>;
  if (!consumption) {
    reorder = { status: 'insufficient_data', reason: 'At least two purchases on different dates with quantities are needed to estimate consumption.', leadTimeDays, leadTimeSource: product.leadTimeDays != null ? 'configured' : 'assumed_default', safetyStockDays: product.safetyStockDays ?? null };
  } else {
    const lastDate = events.reduce((m, e) => (e.date > m ? e.date : m), events[0]!.date);
    const lastDay = Math.floor(lastDate.getTime() / vmath.DAY_MS);
    const lastOrderQty = events.filter((e) => Math.floor(e.date.getTime() / vmath.DAY_MS) === lastDay).reduce((n, e) => n + e.qty, 0);
    const plan = math.planReorder({
      consumption,
      lastOrderQty,
      daysSinceLastOrder: Math.max(0, (asOf.getTime() - lastDate.getTime()) / vmath.DAY_MS),
      asOf,
      leadTimeDays,
      safetyStockDays: product.safetyStockDays ?? null,
    });
    const costPrice = best?.lastPrice ?? current?.price ?? null;
    reorder = {
      ...plan,
      leadTimeSource: product.leadTimeDays != null ? 'configured' : 'assumed_default',
      safetyStockDays: product.safetyStockDays ?? null,
      lastOrderDate: lastDate,
      estimatedOrderCost: costPrice != null ? vmath.round(plan.recommendedOrderQty * costPrice) : null,
      costBasisPrice: costPrice,
      assumptions: [
        'Consumption is estimated from purchase volume over time; stock movements and usage are not tracked.',
        product.leadTimeDays != null ? `Lead time of ${leadTimeDays} days is configured for this product.` : `Lead times are not captured by the ingestion sources: a default of ${leadTimeDays} days is assumed. Set the real lead time to refine the plan.`,
        'Stock on hand assumes the last order was received in full and consumed at the estimated rate.',
      ],
    };
  }

  const alternatives = await buildAlternatives(tenantId, productId, primaryId, true);

  return {
    product: {
      id: String(product._id),
      name: product.name,
      sku: product.sku,
      baseUnit: product.baseUnit,
      dimension: product.dimension,
      status: product.status,
      leadTimeDays: product.leadTimeDays ?? null,
      safetyStockDays: product.safetyStockDays ?? null,
    },
    currency: await tenantCurrency(tenantId),
    asOf,
    generatedAt: new Date(),
    summary,
    priceComparison,
    lowestPurchase,
    highestPurchase,
    lowestQuote,
    history: { points: points.slice(-HISTORY_POINT_CAP).map(toPoint), truncated: points.length > HISTORY_POINT_CAP },
    fluctuation,
    bestVendor,
    vendors,
    consumption: consumption
      ? {
          unit: product.baseUnit,
          velocityPerDay: vmath.round(consumption.velocityPerDay, 4),
          velocityPerMonth: vmath.round(consumption.velocityPerDay * 30, 2),
          avgOrderQty: vmath.round(consumption.avgOrderQty, 2),
          avgDaysBetweenOrders: vmath.round(consumption.avgDaysBetweenOrders, 1),
          ordersConsidered: consumption.ordersConsidered,
          basis: 'purchase_volume' as const,
        }
      : null,
    reorder,
    alternatives: {
      baselineVendor: alternatives.baselineVendor,
      cheaperVendorCount: alternatives.cheaperVendorCount,
      vendors: alternatives.vendors,
      substitutes: alternatives.substitutes,
    },
    dataQuality: {
      leadTimes: product.leadTimeDays != null ? ('configured' as const) : ('assumed_default' as const),
      stockOnHand: 'not_tracked' as const,
      reliability: 'proxy' as const,
      purchaseLinesWithoutQuantity: purchases.filter((p) => !(p.baseQuantity && p.baseQuantity > 0)).length,
    },
  };
}
