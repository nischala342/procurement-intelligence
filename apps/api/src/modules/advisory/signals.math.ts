/**
 * Deterministic signal detectors. Pure functions over normalised price points: no database, no LLM, no clock
 * (the evaluation date `asOf` is always passed in). Every detector returns an evidence packet (`facts`) that is
 * the only data narration may use. All money is in the tenant's base currency (`facts.currency`), never converted here.
 */
import { consumptionFromPurchases, DEFAULT_LEAD_TIME_DAYS, planReorder } from '../products/intelligence.math';
import { detectBudgetOverrun, detectDeliveryRisk, detectMaverickSpend, detectSourcingShift, detectSupplyRisk, measuredLeadTime } from './signals.sourcing';
import { mannWhitneyLess, median } from './stats';
import { DAY_MS, isoDate, levelFromRank, levelRank, round, type Impact, type Level, type RfqHint, type Signal } from './types';

export interface Pt {
  productId: string;
  vendorId: string | null;
  kind: 'purchase' | 'quote';
  date: Date;
  price: number;
  qty: number | null;
  amount: number | null;
  reference: string | null;
  /** purchase-order context when the source provides it (delivery, contract, budget) */
  proc?: ProcInfo;
}

export interface ProcInfo {
  onTime?: boolean;
  daysLate?: number;
  leadTimeDays?: number;
  maverick?: boolean;
  contractId?: string;
  preferredSupplier?: boolean;
  singleSource?: boolean;
  budgetUnitPriceBase?: number;
}

export interface VendorProfileInfo {
  riskRating?: string;
  approvalStatus?: string;
  tier?: number;
  esgScore?: number;
  country?: string;
}

export interface ProductInfo {
  id: string;
  name: string;
  sku?: string;
  baseUnit: string;
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  category?: string;
}

export interface BenchmarkInfo {
  id: string;
  productId: string;
  priceBase: number;
  sourceName: string;
  sourceUrl: string | null;
  observedAt: Date;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  notes: string | null;
}

export interface DetectCtx {
  asOf: Date;
  products: Map<string, ProductInfo>;
  vendors: Map<string, string>;
  /** total recorded purchase spend up to asOf (base currency), used to scale severity */
  tenantSpend: number;
  /** restrict cost-creep to one window; default evaluates 30/60/90 */
  windowDays?: number;
  minVendors: number;
  /** look-back for supplier comparisons and volumes (days) */
  lookbackDays: number;
  /** look-back for spend-fragmentation (days) */
  fragmentationDays: number;
  benchmarks: BenchmarkInfo[];
  /** tenant base currency; all money in the packets is expressed in it */
  currency?: string;
  /** supplier master data (risk, tier, ESG...), when the sources provide it */
  vendorProfiles?: Map<string, VendorProfileInfo>;
}

/** Data is "dense" for a product when it has this many purchases: then thin per-supplier comparisons are suppressed. */
const DENSE = 20;
/** Noisy products: lines needed per side and the p-value a rise must beat (strict: many products x windows are tested). */
export const NOISY_TEST = { minLines: 8, alpha: 0.01 } as const;
/** Within-supplier price variation above this means single prices are mostly noise. */
const NOISE_CV = 0.1;

const cvOf = (xs: number[]) => {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return m > 0 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m : null;
};

/**
 * True when a product's prices are too noisy for single-price comparisons: the pooled within-supplier coefficient of
 * variation exceeds 10% (or, with fewer than 3 repeat prices in total, the product-wide CV does), or the product is dense.
 * Noisy products must pass a significance test on 5+ lines per side instead.
 */
export function isNoisy(rows: Pt[]): boolean {
  if (rows.length >= DENSE) return true;
  const byV = new Map<string, number[]>();
  for (const r of rows) if (r.vendorId) (byV.get(r.vendorId) ?? byV.set(r.vendorId, []).get(r.vendorId)!).push(r.price);
  // pooled within-supplier CV: relative deviations from each supplier's own mean, over all repeat lines (n - 1 per supplier)
  let ss = 0;
  let df = 0;
  for (const xs of byV.values()) {
    if (xs.length < 2) continue;
    const m = xs.reduce((p, q) => p + q, 0) / xs.length;
    if (m <= 0) continue;
    ss += xs.reduce((p, q) => p + (q / m - 1) ** 2, 0);
    df += xs.length - 1;
  }
  const cv = df >= 3 ? Math.sqrt(ss / df) : cvOf(rows.map((r) => r.price));
  return cv != null && cv > NOISE_CV;
}

// ------------------------------------------------------------------ helpers

const THRESHOLDS = { creepPct: 2, overpricingPct: 4, benchmarkPct: 3 } as const;
const name = (ctx: DetectCtx, id: string | null) => (id ? (ctx.vendors.get(id) ?? 'Unknown supplier') : 'Unknown supplier');
const tier = (v: number, [med, high]: [number, number]): Level => (v >= high ? 'HIGH' : v >= med ? 'MEDIUM' : 'LOW');
const bump = (l: Level): Level => levelFromRank(Math.min(3, levelRank[l] + 1));

export function groupByProduct(pts: Pt[]): Map<string, Pt[]> {
  const m = new Map<string, Pt[]>();
  for (const p of pts) (m.get(p.productId) ?? m.set(p.productId, []).get(p.productId)!).push(p);
  for (const rows of m.values()) rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  return m;
}

interface Stats {
  n: number;
  qty: number;
  spend: number;
  avg: number;
  qtyComplete: boolean;
}
/** Quantity-weighted average price when every row has a quantity, else the simple mean. */
export function priceStats(rows: Pt[]): Stats {
  const qtyComplete = rows.length > 0 && rows.every((r) => (r.qty ?? 0) > 0);
  const qty = rows.reduce((n, r) => n + (r.qty ?? 0), 0);
  const spend = rows.reduce((n, r) => n + (r.amount ?? r.price * (r.qty ?? 0)), 0);
  const avg = qtyComplete ? rows.reduce((n, r) => n + r.price * (r.qty as number), 0) / qty : rows.reduce((n, r) => n + r.price, 0) / (rows.length || 1);
  return { n: rows.length, qty, spend, avg, qtyComplete };
}

interface VendorLatest {
  vendorId: string;
  price: number;
  kind: 'purchase' | 'quote';
  date: Date;
  purchases: Pt[];
  all: Pt[];
}
/** Latest price per attributable vendor (any kind), with that vendor's purchases. */
function latestByVendor(rows: Pt[]): Map<string, VendorLatest> {
  const m = new Map<string, VendorLatest>();
  for (const p of rows) {
    if (!p.vendorId) continue;
    const cur = m.get(p.vendorId) ?? { vendorId: p.vendorId, price: p.price, kind: p.kind, date: p.date, purchases: [], all: [] };
    cur.all.push(p);
    if (p.kind === 'purchase') cur.purchases.push(p);
    if (p.date.getTime() >= cur.date.getTime()) Object.assign(cur, { price: p.price, kind: p.kind, date: p.date });
    m.set(p.vendorId, cur);
  }
  return m;
}

const latestPurchase = (v: VendorLatest): Pt | null => (v.purchases.length ? v.purchases[v.purchases.length - 1]! : null);

function suggestVendors(rows: Pt[], exclude: Set<string>, limit = 4): string[] {
  return [...latestByVendor(rows).values()]
    .filter((v) => !exclude.has(v.vendorId))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map((v) => v.vendorId);
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
function monthlyAvg(rows: Pt[]): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const p of rows) {
    const k = monthKey(p.date);
    const c = acc.get(k) ?? { s: 0, n: 0 };
    c.s += p.price;
    c.n += 1;
    acc.set(k, c);
  }
  return new Map([...acc].map(([k, v]) => [k, v.s / v.n]));
}

const productFacts = (ctx: DetectCtx, pid: string) => {
  const p = ctx.products.get(pid);
  return { productId: pid, productName: p?.name ?? 'Unknown product', sku: p?.sku ?? null, baseUnit: p?.baseUnit ?? 'pcs' };
};

// ------------------------------------------------------------------ 1. cost creep

/**
 * For each product: the average price PAID (purchases) in the most recent window vs the window before it, evaluated
 * over 30/60/90 days (or one requested window); the strongest increase is reported when >= 2%.
 * Plus one portfolio signal: the spend-weighted average increase across products that have both windows.
 */
export function detectCostCreep(pts: Pt[], ctx: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const asOfMs = ctx.asOf.getTime();
  const windows = ctx.windowDays ? [ctx.windowDays] : [30, 60, 90];
  const portfolioW = ctx.windowDays ?? 60;
  const portfolio: Array<{ productId: string; productName: string; pct: number; recentSpend: number; extra: number | null }> = [];
  // pooled price indices (price / the product's median over both windows) for the portfolio significance test
  const poolPrior: number[] = [];
  const poolRecent: number[] = [];
  let anyNoisy = false;

  const split = (purchases: Pt[], W: number) => {
    const recentFrom = asOfMs - W * DAY_MS;
    const priorFrom = asOfMs - 2 * W * DAY_MS;
    return {
      recentFrom,
      priorFrom,
      recent: purchases.filter((p) => p.date.getTime() > recentFrom && p.date.getTime() <= asOfMs),
      prior: purchases.filter((p) => p.date.getTime() > priorFrom && p.date.getTime() <= recentFrom),
    };
  };

  for (const [pid, rows] of groupByProduct(pts)) {
    const purchases = rows.filter((r) => r.kind === 'purchase');
    let best: { W: number; pct: number; s: ReturnType<typeof split>; rs: Stats; ps: Stats } | null = null;
    for (const W of windows) {
      const s = split(purchases, W);
      if (!s.recent.length || !s.prior.length) continue;
      if (isNoisy(rows)) {
        // noisy or frequently-bought item: require 5+ lines per window and a significant rise (prior prices lower)
        if (s.recent.length < NOISY_TEST.minLines || s.prior.length < NOISY_TEST.minLines) continue;
        const t = mannWhitneyLess(s.prior.map((p) => p.price), s.recent.map((p) => p.price));
        if (!t || t.p >= NOISY_TEST.alpha) continue;
      }
      const rs = priceStats(s.recent);
      const ps = priceStats(s.prior);
      const pct = ((rs.avg - ps.avg) / ps.avg) * 100;
      if (!best || pct > best.pct) best = { W, pct, s, rs, ps };
    }
    // portfolio contribution uses one consistent window
    const pw = split(purchases, portfolioW);
    if (pw.recent.length && pw.prior.length) {
      const rs = priceStats(pw.recent);
      const ps = priceStats(pw.prior);
      const med = median([...pw.recent, ...pw.prior].map((p) => p.price));
      if (med && med > 0) {
        poolRecent.push(...pw.recent.map((p) => p.price / med));
        poolPrior.push(...pw.prior.map((p) => p.price / med));
      }
      if (isNoisy(rows)) anyNoisy = true;
      portfolio.push({
        productId: pid,
        productName: productFacts(ctx, pid).productName,
        pct: ((rs.avg - ps.avg) / ps.avg) * 100,
        recentSpend: rs.spend,
        extra: rs.qtyComplete ? (rs.avg - ps.avg) * rs.qty : null,
      });
    }
    if (!best || best.pct < THRESHOLDS.creepPct) continue;

    const { W, pct, s, rs, ps } = best;
    const extra = rs.qtyComplete ? round((rs.avg - ps.avg) * rs.qty, 2) : null;
    const recentVendors = [...new Set(s.recent.map((p) => p.vendorId).filter((v): v is string => Boolean(v)))];
    const confidence: Level = rs.n >= 2 && ps.n >= 2 ? 'HIGH' : rs.n >= 2 || ps.n >= 2 ? 'MEDIUM' : 'LOW';
    let severity = tier(pct, [5, 10]);
    if (extra != null && ctx.tenantSpend > 0 && extra / ctx.tenantSpend >= 0.03) severity = bump(severity);
    const rfq: RfqHint = {
      productId: pid,
      targetQuantity: rs.qtyComplete ? round(rs.qty, 4) : null,
      quantityBasis: `Quantity purchased in the last ${W} days`,
      referencePrice: round(ps.avg, 4),
      referencePriceBasis: `Average price paid in the ${W} days before that`,
      currentVendorIds: recentVendors,
      suggestedVendorIds: suggestVendors(rows.filter((r) => asOfMs - r.date.getTime() <= ctx.lookbackDays * DAY_MS), new Set(recentVendors)),
    };
    out.push({
      type: 'COST_CREEP',
      fingerprint: `creep:product:${pid}`,
      severity,
      confidence,
      entities: { productIds: [pid], vendorIds: recentVendors },
      window: { from: isoDate(new Date(s.priorFrom)), to: isoDate(ctx.asOf) },
      impact: {
        kind: extra != null ? 'cost_increase' : 'none',
        amountInr: extra,
        pct: round(pct, 2),
        basis: extra != null ? `(recent average price − prior average price) × quantity bought in the last ${W} days` : 'Quantities missing on some purchase lines, so the extra cost cannot be computed',
      },
      facts: {
        scope: 'product',
        ...productFacts(ctx, pid),
        windowDays: W,
        windowsEvaluated: windows,
        changePct: round(pct, 2),
        priceIncreasePerUnit: round(rs.avg - ps.avg, 4),
        recent: { from: isoDate(new Date(s.recentFrom)), to: isoDate(ctx.asOf), avgPrice: round(rs.avg, 4), purchaseLines: rs.n, quantity: rs.qtyComplete ? round(rs.qty, 4) : null, spend: round(rs.spend, 2) },
        prior: { from: isoDate(new Date(s.priorFrom)), to: isoDate(new Date(s.recentFrom)), avgPrice: round(ps.avg, 4), purchaseLines: ps.n, quantity: ps.qtyComplete ? round(ps.qty, 4) : null, spend: round(ps.spend, 2) },
        impactAmountInr: extra,
        vendors: recentVendors.map((id) => ({ vendorId: id, vendorName: name(ctx, id) })),
      },
      rfq,
    });
  }

  const rising = portfolio.filter((p) => p.recentSpend > 0);
  const totalSpend = rising.reduce((n, p) => n + p.recentSpend, 0);
  if (rising.length >= 2 && totalSpend > 0) {
    const weighted = rising.reduce((n, p) => n + p.pct * p.recentSpend, 0) / totalSpend;
    // with noisy prices a weighted average of means swings by chance: require the pooled rise to be significant
    const pooled = anyNoisy ? mannWhitneyLess(poolPrior, poolRecent) : null;
    const significant = !anyNoisy || (pooled != null && pooled.p < NOISY_TEST.alpha);
    if (weighted >= THRESHOLDS.creepPct && significant) {
      const extras = rising.map((p) => p.extra);
      const extra = extras.every((e) => e != null) ? round(extras.reduce((n: number, e) => n + (e as number), 0), 2) : null;
      const top = [...rising].sort((a, b) => b.pct * b.recentSpend - a.pct * a.recentSpend).slice(0, 5);
      out.push({
        type: 'COST_CREEP',
        fingerprint: 'creep:portfolio',
        severity: tier(weighted, [5, 10]),
        confidence: rising.length >= 5 ? 'HIGH' : rising.length >= 3 ? 'MEDIUM' : 'LOW',
        entities: { productIds: rising.map((p) => p.productId), vendorIds: [] },
        window: { from: isoDate(new Date(asOfMs - 2 * portfolioW * DAY_MS)), to: isoDate(ctx.asOf) },
        impact: { kind: extra != null ? 'cost_increase' : 'none', amountInr: extra, pct: round(weighted, 2), basis: `Spend-weighted average price change across ${rising.length} products, recent ${portfolioW} days vs the ${portfolioW} days before` },
        facts: {
          scope: 'portfolio',
          windowDays: portfolioW,
          productCount: rising.length,
          weightedChangePct: round(weighted, 2),
          impactAmountInr: extra,
          topProducts: top.map((p) => ({ productId: p.productId, productName: p.productName, changePct: round(p.pct, 2), recentSpend: round(p.recentSpend, 2) })),
        },
        rfq: null,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ 2. supplier overpricing

/**
 * A supplier we BUY from whose latest purchase price exceeds the cheapest other supplier's latest price by >= 4%,
 * unless a month-by-month comparison shows they are not consistently higher (months compared >= 2 and < 50% higher).
 */
export function detectSupplierVariance(pts: Pt[], ctx: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const since = ctx.asOf.getTime() - ctx.lookbackDays * DAY_MS;
  for (const [pid, all] of groupByProduct(pts)) {
    const rows = all.filter((r) => r.date.getTime() > since);
    const vendors = latestByVendor(rows);
    if (vendors.size < 2) continue;
    for (const v of vendors.values()) {
      const lp = latestPurchase(v);
      if (!lp) continue; // only suppliers we actually pay
      const peers = [...vendors.values()].filter((x) => x.vendorId !== v.vendorId);
      const best = peers.reduce((b, x) => (x.price < b.price ? x : b));
      const premium = ((lp.price - best.price) / best.price) * 100;
      if (premium < THRESHOLDS.overpricingPct) continue;
      if (isNoisy(all)) {
        // noisy market: compare price distributions, not two single prices
        if (v.purchases.length < NOISY_TEST.minLines || best.all.length < NOISY_TEST.minLines) continue;
        const t = mannWhitneyLess(best.all.map((p) => p.price), v.purchases.map((p) => p.price));
        if (!t || t.p >= NOISY_TEST.alpha) continue;
      }

      const mv = monthlyAvg(v.purchases);
      const mb = monthlyAvg(best.all);
      const shared = [...mv.keys()].filter((k) => mb.has(k));
      const higher = shared.filter((k) => mv.get(k)! > mb.get(k)!).length;
      const ratio = shared.length ? higher / shared.length : 0;
      if (shared.length >= 2 && ratio < 0.5) continue;
      const confidence: Level = shared.length >= 3 && ratio >= 0.75 ? 'HIGH' : shared.length >= 2 && ratio >= 0.75 ? 'MEDIUM' : 'LOW';

      const st = priceStats(v.purchases);
      const savings = st.qtyComplete || st.qty > 0 ? round(v.purchases.reduce((n, p) => n + (p.qty ?? 0) * Math.max(0, p.price - best.price), 0), 2) : null;
      let severity = tier(premium, [8, 15]);
      if (savings != null && ctx.tenantSpend > 0 && savings / ctx.tenantSpend >= 0.03) severity = bump(severity);
      const peerIds = peers.sort((a, b) => a.price - b.price).slice(0, 4).map((x) => x.vendorId);
      out.push({
        type: 'SUPPLIER_VARIANCE',
        fingerprint: `variance:${pid}:${v.vendorId}`,
        severity,
        confidence,
        entities: { productIds: [pid], vendorIds: [v.vendorId, best.vendorId] },
        window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
        impact: {
          kind: savings != null ? 'savings' : 'none',
          amountInr: savings,
          pct: round(premium, 2),
          basis: savings != null ? `Σ over this supplier's purchases in the last ${ctx.lookbackDays} days of quantity × (price paid − ${name(ctx, best.vendorId)}'s latest price)` : 'Quantities missing, so the cost of the price gap cannot be computed',
        },
        facts: {
          ...productFacts(ctx, pid),
          lookbackDays: ctx.lookbackDays,
          vendor: {
            vendorId: v.vendorId,
            vendorName: name(ctx, v.vendorId),
            latestPurchasePrice: round(lp.price, 4),
            latestPurchaseDate: isoDate(lp.date),
            purchaseLines: st.n,
            quantity: st.qty > 0 ? round(st.qty, 4) : null,
            spend: round(st.spend, 2),
          },
          peer: { vendorId: best.vendorId, vendorName: name(ctx, best.vendorId), price: round(best.price, 4), priceKind: best.kind, date: isoDate(best.date) },
          premiumPct: round(premium, 2),
          premiumPerUnit: round(lp.price - best.price, 4),
          comparison: { monthsCompared: shared.length, monthsHigher: higher, higherRatio: round(ratio, 2) },
          impactAmountInr: savings,
          suppliers: [...vendors.values()].sort((a, b) => a.price - b.price).map((x) => ({ vendorId: x.vendorId, vendorName: name(ctx, x.vendorId), latestPrice: round(x.price, 4), priceKind: x.kind, date: isoDate(x.date) })),
        },
        rfq: {
          productId: pid,
          targetQuantity: st.qty > 0 ? round(st.qty, 4) : null,
          quantityBasis: `Quantity purchased from ${name(ctx, v.vendorId)} in the last ${ctx.lookbackDays} days`,
          referencePrice: round(best.price, 4),
          referencePriceBasis: `${name(ctx, best.vendorId)}'s latest ${best.kind === 'purchase' ? 'purchase' : 'quoted'} price`,
          currentVendorIds: [v.vendorId],
          suggestedVendorIds: peerIds,
        },
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ 3. spend fragmentation

/** A product bought from `minVendors`+ suppliers within the look-back where consolidating volume could help. */
export function detectFragmentation(pts: Pt[], ctx: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const denseByCategory = new Map<string, Array<{ pid: string; purchases: Pt[]; all: Pt[] }>>();
  const since = ctx.asOf.getTime() - ctx.fragmentationDays * DAY_MS;
  for (const [pid, all] of groupByProduct(pts)) {
    const purchases = all.filter((r) => r.kind === 'purchase' && r.date.getTime() > since);
    const vendors = [...latestByVendor(purchases).values()];
    if (vendors.length < ctx.minVendors) continue;
    const cat = ctx.products.get(pid)?.category;
    if (cat && isNoisy(all)) {
      (denseByCategory.get(cat) ?? denseByCategory.set(cat, []).get(cat)!).push({ pid, purchases, all });
      continue;
    }
    const rows = vendors.map((v) => {
      const lp = latestPurchase(v)!;
      const st = priceStats(v.purchases);
      return { v, lp, st, orders: new Set(v.purchases.map((p, i) => p.reference ?? `l${i}`)).size };
    });
    const totalSpend = rows.reduce((n, r) => n + r.st.spend, 0);
    const totalQty = rows.reduce((n, r) => n + r.st.qty, 0);
    const best = rows.reduce((b, r) => (r.lp.price < b.lp.price || (r.lp.price === b.lp.price && r.st.qty > b.st.qty) ? r : b));
    const complete = rows.every((r) => r.st.qtyComplete);
    const savings = complete ? round(rows.reduce((n, r) => n + r.st.qty * Math.max(0, r.lp.price - best.lp.price), 0), 2) : null;
    const totalOrders = rows.reduce((n, r) => n + r.orders, 0);
    let severity: Level = vendors.length >= 5 ? 'HIGH' : vendors.length === 4 ? 'MEDIUM' : 'LOW';
    if (savings != null && ctx.tenantSpend > 0 && savings / ctx.tenantSpend >= 0.02) severity = bump(severity);
    const confidence: Level = complete && totalOrders >= 6 ? 'HIGH' : complete ? 'MEDIUM' : 'LOW';
    const vendorIds = vendors.map((v) => v.vendorId);
    out.push({
      type: 'CONSOLIDATION',
      fingerprint: `consolidation:${pid}`,
      severity,
      confidence,
      entities: { productIds: [pid], vendorIds },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: {
        kind: savings != null && savings > 0 ? 'savings' : 'none',
        amountInr: savings,
        pct: totalSpend > 0 && savings != null ? round((savings / totalSpend) * 100, 2) : null,
        basis: savings != null ? `Σ quantity × (supplier's latest price − lowest latest price among these suppliers), last ${ctx.fragmentationDays} days. Excludes any volume discount, which is not assumed.` : 'Quantities missing on some purchases, so the saving cannot be computed',
      },
      facts: {
        ...productFacts(ctx, pid),
        windowDays: ctx.fragmentationDays,
        vendorCount: vendors.length,
        totalQuantity: round(totalQty, 4),
        totalSpend: round(totalSpend, 2),
        topVendorSharePct: totalSpend > 0 ? round((Math.max(...rows.map((r) => r.st.spend)) / totalSpend) * 100, 1) : null,
        vendors: rows
          .sort((a, b) => b.st.spend - a.st.spend)
          .map((r) => ({ vendorId: r.v.vendorId, vendorName: name(ctx, r.v.vendorId), orders: r.orders, quantity: round(r.st.qty, 4), spend: round(r.st.spend, 2), sharePct: totalSpend > 0 ? round((r.st.spend / totalSpend) * 100, 1) : null, latestPrice: round(r.lp.price, 4), latestDate: isoDate(r.lp.date) })),
        bestVendor: { vendorId: best.v.vendorId, vendorName: name(ctx, best.v.vendorId), price: round(best.lp.price, 4) },
        savingsAtBestPrice: savings,
        impactAmountInr: savings,
      },
      rfq: {
        productId: pid,
        targetQuantity: totalQty > 0 ? round(totalQty, 4) : null,
        quantityBasis: `Total quantity purchased across ${vendors.length} suppliers in the last ${ctx.fragmentationDays} days`,
        referencePrice: round(best.lp.price, 4),
        referencePriceBasis: `Lowest latest purchase price among current suppliers (${name(ctx, best.v.vendorId)})`,
        currentVendorIds: vendorIds,
        suggestedVendorIds: suggestVendors(all.filter((r) => r.date.getTime() > since), new Set(vendorIds)),
      },
    });
  }
  // dense, frequently-bought items: one insight per category, savings from robust per-supplier MEDIAN prices
  for (const [category, items] of denseByCategory) {
    const perItem = items.map(({ pid, purchases }) => {
      const byV = new Map<string, Pt[]>();
      for (const p of purchases) if (p.vendorId) (byV.get(p.vendorId) ?? byV.set(p.vendorId, []).get(p.vendorId)!).push(p);
      const stats = [...byV.entries()].map(([vid, ls]) => ({ vid, n: ls.length, qty: ls.reduce((n, l) => n + (l.qty ?? 0), 0), spend: ls.reduce((n, l) => n + (l.amount ?? l.price * (l.qty ?? 0)), 0), med: median(ls.map((l) => l.price))! }));
      const solid = stats.filter((x) => x.n >= 3);
      const best = solid.length ? solid.reduce((b, x) => (x.med < b.med ? x : b)) : null;
      const saving = best ? solid.reduce((n, x) => n + x.qty * Math.max(0, x.med - best.med), 0) : 0;
      const spend = stats.reduce((n, x) => n + x.spend, 0);
      return { pid, vendorCount: stats.length, spend, best, saving, qty: stats.reduce((n, x) => n + x.qty, 0), top: [...stats].sort((a, b) => b.spend - a.spend) };
    });
    const vendorSet = new Set(items.flatMap((i) => i.purchases.map((p) => p.vendorId).filter((v): v is string => Boolean(v))));
    const totalSpend = perItem.reduce((n, i) => n + i.spend, 0);
    const savings = round(perItem.reduce((n, i) => n + i.saving, 0), 2);
    const avgVendors = perItem.reduce((n, i) => n + i.vendorCount, 0) / perItem.length;
    const share = ctx.tenantSpend > 0 ? savings / ctx.tenantSpend : 0;
    const topItem = [...perItem].sort((a, b) => b.spend - a.spend)[0]!;
    out.push({
      type: 'CONSOLIDATION',
      fingerprint: `consolidation:category:${category}`,
      severity: share >= 0.02 ? 'HIGH' : avgVendors >= 5 ? 'MEDIUM' : 'LOW',
      confidence: 'LOW', // prices are noisy; the saving is indicative (median-based, no volume discount assumed)
      entities: { productIds: perItem.map((i) => i.pid).slice(0, 25), vendorIds: [...vendorSet].slice(0, 15) },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: {
        kind: savings > 0 ? 'savings' : 'none',
        amountInr: savings,
        pct: totalSpend > 0 ? round((savings / totalSpend) * 100, 2) : null,
        basis: `Indicative: Σ per item of quantity × (supplier's median price − lowest supplier median, suppliers with 3+ lines), last ${ctx.fragmentationDays} days. No volume discount assumed.`,
      },
      facts: {
        scope: 'category',
        category,
        productCount: perItem.length,
        vendorCount: vendorSet.size,
        avgVendorsPerItem: round(avgVendors, 1),
        windowDays: ctx.fragmentationDays,
        totalSpend: round(totalSpend, 2),
        savingsAtBestMedian: savings,
        impactAmountInr: savings,
        items: [...perItem]
          .sort((a, b) => b.saving - a.saving)
          .slice(0, 6)
          .map((i) => ({ productId: i.pid, productName: ctx.products.get(i.pid)?.name ?? 'Unknown product', vendorCount: i.vendorCount, spend: round(i.spend, 2), bestVendorName: i.best ? name(ctx, i.best.vid) : null, bestMedianPrice: i.best ? round(i.best.med, 4) : null, saving: round(i.saving, 2) })),
      },
      rfq: {
        productId: topItem.pid,
        targetQuantity: topItem.qty > 0 ? round(topItem.qty, 4) : null,
        quantityBasis: `Total quantity of this item bought across ${topItem.vendorCount} suppliers in the last ${ctx.fragmentationDays} days`,
        referencePrice: topItem.best ? round(topItem.best.med, 4) : null,
        referencePriceBasis: topItem.best ? `Lowest supplier median price (${name(ctx, topItem.best.vid)})` : null,
        currentVendorIds: topItem.top.slice(0, 5).map((x) => x.vid),
        suggestedVendorIds: topItem.best ? [topItem.best.vid] : [],
      },
    });
  }
  return out;
}

// ------------------------------------------------------------------ 4. reorder & stockout runway

/** Products whose estimated stock is at/below the reorder point. Skips products whose purchasing has gone quiet (> 2.5x cadence). */
export function detectReorder(pts: Pt[], ctx: DetectCtx): { signals: Signal[]; skippedQuiet: number } {
  const out: Signal[] = [];
  let skippedQuiet = 0;
  for (const [pid, rows] of groupByProduct(pts)) {
    const info = ctx.products.get(pid);
    const purchases = rows.filter((r) => r.kind === 'purchase' && (r.qty ?? 0) > 0);
    const consumption = consumptionFromPurchases(purchases.map((p) => ({ date: p.date, qty: p.qty as number })));
    if (!consumption || consumption.ordersConsidered < 3) continue; // two orders are too little evidence for an alert
    const last = purchases[purchases.length - 1]!;
    const lastDay = Math.floor(last.date.getTime() / DAY_MS);
    const lastOrderQty = purchases.filter((p) => Math.floor(p.date.getTime() / DAY_MS) === lastDay).reduce((n, p) => n + (p.qty as number), 0);
    const daysSince = Math.max(0, (ctx.asOf.getTime() - last.date.getTime()) / DAY_MS);
    if (daysSince > 2.5 * consumption.avgDaysBetweenOrders) {
      skippedQuiet += 1;
      continue;
    }
    const measured = info?.leadTimeDays == null ? measuredLeadTime(rows, ctx.asOf) : null;
    const leadTimeDays = info?.leadTimeDays ?? measured ?? DEFAULT_LEAD_TIME_DAYS;
    const plan = planReorder({ consumption, lastOrderQty, daysSinceLastOrder: daysSince, asOf: ctx.asOf, leadTimeDays, safetyStockDays: info?.safetyStockDays ?? null });
    if (plan.status === 'ok') continue;
    const runway = plan.daysOfCoverRemaining;
    const leadConfigured = info?.leadTimeDays != null || measured != null;
    const leadSource = info?.leadTimeDays != null ? 'configured' : measured != null ? 'measured' : 'assumed_default';
    // stock on hand is an estimate from purchase cadence: HIGH needs a buyer-confirmed (configured) lead time
    const severity: Level = runway != null && runway < leadTimeDays && leadSource === 'configured' ? 'HIGH' : plan.status === 'order_now' || (runway != null && runway < leadTimeDays) ? 'MEDIUM' : 'LOW';
    const confidence: Level = leadConfigured && consumption.ordersConsidered >= 3 ? 'HIGH' : leadConfigured || consumption.ordersConsidered >= 3 ? 'MEDIUM' : 'LOW';
    const vendors = latestByVendor(rows.filter((r) => ctx.asOf.getTime() - r.date.getTime() <= ctx.lookbackDays * DAY_MS));
    const best = [...vendors.values()].sort((a, b) => a.price - b.price)[0];
    const price = best?.price ?? last.price;
    const orderValue = round(plan.recommendedOrderQty * price, 2);
    const currentVendors = [...new Set(purchases.slice(-3).map((p) => p.vendorId).filter((v): v is string => Boolean(v)))];
    out.push({
      type: 'REORDER_ALERT',
      fingerprint: `reorder:${pid}`,
      severity,
      confidence,
      entities: { productIds: [pid], vendorIds: currentVendors },
      window: { from: isoDate(purchases[0]!.date), to: isoDate(ctx.asOf) },
      impact: { kind: 'risk', amountInr: orderValue, pct: null, basis: `Recommended order quantity × the lowest latest price (${round(price, 4)} per ${info?.baseUnit ?? 'unit'}); this is value at stake, not a saving` },
      facts: {
        ...productFacts(ctx, pid),
        status: plan.status,
        velocityPerDay: round(consumption.velocityPerDay, 4),
        ordersConsidered: consumption.ordersConsidered,
        avgDaysBetweenOrders: round(consumption.avgDaysBetweenOrders, 1),
        leadTimeDays,
        leadTimeSource: leadSource,
        safetyStock: plan.safetyStock,
        safetyStockMethod: plan.safetyStockMethod,
        reorderPoint: plan.reorderPoint,
        estimatedStock: plan.estimatedStockOnHand,
        runwayDays: runway,
        orderByDate: plan.orderByDate ? isoDate(plan.orderByDate) : null,
        recommendedOrderQty: plan.recommendedOrderQty,
        lastOrderDate: isoDate(last.date),
        lastOrderQty: round(lastOrderQty, 4),
        daysSinceLastOrder: round(daysSince, 1),
        estimatedOrderValue: orderValue,
        impactAmountInr: orderValue,
        assumptions: ['Consumption is estimated from purchase volume; stock on hand is not tracked.', leadSource === 'configured' ? 'Lead time is configured for this product.' : leadSource === 'measured' ? 'Lead time is the 75th percentile of measured purchase-order lead times over the last 12 months.' : 'Lead time is an assumed default (not captured by the data sources).'],
      },
      rfq: {
        productId: pid,
        targetQuantity: plan.recommendedOrderQty,
        quantityBasis: 'Recommended reorder quantity (one typical purchase cycle of estimated demand)',
        referencePrice: round(price, 4),
        referencePriceBasis: best ? `Lowest latest price on record (${name(ctx, best.vendorId)})` : 'Latest purchase price',
        currentVendorIds: currentVendors,
        suggestedVendorIds: suggestVendors(rows, new Set(currentVendors)),
      },
    });
  }
  return { signals: out, skippedQuiet };
}

// ------------------------------------------------------------------ 5. verified external benchmark

/**
 * Verified (sourced, attested) external prices below what we currently pay by >= 3%. Only `verified` benchmarks that are
 * <= 180 days old at `asOf` are used. Savings are GROSS: freight, duties, switching and qualification costs are excluded.
 */
export function detectMarketSavings(pts: Pt[], ctx: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const byProduct = groupByProduct(pts);
  const asOfMs = ctx.asOf.getTime();
  for (const b of ctx.benchmarks) {
    if (!b.verified || !b.sourceUrl) continue;
    const ageDays = (asOfMs - b.observedAt.getTime()) / DAY_MS;
    if (ageDays < 0 || ageDays > 180) continue;
    const rows = byProduct.get(b.productId) ?? [];
    const since = asOfMs - ctx.lookbackDays * DAY_MS;
    const purchases = rows.filter((r) => r.kind === 'purchase' && r.date.getTime() > since);
    if (!purchases.length) continue;
    const lp = purchases[purchases.length - 1]!;
    const premium = ((lp.price - b.priceBase) / b.priceBase) * 100;
    if (premium < THRESHOLDS.benchmarkPct) continue;
    const st = priceStats(purchases);
    const gross = st.qty > 0 ? round(purchases.reduce((n, p) => n + (p.qty ?? 0) * Math.max(0, p.price - b.priceBase), 0), 2) : null;
    const lastAge = (asOfMs - lp.date.getTime()) / DAY_MS;
    const confidence: Level = ageDays <= 30 && lastAge <= 90 ? 'HIGH' : ageDays <= 90 ? 'MEDIUM' : 'LOW';
    let severity = tier(premium, [8, 15]);
    if (gross != null && ctx.tenantSpend > 0 && gross / ctx.tenantSpend >= 0.03) severity = bump(severity);
    const info = productFacts(ctx, b.productId);
    out.push({
      type: 'MARKET_SAVINGS',
      fingerprint: `market:${b.productId}:${b.id}`,
      severity,
      confidence,
      entities: { productIds: [b.productId], vendorIds: lp.vendorId ? [lp.vendorId] : [] },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: {
        kind: gross != null ? 'savings' : 'none',
        amountInr: gross,
        pct: round(premium, 2),
        basis: gross != null ? `GROSS: Σ quantity × (price paid − verified benchmark price) over purchases in the last ${ctx.lookbackDays} days. Excludes freight, duties and switching costs.` : 'Quantities missing, so the gross saving cannot be computed',
      },
      facts: {
        ...info,
        lookbackDays: ctx.lookbackDays,
        benchmark: { benchmarkId: b.id, price: round(b.priceBase, 4), sourceName: b.sourceName, sourceUrl: b.sourceUrl, observedAt: isoDate(b.observedAt), ageDays: round(ageDays, 0), verifiedBy: b.verifiedBy, verifiedAt: b.verifiedAt ? isoDate(b.verifiedAt) : null, notes: b.notes },
        paid: { latestPrice: round(lp.price, 4), latestDate: isoDate(lp.date), vendorId: lp.vendorId, vendorName: name(ctx, lp.vendorId), avgPrice: round(st.avg, 4), quantity: st.qty > 0 ? round(st.qty, 4) : null },
        premiumPct: round(premium, 2),
        premiumPerUnit: round(lp.price - b.priceBase, 4),
        grossSavings: gross,
        impactAmountInr: gross,
        caveat: 'Gross savings: excludes freight, duties and switching costs.',
      },
      rfq: {
        productId: b.productId,
        targetQuantity: st.qty > 0 ? round(st.qty, 4) : null,
        quantityBasis: `Quantity purchased in the last ${ctx.lookbackDays} days`,
        referencePrice: round(b.priceBase, 4),
        referencePriceBasis: `Verified external benchmark (${b.sourceName})`,
        currentVendorIds: lp.vendorId ? [lp.vendorId] : [],
        suggestedVendorIds: suggestVendors(rows, new Set(lp.vendorId ? [lp.vendorId] : [])),
      },
    });
  }
  return out;
}

/** The feed stays actionable: at most this many insights per type per scan (most severe, then largest impact, first). */
export const MAX_PER_TYPE = 8;

export function capPerType(signals: Signal[], max: number): { kept: Signal[]; suppressed: Record<string, number> } {
  const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  const byType = new Map<string, Signal[]>();
  for (const s of signals) (byType.get(s.type) ?? byType.set(s.type, []).get(s.type)!).push(s);
  const kept: Signal[] = [];
  const suppressed: Record<string, number> = {};
  for (const [type, list] of byType) {
    list.sort((a, b) => rank[b.severity] - rank[a.severity] || (b.impact.amountInr ?? 0) - (a.impact.amountInr ?? 0));
    kept.push(...list.slice(0, max));
    if (list.length > max) suppressed[type] = list.length - max;
  }
  return { kept, suppressed };
}

export function detectAll(pts: Pt[], ctx: DetectCtx): { signals: Signal[]; skippedQuiet: number; suppressed: Record<string, number> } {
  const reorder = detectReorder(pts, ctx);
  const currency = ctx.currency ?? 'INR';
  const found = [
    ...detectCostCreep(pts, ctx),
    ...detectSupplierVariance(pts, ctx),
    ...detectFragmentation(pts, ctx),
    ...reorder.signals,
    ...detectMarketSavings(pts, ctx),
    ...detectSourcingShift(pts, ctx),
    ...detectDeliveryRisk(pts, ctx),
    ...detectMaverickSpend(pts, ctx),
    ...detectBudgetOverrun(pts, ctx),
    ...detectSupplyRisk(pts, ctx),
  ];
  const { kept: all, suppressed } = capPerType(found, MAX_PER_TYPE);
  return {
    signals: all.map((s) => ({ ...s, facts: { ...s.facts, currency } })),
    skippedQuiet: reorder.skippedQuiet,
    suppressed,
  };
}

export type { Impact };
