export type FrequencyStatus = 'weekly' | 'monthly' | 'quarterly' | 'occasional' | 'insufficient_data';
export type StabilityRating = 'stable' | 'moderate' | 'volatile' | 'insufficient_data';
export type VendorStatus = 'active' | 'needs_review' | 'merged';
export type Granularity = 'month' | 'quarter';

export interface VendorSummary {
  totalSpend: number;
  totalPaid: number;
  orderCount: number;
  lastPurchaseDate: string | null;
  avgDaysBetweenOrders: number | null;
  frequencyStatus: FrequencyStatus;
}

export interface DirectoryVendor {
  id: string;
  name: string;
  aliases: string[];
  taxId?: string;
  status: VendorStatus;
  paymentTermsDays: number | null;
  paymentTerms: string | null;
  summary: VendorSummary;
}

export type VendorSort = 'name' | '-name' | 'totalSpend' | '-totalSpend' | 'orderCount' | '-orderCount' | 'lastPurchaseDate' | '-lastPurchaseDate';

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
  lastDate: string | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  pricePoints: number;
  volatilityCv: number | null;
  stability: StabilityRating;
  leadTimeDays: null;
  rank: number;
  isCheapest: boolean;
  deltaVsCheapestPct: number | null;
  deltaVsBaselinePct: number | null;
}

export interface ProductComparison {
  product: { id: string; name: string; sku?: string; baseUnit: string };
  suppliers: SupplierRow[];
  alternativeCount: number;
}

export interface PricePoint {
  period: string;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  samples: number;
}

export interface PriceSeries {
  productId: string;
  name: string;
  baseUnit: string;
  changePct: number | null;
  points: PricePoint[];
}

export interface CatalogProduct {
  productId: string;
  name: string;
  sku?: string;
  baseUnit: string;
  unitsSupplied: number;
  totalSpend: number;
  firstPrice: number;
  lastPrice: number;
  lastPriceKind: 'purchase' | 'quote';
  lastDate: string | null;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  priceChangePct: number | null;
  pricePoints: number;
  volatilityCv: number | null;
}

export interface VendorIntelligence {
  vendor: { id: string; name: string; taxId?: string; status: VendorStatus };
  currency: string;
  generatedAt: string;
  summary: {
    totalSpend: number;
    totalPaid: number;
    orderCount: number;
    invoiceLineCount: number;
    avgOrderValue: number | null;
    firstPurchaseDate: string | null;
    lastPurchaseDate: string | null;
    daysSinceLastPurchase: number | null;
    avgUnitPrice: number | null;
    productCount: number;
  };
  frequency: { avgDaysBetweenOrders: number | null; status: FrequencyStatus; ordersConsidered: number };
  paymentTerms: {
    termsDays: number | null;
    label: string | null;
    source: 'configured' | 'not_set';
    avgDaysToPay: number | null;
    onTimeRate: number | null;
    invoicesPaid: number;
    invoicesOutstanding: number;
    outstandingAmount: number;
    unappliedCredit: number;
    method: 'fifo-estimate';
  };
  priceConsistency: { volatilityCv: number | null; stabilityIndex: number | null; rating: StabilityRating; productsAssessed: number };
  priceHistory: { granularity: Granularity; inflationPct: number | null; series: PriceSeries[] };
  products: CatalogProduct[];
  alternatives: { comparedProducts: number; productsWithAlternatives: number; items: ProductComparison[] };
  dataQuality: { invoiceLinesWithoutBaseAmount: number; leadTimes: 'not_captured'; duplicatePaymentsExcluded: number };
}

export interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  baseUnit: string;
}
