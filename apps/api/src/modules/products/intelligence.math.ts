/**
 * Pure product-economics helpers. No database access, so they are unit-tested directly.
 * Prices are in the tenant's base currency per base unit; quantities are in the product's base unit.
 */
import { DAY_MS, coefficientOfVariation, round, stabilityFromCv } from '../vendors/intelligence.math';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ------------------------------------------------------------------ price series & fluctuation

export const monthIndex = (period: string): number => {
  const [y, m] = period.split('-');
  return Number(y) * 12 + Number(m) - 1;
};

export interface PeriodPrice {
  period: string; // YYYY-MM
  avgPrice: number;
}

export interface PeriodChange extends PeriodPrice {
  /** Change vs the previous recorded period, expressed per month when periods are not adjacent. */
  changePct: number | null;
}

/** Month-over-month changes. Gaps between recorded months are annualised geometrically to a per-month rate. */
export function monthlyChanges(series: PeriodPrice[]): PeriodChange[] {
  const sorted = [...series].sort((a, b) => a.period.localeCompare(b.period));
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.avgPrice <= 0 || p.avgPrice <= 0) return { ...p, changePct: null };
    const gap = Math.max(1, monthIndex(p.period) - monthIndex(prev.period));
    return { ...p, changePct: round((Math.pow(p.avgPrice / prev.avgPrice, 1 / gap) - 1) * 100, 2) };
  });
}

/** Least-squares slope per period as a percentage of the mean (needs 2+ points). */
export function trendPctPerPeriod(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (mean <= 0) return null;
  const xm = (n - 1) / 2;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - xm) * (v - mean);
    den += (i - xm) ** 2;
  });
  return round((num / den / mean) * 100, 2);
}

export type TrendLabel = 'rising' | 'falling' | 'flat' | 'insufficient_data';
export const classifyTrend = (pctPerPeriod: number | null, flatBand = 0.5): TrendLabel =>
  pctPerPeriod == null ? 'insufficient_data' : pctPerPeriod > flatBand ? 'rising' : pctPerPeriod < -flatBand ? 'falling' : 'flat';

export function stdDevSample(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((n, v) => n + (v - mean) ** 2, 0) / (values.length - 1));
}

// ------------------------------------------------------------------ vendor scoring

export const SCORE_WEIGHTS = { price: 0.5, stability: 0.25, reliability: 0.25 } as const;

export interface ScoreInput {
  vendorId: string;
  lastPrice: number;
  lastDate: Date | null;
  avg: number;
  std: number | null;
  /** all price observations (purchases + quotes) */
  count: number;
  /** of which actual purchases */
  purchaseCount: number;
}

export interface VendorScore {
  vendorId: string;
  composite: number;
  priceScore: number;
  stabilityScore: number;
  reliabilityScore: number;
  volatilityCv: number | null;
  rank: number;
}

/**
 * Composite supplier score for one product, 0–100:
 *   50% price      = 100 × lowestLatestPrice / vendorLatestPrice
 *   25% stability  = price-stability index (50 when there are too few points to judge)
 *   25% reliability = PROXY from evidence: 60% depth (purchases count fully, quotes half, saturating at 5) +
 *                     40% recency (100 at the product's newest observation, falling to 0 over 180 days behind it).
 * Delivery/quality performance is not captured by any ingestion source, so reliability is only a proxy.
 */
export function scoreVendors(rows: ScoreInput[]): VendorScore[] {
  if (!rows.length) return [];
  const minPrice = Math.min(...rows.map((r) => r.lastPrice));
  const newest = Math.max(...rows.map((r) => r.lastDate?.getTime() ?? 0));
  return rows
    .map((r) => {
      const cv = coefficientOfVariation(r.std, r.avg, r.count);
      const priceScore = r.lastPrice > 0 ? (100 * minPrice) / r.lastPrice : 0;
      const stabilityScore = stabilityFromCv(cv).index ?? 50;
      const depth = Math.min(1, (r.purchaseCount + 0.5 * (r.count - r.purchaseCount)) / 5) * 100;
      const behindDays = r.lastDate && newest ? (newest - r.lastDate.getTime()) / DAY_MS : 0;
      const recency = clamp(100 - (behindDays / 180) * 100, 0, 100);
      const reliabilityScore = 0.6 * depth + 0.4 * recency;
      const composite = SCORE_WEIGHTS.price * priceScore + SCORE_WEIGHTS.stability * stabilityScore + SCORE_WEIGHTS.reliability * reliabilityScore;
      return {
        vendorId: r.vendorId,
        lastPrice: r.lastPrice,
        composite: round(composite, 1),
        priceScore: round(priceScore, 1),
        stabilityScore: round(stabilityScore, 1),
        reliabilityScore: round(reliabilityScore, 1),
        volatilityCv: cv,
      };
    })
    .sort((a, b) => b.composite - a.composite || a.lastPrice - b.lastPrice)
    .map(({ lastPrice: _lp, ...rest }, i) => ({ ...rest, rank: i + 1 }));
}

// ------------------------------------------------------------------ consumption & reorder

export interface PurchaseEvent {
  date: Date;
  qty: number;
}

export interface Consumption {
  velocityPerDay: number;
  avgOrderQty: number;
  avgDaysBetweenOrders: number;
  ordersConsidered: number;
  /** demand rate (units/day) over each interval between consecutive orders */
  intervalRates: number[];
}

/**
 * Consumption velocity proxy from purchase history (stock movements are not tracked). Stock bought at order i is
 * assumed to be consumed until order i+1, so velocity = (sum of all quantities except the last) / (last - first date).
 * Same-day orders are merged. Needs 2+ distinct order dates.
 */
export function consumptionFromPurchases(purchases: PurchaseEvent[]): Consumption | null {
  const byDay = new Map<number, number>();
  for (const p of purchases) {
    if (p.qty <= 0) continue;
    const day = Math.floor(p.date.getTime() / DAY_MS) * DAY_MS;
    byDay.set(day, (byDay.get(day) ?? 0) + p.qty);
  }
  const events = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  if (events.length < 2) return null;
  const spanDays = (events[events.length - 1]![0] - events[0]![0]) / DAY_MS;
  if (spanDays <= 0) return null;
  const consumed = events.slice(0, -1).reduce((n, e) => n + e[1], 0);
  const intervalRates: number[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    const gap = (events[i + 1]![0] - events[i]![0]) / DAY_MS;
    if (gap > 0) intervalRates.push(events[i]![1] / gap);
  }
  return {
    velocityPerDay: consumed / spanDays,
    avgOrderQty: events.reduce((n, e) => n + e[1], 0) / events.length,
    avgDaysBetweenOrders: spanDays / (events.length - 1),
    ordersConsidered: events.length,
    intervalRates,
  };
}

export const SERVICE_LEVEL_Z = 1.65; // ~95% service level
export const DEFAULT_LEAD_TIME_DAYS = 14;

export type ReorderStatus = 'order_now' | 'order_soon' | 'ok' | 'insufficient_data';
export type SafetyMethod = 'configured_days' | 'statistical' | 'fallback_percentage';

export interface ReorderPlan {
  status: ReorderStatus;
  leadTimeDays: number;
  safetyStock: number;
  safetyStockMethod: SafetyMethod;
  reorderPoint: number;
  recommendedOrderQty: number;
  coverDays: number;
  estimatedStockOnHand: number;
  daysOfCoverRemaining: number | null;
  orderByDate: Date | null;
}

/**
 *  reorder point  = velocity × leadTime + safety stock
 *  safety stock   = configured days × velocity, else z × σ(interval demand) × √leadTime (3+ orders), else 25% of lead-time demand
 *  order quantity = velocity × typical cycle (the historical mean days between orders), rounded up
 *  stock on hand  = last order quantity − velocity × days since it (assumes it was received in full and nothing was left before)
 * "order_now" when estimated stock <= reorder point; "order_soon" within 14 days of consumption above it.
 */
export function planReorder(input: {
  consumption: Consumption;
  lastOrderQty: number;
  daysSinceLastOrder: number;
  asOf: Date;
  leadTimeDays: number;
  safetyStockDays: number | null;
}): ReorderPlan {
  const { consumption: c, leadTimeDays: L } = input;
  const v = c.velocityPerDay;
  let safetyStock: number;
  let safetyStockMethod: SafetyMethod;
  const sigma = stdDevSample(c.intervalRates);
  if (input.safetyStockDays != null) {
    safetyStock = v * input.safetyStockDays;
    safetyStockMethod = 'configured_days';
  } else if (sigma != null && c.ordersConsidered >= 3) {
    safetyStock = SERVICE_LEVEL_Z * sigma * Math.sqrt(Math.max(L, 1));
    safetyStockMethod = 'statistical';
  } else {
    safetyStock = 0.25 * v * L;
    safetyStockMethod = 'fallback_percentage';
  }
  const reorderPoint = v * L + safetyStock;
  const coverDays = Math.max(1, c.avgDaysBetweenOrders);
  const recommendedOrderQty = Math.ceil(v * coverDays);
  const stock = Math.max(0, input.lastOrderQty - v * Math.max(0, input.daysSinceLastOrder));
  const daysAbove = v > 0 ? (stock - reorderPoint) / v : null;
  const status: ReorderStatus = stock <= reorderPoint ? 'order_now' : stock <= reorderPoint + v * 14 ? 'order_soon' : 'ok';
  return {
    status,
    leadTimeDays: L,
    safetyStock: round(safetyStock, 1),
    safetyStockMethod,
    reorderPoint: Math.ceil(reorderPoint),
    recommendedOrderQty,
    coverDays: round(coverDays, 1),
    estimatedStockOnHand: round(stock, 1),
    daysOfCoverRemaining: v > 0 ? round(stock / v, 1) : null,
    orderByDate: daysAbove == null ? null : new Date(input.asOf.getTime() + Math.max(0, daysAbove) * DAY_MS),
  };
}

/** What past purchases would have cost at `bestPrice` per unit instead of what was paid (never negative). */
export const savingsOnVolume = (spend: number, units: number, bestPrice: number): number => (units > 0 ? Math.max(0, round(spend - bestPrice * units, 2)) : 0);
