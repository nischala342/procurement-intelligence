import { Types } from 'mongoose';
import { InsightModel } from '../advisory/model';
import { resolveAsOf } from '../advisory/signals.service';
import { tenantCountry, tenantCurrency } from '../auth/tenantSettings';
import { ProductModel } from '../products/model';
import { TransactionModel } from '../transactions/model';
import { VendorModel } from '../vendors/model';
import { monthKeys, pct, round, topWithOther, windowStart } from './overview.math';

interface LineAgg {
  _id: { month: string; productId: Types.ObjectId | null; vendorId: Types.ObjectId | null };
  spend: number;
  lines: number;
  deliveries: number;
  onTime: number;
  maverickSpend: number;
  contractSpend: number;
  poSpend: number;
  budgetSpend: number;
  budgetActual: number;
}
type Num = Exclude<keyof LineAgg, '_id'>;

const contractId = { $ifNull: ['$procurement.contractId', ''] };
const hasContract = { $and: [{ $gt: [{ $strLenCP: contractId }, 0] }, { $not: [{ $regexMatch: { input: contractId, regex: /^no[- ]?contract$/i } }] }] };
const hasBudget ={ $and: [{ $gt: ['$procurement.budgetUnitPriceBase', 0] }, { $gt: ['$baseQuantity', 0] }] };

/**
 * Tenant-wide procurement overview for the dashboard: what was paid (purchase lines, `amountBase` in the tenant's base
 * currency) over a trailing window ending at the analysis date (today, or the latest data when the data is old), plus
 * delivery / compliance / budget KPIs from purchase-order context and the current advisory picture.
 * Nothing is estimated: a KPI whose source fields are absent is null.
 */
export async function getOverview(tenantId: string, months: number) {
  const tid = new Types.ObjectId(tenantId);
  const { asOf, reason } = await resolveAsOf(tenantId);
  const from = windowStart(asOf, months);
  const priorFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1));

  const lineAgg = (lo: Date, hi: Date) =>
    TransactionModel.aggregate<LineAgg>([
      { $match: { tenantId: tid, kind: 'invoice_line', date: { $gte: lo, $lte: hi }, amountBase: { $type: 'number' } } },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, productId: '$productId', vendorId: '$vendorId' },
          spend: { $sum: '$amountBase' },
          lines: { $sum: 1 },
          deliveries: { $sum: { $cond: [{ $eq: [{ $type: '$procurement.onTime' }, 'bool'] }, 1, 0] } },
          onTime: { $sum: { $cond: [{ $eq: ['$procurement.onTime', true] }, 1, 0] } },
          maverickSpend: { $sum: { $cond: [{ $eq: ['$procurement.maverick', true] }, '$amountBase', 0] } },
          // "NO-CONTRACT" placeholders (as ERP exports write them) are not contracts; same rule as the sourcing scorecard
          contractSpend: { $sum: { $cond: [hasContract, '$amountBase', 0] } },
          poSpend: { $sum: { $cond: [{ $gt: ['$procurement', null] }, '$amountBase', 0] } },
          budgetSpend: { $sum: { $cond: [hasBudget, { $multiply: ['$procurement.budgetUnitPriceBase', '$baseQuantity'] }, 0] } },
          budgetActual: { $sum: { $cond: [hasBudget, { $multiply: ['$unitPriceBase', '$baseQuantity'] }, 0] } },
        },
      },
    ]);

  const [rows, prior, currency, country, insights, sources, totalProducts, totalVendors] = await Promise.all([
    lineAgg(from, asOf),
    lineAgg(priorFrom, new Date(from.getTime() - 1)),
    tenantCurrency(tenantId),
    tenantCountry(tenantId),
    InsightModel.find({ tenantId: tid, status: 'ACTIVE', stale: { $ne: true } }).select('type severity impact').lean(),
    TransactionModel.aggregate<{ _id: string; n: number }>([{ $match: { tenantId: tid } }, { $group: { _id: '$sourceType', n: { $sum: 1 } } }]),
    ProductModel.countDocuments({ tenantId: tid, status: { $ne: 'merged' } }),
    VendorModel.countDocuments({ tenantId: tid, status: { $ne: 'merged' } }),
  ]);

  const productIds = [...new Set(rows.map((r) => r._id.productId).filter(Boolean).map(String))];
  const vendorIds = [...new Set(rows.map((r) => r._id.vendorId).filter(Boolean).map(String))];
  const [products, vendors] = await Promise.all([
    ProductModel.find({ tenantId: tid, _id: { $in: productIds } }).select('category').lean(),
    VendorModel.find({ tenantId: tid, _id: { $in: vendorIds } }).select('name profile').lean(),
  ]);
  const categoryOf = new Map(products.map((p) => [String(p._id), (p as { category?: string | null }).category || 'Uncategorised']));
  const vendorOf = new Map(vendors.map((v) => [String(v._id), v as unknown as { name: string; profile?: { country?: string | null } }]));

  const sum = (xs: LineAgg[], k: Num) => xs.reduce((n, r) => n + r[k], 0);
  const spend = sum(rows, 'spend');
  const priorSpend = sum(prior, 'spend');
  const deliveries = sum(rows, 'deliveries');
  const poSpend = sum(rows, 'poSpend');
  const budgetSpend = sum(rows, 'budgetSpend');

  // monthly series: every month in the window, zero when nothing was bought
  const byMonth = new Map<string, LineAgg[]>();
  for (const r of rows) (byMonth.get(r._id.month) ?? byMonth.set(r._id.month, []).get(r._id.month)!).push(r);
  const monthly = monthKeys(from, asOf).map((month) => {
    const ms = byMonth.get(month) ?? [];
    const d = sum(ms, 'deliveries');
    return { month, spend: round(sum(ms, 'spend')), lines: sum(ms, 'lines'), onTimePct: d ? pct(sum(ms, 'onTime'), d) : null, maverickSpend: round(sum(ms, 'maverickSpend')) };
  });

  // spend by category: top 7 + "Other"
  const cat = new Map<string, number>();
  for (const r of rows) {
    const c = r._id.productId ? (categoryOf.get(String(r._id.productId)) ?? 'Uncategorised') : 'No product';
    cat.set(c, (cat.get(c) ?? 0) + r.spend);
  }
  const byCategory = topWithOther(
    [...cat].map(([category, s]) => ({ category, spend: s, categories: 1 })),
    8,
    (rest) => ({ category: 'Other', spend: rest.reduce((n, x) => n + x.spend, 0), categories: rest.length }),
  ).map((c) => ({ category: c.category, spend: round(c.spend), sharePct: pct(c.spend, spend), categories: c.categories }));

  // top suppliers by spend, with their delivery record in the same window
  const sup = new Map<string, { spend: number; lines: number; deliveries: number; onTime: number }>();
  for (const r of rows) {
    if (!r._id.vendorId) continue;
    const k = String(r._id.vendorId);
    const s = sup.get(k) ?? { spend: 0, lines: 0, deliveries: 0, onTime: 0 };
    s.spend += r.spend;
    s.lines += r.lines;
    s.deliveries += r.deliveries;
    s.onTime += r.onTime;
    sup.set(k, s);
  }
  const topSuppliers = [...sup]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 8)
    .map(([vendorId, s]) => ({
      vendorId,
      name: vendorOf.get(vendorId)?.name ?? 'Unknown supplier',
      country: vendorOf.get(vendorId)?.profile?.country ?? null,
      spend: round(s.spend),
      sharePct: pct(s.spend, spend),
      lines: s.lines,
      onTimePct: s.deliveries ? pct(s.onTime, s.deliveries) : null,
    }));

  // advisory picture: active, current insights
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  let potentialSavings = 0;
  let costIncrease = 0;
  for (const i of insights) {
    byType[i.type] = (byType[i.type] ?? 0) + 1;
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
    const amt = i.impact?.amountInr;
    if (i.impact?.kind === 'savings' && typeof amt === 'number') potentialSavings += amt;
    if (i.impact?.kind === 'cost_increase' && typeof amt === 'number') costIncrease += amt;
  }

  return {
    currency,
    country,
    asOf: asOf.toISOString().slice(0, 10),
    asOfReason: reason,
    window: { from: from.toISOString().slice(0, 10), to: asOf.toISOString().slice(0, 10), months },
    kpis: {
      spend: round(spend),
      priorSpend: priorSpend > 0 ? round(priorSpend) : null,
      spendChangePct: priorSpend > 0 ? round(((spend - priorSpend) / priorSpend) * 100, 1) : null,
      purchaseLines: sum(rows, 'lines'),
      activeSuppliers: sup.size,
      productsBought: productIds.length,
      totalSuppliers: totalVendors,
      totalProducts,
      onTimePct: deliveries ? pct(sum(rows, 'onTime'), deliveries) : null,
      deliveriesMeasured: deliveries,
      maverickPct: poSpend > 0 ? pct(sum(rows, 'maverickSpend'), poSpend) : null,
      contractCoveragePct: poSpend > 0 ? pct(sum(rows, 'contractSpend'), poSpend) : null,
      budgetVariancePct: budgetSpend > 0 ? round(((sum(rows, 'budgetActual') - budgetSpend) / budgetSpend) * 100, 1) : null,
    },
    monthly,
    byCategory,
    topSuppliers,
    insights: { active: insights.length, byType, bySeverity, potentialSavings: round(potentialSavings), costIncrease: round(costIncrease) },
    sources: sources.map((s) => ({ sourceType: s._id, transactions: s.n })).sort((a, b) => b.transactions - a.transactions),
  };
}
