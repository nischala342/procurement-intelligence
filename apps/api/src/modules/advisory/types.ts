export const INSIGHT_TYPES = [
  'COST_CREEP',
  'SUPPLIER_VARIANCE',
  'CONSOLIDATION',
  'REORDER_ALERT',
  'MARKET_SAVINGS',
  'SOURCING_SHIFT',
  'DELIVERY_RISK',
  'MAVERICK_SPEND',
  'BUDGET_OVERRUN',
  'SUPPLY_RISK',
] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];

export const LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Level = (typeof LEVELS)[number];
export const levelRank: Record<Level, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
export const levelFromRank = (r: number): Level => (r >= 3 ? 'HIGH' : r === 2 ? 'MEDIUM' : 'LOW');

export const INSIGHT_STATUSES = ['ACTIVE', 'ACTIONED', 'DISMISSED', 'SNOOZED'] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export interface Impact {
  /** savings = money recoverable; cost_increase = extra cost already incurred; risk = value at stake; none = not quantifiable */
  kind: 'savings' | 'cost_increase' | 'risk' | 'none';
  amountInr: number | null;
  pct: number | null;
  /** plain statement of exactly how the amount was computed */
  basis: string;
}

/** Everything the RFQ helper needs, computed deterministically by the signal engine. */
export interface RfqHint {
  productId: string;
  targetQuantity: number | null;
  quantityBasis: string;
  referencePrice: number | null;
  referencePriceBasis: string | null;
  currentVendorIds: string[];
  suggestedVendorIds: string[];
}

export interface Signal {
  type: InsightType;
  /** stable identity: re-scans update the same insight instead of duplicating it */
  fingerprint: string;
  severity: Level;
  confidence: Level;
  entities: { productIds: string[]; vendorIds: string[] };
  window: { from: string; to: string } | null;
  impact: Impact;
  /** the evidence packet: the ONLY data the narration layer may use */
  facts: Record<string, unknown>;
  rfq: RfqHint | null;
}

export interface Narration {
  headline: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
}

export const DAY_MS = 86_400_000;
export const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
