import { Types } from 'mongoose';
import { tenantCurrency } from '../auth/tenantSettings';
import { ProductModel } from '../products/model';
import { TransactionModel } from '../transactions/model';
import { VendorModel } from '../vendors/model';
import { BenchmarkModel } from './model';
import { detectAll, type BenchmarkInfo, type DetectCtx, type ProductInfo, type Pt, type VendorProfileInfo } from './signals.math';
import { DAY_MS, isoDate, type Signal } from './types';

/**
 * Deterministic signal engine: loads the tenant's normalised price points once (a single tenant-matched aggregation),
 * then runs the pure detectors in `signals.math.ts`. No LLM is involved at this stage.
 */

const PRICE_KINDS = ['invoice_line', 'price_quote'];
const MAX_POINTS = 200_000;
const STALE_DATA_DAYS = 45;

export interface ScanOptions {
  asOf?: Date;
  windowDays?: number;
  minVendors: number;
  lookbackDays?: number;
  fragmentationDays?: number;
}

export interface Freshness {
  latestObservation: string | null;
  daysOld: number | null;
}

export interface SignalRun {
  signals: Signal[];
  asOf: Date;
  asOfReason: 'requested' | 'now' | 'latest_data';
  freshness: Freshness;
  pointsAnalysed: number;
  skippedQuietReorder: number;
  /** insights beyond the per-type cap (count per type), so the feed stays actionable */
  suppressedByCap: Record<string, number>;
}

const oid = (id: string) => new Types.ObjectId(id);

/** Analysis date: the requested one; else now, unless the newest price data is stale, in which case that data's date. */
export async function resolveAsOf(tenantId: string, requested?: Date): Promise<{ asOf: Date; reason: SignalRun['asOfReason']; freshness: Freshness }> {
  const latest = await TransactionModel.findOne({ tenantId: oid(tenantId), kind: { $in: PRICE_KINDS }, unitPriceBase: { $ne: null }, date: { $ne: null } })
    .sort({ date: -1 })
    .select('date')
    .lean<{ date: Date }>();
  const now = new Date();
  const daysOld = latest ? Math.floor((now.getTime() - latest.date.getTime()) / DAY_MS) : null;
  const freshness = { latestObservation: latest ? isoDate(latest.date) : null, daysOld };
  if (requested) return { asOf: requested, reason: 'requested', freshness };
  if (!latest || (daysOld ?? 0) <= STALE_DATA_DAYS) return { asOf: now, reason: 'now', freshness };
  return { asOf: latest.date, reason: 'latest_data', freshness };
}

export async function collectSignals(tenantId: string, opts: ScanOptions): Promise<SignalRun> {
  const tid = oid(tenantId);
  const { asOf, reason, freshness } = await resolveAsOf(tenantId, opts.asOf);

  const [rows, products, vendors, benchmarks, spend] = await Promise.all([
    TransactionModel.aggregate<{ productId: Types.ObjectId; vendorId?: Types.ObjectId; kind: string; date: Date; unitPriceBase: number; baseQuantity?: number; amountBase?: number; reference?: string; procurement?: Record<string, unknown> }>([
      { $match: { tenantId: tid, productId: { $exists: true }, kind: { $in: PRICE_KINDS }, unitPriceBase: { $type: 'number' }, date: { $lte: asOf } } },
      {
        $project: {
          productId: 1, vendorId: 1, kind: 1, date: 1, unitPriceBase: 1, baseQuantity: 1, amountBase: 1, reference: 1,
          'procurement.onTime': 1, 'procurement.daysLate': 1, 'procurement.leadTimeDays': 1, 'procurement.maverick': 1, 'procurement.contractId': 1,
          'procurement.preferredSupplier': 1, 'procurement.singleSource': 1, 'procurement.budgetUnitPriceBase': 1,
        },
      },
      { $limit: MAX_POINTS },
    ]),
    ProductModel.find({ tenantId: tid, status: { $ne: 'merged' } }).select('name sku baseUnit leadTimeDays safetyStockDays category').lean(),
    VendorModel.find({ tenantId: tid, status: { $ne: 'merged' } }).select('name profile').lean(),
    BenchmarkModel.find({ tenantId: tid, verified: true }).lean(),
    TransactionModel.aggregate<{ total: number }>([
      { $match: { tenantId: tid, kind: 'invoice_line', date: { $lte: asOf } } },
      { $group: { _id: null, total: { $sum: '$amountBase' } } },
    ]),
  ]);

  const productMap = new Map<string, ProductInfo>(
    products.map((p) => [String(p._id), { id: String(p._id), name: p.name, ...(p.sku ? { sku: p.sku } : {}), baseUnit: p.baseUnit, leadTimeDays: p.leadTimeDays ?? null, safetyStockDays: p.safetyStockDays ?? null, ...(p.category ? { category: p.category } : {}) }]),
  );
  const pts: Pt[] = rows
    .filter((r) => productMap.has(String(r.productId)))
    .map((r) => ({
      productId: String(r.productId),
      vendorId: r.vendorId ? String(r.vendorId) : null,
      kind: r.kind === 'invoice_line' ? ('purchase' as const) : ('quote' as const),
      date: r.date,
      price: r.unitPriceBase,
      qty: r.baseQuantity ?? null,
      amount: r.amountBase ?? null,
      reference: r.reference ?? null,
      ...(r.procurement ? { proc: r.procurement as Pt['proc'] } : {}),
    }));
  const bench: BenchmarkInfo[] = benchmarks.map((b) => ({
    id: String(b._id),
    productId: String(b.productId),
    priceBase: b.priceBase,
    sourceName: b.sourceName,
    sourceUrl: b.sourceUrl ?? null,
    observedAt: b.observedAt,
    verified: b.verified,
    verifiedBy: b.verifiedBy ?? null,
    verifiedAt: b.verifiedAt ?? null,
    notes: b.notes ?? null,
  }));

  const ctx: DetectCtx = {
    asOf,
    products: productMap,
    vendors: new Map(vendors.map((v) => [String(v._id), v.name])),
    vendorProfiles: new Map(vendors.filter((v) => v.profile).map((v) => [String(v._id), v.profile as VendorProfileInfo])),
    tenantSpend: spend[0]?.total ?? 0,
    ...(opts.windowDays ? { windowDays: opts.windowDays } : {}),
    minVendors: opts.minVendors,
    lookbackDays: opts.lookbackDays ?? 365,
    fragmentationDays: opts.fragmentationDays ?? 180,
    benchmarks: bench,
    currency: await tenantCurrency(tenantId),
  };
  const { signals, skippedQuiet, suppressed } = detectAll(pts, ctx);
  return { signals, asOf, asOfReason: reason, freshness, pointsAnalysed: pts.length, skippedQuietReorder: skippedQuiet, suppressedByCap: suppressed };
}
