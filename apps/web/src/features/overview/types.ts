export interface Overview {
  currency: string;
  country: string | null;
  asOf: string;
  asOfReason: 'requested' | 'now' | 'latest_data';
  window: { from: string; to: string; months: number };
  kpis: {
    spend: number;
    priorSpend: number | null;
    spendChangePct: number | null;
    purchaseLines: number;
    activeSuppliers: number;
    productsBought: number;
    totalSuppliers: number;
    totalProducts: number;
    onTimePct: number | null;
    deliveriesMeasured: number;
    maverickPct: number | null;
    contractCoveragePct: number | null;
    budgetVariancePct: number | null;
  };
  monthly: Array<{ month: string; spend: number; lines: number; onTimePct: number | null; maverickSpend: number }>;
  byCategory: Array<{ category: string; spend: number; sharePct: number | null; categories: number }>;
  topSuppliers: Array<{ vendorId: string; name: string; country: string | null; spend: number; sharePct: number | null; lines: number; onTimePct: number | null }>;
  insights: { active: number; byType: Record<string, number>; bySeverity: Record<'HIGH' | 'MEDIUM' | 'LOW', number>; potentialSavings: number; costIncrease: number };
  sources: Array<{ sourceType: string; transactions: number }>;
}
