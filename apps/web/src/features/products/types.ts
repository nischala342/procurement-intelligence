import type { StabilityRating } from '../../shared/ui/Indicators';

export type { StabilityRating };
export type EntityStatus = 'active' | 'needs_review' | 'merged';
export type Dimension = 'count' | 'mass' | 'volume' | 'length' | 'area' | 'time' | 'data' | 'service';
export type PriceKind = 'purchase' | 'quote';
export type TrendLabel = 'rising' | 'falling' | 'flat' | 'insufficient_data';
export type ReorderStatus = 'order_now' | 'order_soon' | 'ok' | 'insufficient_data';

export type ProductSort = 'name' | '-name' | 'totalSpend' | '-totalSpend' | 'currentPrice' | '-currentPrice' | 'avgPurchasePrice' | '-avgPurchasePrice';

export interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  baseUnit: string;
  dimension: Dimension;
  status: EntityStatus;
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  summary: {
    totalSpend: number;
    spendSharePct: number | null;
    unitsPurchased: number;
    purchaseCount: number;
    avgPurchasePrice: number | null;
    currentPrice: number | null;
    currentPriceKind: PriceKind | null;
    currentPriceDate: string | null;
    primaryVendor: { id: string; name: string } | null;
    bestVendor: { id: string; name: string; score: number } | null;
    vendorCount: number;
  };
}

export interface PricePoint {
  date: string | null;
  price: number;
  kind: PriceKind;
  vendorId: string | null;
  vendorName: string | null;
  quantity: number | null;
  reference: string | null;
}

export interface VendorScoreRow {
  rank: number;
  vendorId: string;
  vendorName: string;
  score: number;
  breakdown: { price: number; stability: number; reliability: number };
  lastPrice: number;
  lastPriceKind: PriceKind;
  lastDate: string | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePoints: number;
  purchaseCount: number;
  volatilityCv: number | null;
  stability: StabilityRating;
  isCurrentSupplier: boolean;
}

export interface Savings {
  cheapestVendorId: string;
  cheapestVendorName: string;
  perUnit: number;
  pct: number;
  onHistoricalVolume: number;
}

export interface SupplierRow {
  vendorId: string;
  vendorName: string;
  productId: string;
  productName: string;
  matchType: 'identical' | 'similar';
  similarity: number;
  isBaseline: boolean;
  lastPrice: number;
  lastPriceKind: PriceKind;
  lastDate: string | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePoints: number;
  volatilityCv: number | null;
  stability: StabilityRating;
  rank: number;
  isCheapest: boolean;
  deltaVsCheapestPct: number | null;
  deltaVsBaselinePct: number | null;
}

export interface Substitute {
  product: { id: string; name: string; baseUnit: string; similarity: number };
  suppliers: SupplierRow[];
  cheapestPrice: number | null;
  cheapestVendor: string | null;
  deltaVsCurrentPct: number | null;
}

export interface Alternatives {
  baselineVendor: { id: string; name: string; lastPrice: number } | null;
  cheaperVendorCount: number;
  vendors: SupplierRow[];
  substitutes: Substitute[];
}

export interface PeriodChange {
  period: string;
  avgPrice: number;
  changePct: number | null;
}

export interface ReorderAdvice {
  status: ReorderStatus;
  reason?: string;
  leadTimeDays: number;
  leadTimeSource: 'configured' | 'assumed_default';
  safetyStockDays: number | null;
  safetyStock?: number;
  safetyStockMethod?: 'configured_days' | 'statistical' | 'fallback_percentage';
  reorderPoint?: number;
  recommendedOrderQty?: number;
  coverDays?: number;
  estimatedStockOnHand?: number;
  daysOfCoverRemaining?: number | null;
  orderByDate?: string | null;
  lastOrderDate?: string;
  estimatedOrderCost?: number | null;
  costBasisPrice?: number | null;
  assumptions?: string[];
}

export interface ProductIntelligence {
  product: { id: string; name: string; sku?: string; baseUnit: string; dimension: Dimension; status: EntityStatus; leadTimeDays: number | null; safetyStockDays: number | null };
  currency: string;
  asOf: string;
  summary: {
    totalSpend: number;
    spendSharePct: number | null;
    unitsPurchased: number;
    purchaseLines: number;
    orderCount: number;
    vendorCount: number;
    weightedAvgPurchasePrice: number | null;
    meanPurchasePrice: number | null;
    currentPrice: PricePoint | null;
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
  };
  priceComparison: { currentVsLowestPct: number | null; currentVsAveragePct: number | null };
  lowestPurchase: PricePoint | null;
  highestPurchase: PricePoint | null;
  lowestQuote: PricePoint | null;
  history: { points: PricePoint[]; truncated: boolean };
  fluctuation: {
    basis: 'purchases' | 'all_observations';
    changePct: number | null;
    avgMonthOverMonthPct: number | null;
    trendPctPerMonth: number | null;
    trend: TrendLabel;
    rangePct: number | null;
    volatilityCv: number | null;
    stability: { index: number | null; rating: StabilityRating };
    monthly: PeriodChange[];
  };
  bestVendor: (VendorScoreRow & { onlySupplier: boolean; savings: Savings | null }) | null;
  vendors: VendorScoreRow[];
  consumption: { unit: string; velocityPerDay: number; velocityPerMonth: number; avgOrderQty: number; avgDaysBetweenOrders: number; ordersConsidered: number; basis: 'purchase_volume' } | null;
  reorder: ReorderAdvice;
  alternatives: Alternatives;
  dataQuality: { leadTimes: 'configured' | 'assumed_default'; stockOnHand: 'not_tracked'; reliability: 'proxy'; purchaseLinesWithoutQuantity: number };
}
