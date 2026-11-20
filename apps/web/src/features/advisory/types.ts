export type InsightType =
  | 'COST_CREEP'
  | 'SUPPLIER_VARIANCE'
  | 'CONSOLIDATION'
  | 'REORDER_ALERT'
  | 'MARKET_SAVINGS'
  | 'SOURCING_SHIFT'
  | 'DELIVERY_RISK'
  | 'MAVERICK_SPEND'
  | 'BUDGET_OVERRUN'
  | 'SUPPLY_RISK';
export type Level = 'HIGH' | 'MEDIUM' | 'LOW';
export type InsightStatus = 'ACTIVE' | 'ACTIONED' | 'DISMISSED' | 'SNOOZED';

export interface Impact {
  kind: 'savings' | 'cost_increase' | 'risk' | 'none';
  amountInr: number | null;
  pct: number | null;
  basis: string;
}

export interface Insight {
  id: string;
  type: InsightType;
  severity: Level;
  confidence: Level;
  status: InsightStatus;
  snoozedUntil?: string | null;
  stale?: boolean;
  headline: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
  generator: 'template' | 'llm';
  model?: string | null;
  fallbackReason?: string | null;
  impact: Impact;
  entities: { productIds: string[]; vendorIds: string[] };
  window?: { from?: string; to?: string };
  asOf: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
}

export interface RfqHint {
  productId: string;
  targetQuantity: number | null;
  quantityBasis: string;
  referencePrice: number | null;
  referencePriceBasis: string | null;
  currentVendorIds: string[];
  suggestedVendorIds: string[];
}

export interface InsightDetail extends Insight {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evidence: Record<string, any>;
  rfq: RfqHint | null;
  statusHistory: Array<{ status: InsightStatus; at: string; by?: string; note?: string }>;
}

export interface AdvisorySummary {
  activeTotal: number;
  byType: Record<InsightType, { count: number; potentialSavings: number }>;
  bySeverity: Record<Level, number>;
  byStatus: Record<InsightStatus, number>;
  lastScan: { finishedAt?: string; asOf?: string; asOfReason?: string; summary?: ScanResult } | null;
  llmEnabled: boolean;
  note: string;
}

export interface ScanResult {
  runId?: string;
  asOf: string;
  asOfReason: 'requested' | 'now' | 'latest_data';
  freshness: { latestObservation: string | null; daysOld: number | null };
  pointsAnalysed: number;
  signalsDetected: number;
  byType: Record<InsightType, number>;
  skippedQuietReorder: number;
  llmEnabled: boolean;
  created: number;
  updated: number;
  unchanged: number;
  reopened: number;
  markedStale: number;
  narratedByLlm: number;
  narratedByTemplate: number;
  llmFallbacks: number;
}

export interface RfqDraft {
  insightId: string;
  generatedAt: string;
  subject: string;
  items: Array<{ productId: string; name: string; sku: string | null; baseUnit: string; knownAs: string[]; targetQuantity: number | null; quantityBasis: string }>;
  suppliers: Array<{ vendorId: string; name: string; taxId: string | null; relationship: 'current' | 'alternative'; lastKnownPrice: number | null; lastKnownPriceKind: 'purchase' | 'quote' | null; lastKnownPriceDate: string | null }>;
  checklist: string[];
  internalNotes: string[];
  referencePrice: number | null;
  placeholders: string[];
  bodyText: string;
}

export interface InsightFilters {
  type?: InsightType;
  severity?: Level;
  status: InsightStatus | 'ALL';
  page: number;
}
