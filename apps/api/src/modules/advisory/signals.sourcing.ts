/**
 * Sourcing-intelligence detectors for purchase-order data (delivery, contract, budget and supplier master data).
 *
 * Design for noisy real-world prices (in the reference dataset the same supplier's price for the same item varies by
 * ~34% while true supplier differences are ~5%): prices are compared as an INDEX (line price ÷ the item's median price),
 * pooled per category so each supplier has enough lines; differences must pass a one-sided Mann–Whitney U test;
 * delivery reliability uses Wilson score bounds. Nothing is flagged on thin or insignificant evidence.
 */
import type { DetectCtx, Pt } from './signals.math';
import { mannWhitneyLess, median, quantile, wilson } from './stats';
import { DAY_MS, isoDate, round, type Level, type Signal } from './types';

export const SOURCING = {
  minLinesPerVendor: 8,
  significance: 0.05,
  deliveryTarget: 0.85,
  maverickShare: 0.1,
  overrunShare: 0.03,
  supplyRiskShare: 0.25,
  scoreWeights: { price: 0.4, delivery: 0.3, risk: 0.15, esgCompliance: 0.15 },
} as const;

const RISK_SCORE: Record<string, number> = { low: 100, medium: 60, high: 20 };
const vName = (ctx: DetectCtx, id: string) => ctx.vendors.get(id) ?? 'Unknown supplier';
const effPrice = (p: Pt) => (p.amount != null && p.qty ? p.amount / p.qty : p.price);
const lineSpend = (p: Pt) => p.amount ?? p.price * (p.qty ?? 0);
const tierLevel = (share: number, [med, high]: [number, number]): Level => (share >= high ? 'HIGH' : share >= med ? 'MEDIUM' : 'LOW');

interface Line extends Pt {
  index: number;
  category: string;
}

/** Purchases within the window, each with its price index relative to its item's median price in that window. */
function indexedLines(pts: Pt[], ctx: DetectCtx, sinceMs: number): Line[] {
  const recent = pts.filter((p) => p.kind === 'purchase' && p.vendorId && p.date.getTime() > sinceMs && p.date.getTime() <= ctx.asOf.getTime());
  const byProduct = new Map<string, Pt[]>();
  for (const p of recent) (byProduct.get(p.productId) ?? byProduct.set(p.productId, []).get(p.productId)!).push(p);
  const out: Line[] = [];
  for (const [pid, rows] of byProduct) {
    const med = median(rows.map(effPrice));
    const category = ctx.products.get(pid)?.category;
    if (!med || !category) continue;
    for (const r of rows) out.push({ ...r, index: effPrice(r) / med, category });
  }
  return out;
}

const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
  return m;
};

export interface VendorCard {
  vendorId: string;
  vendorName: string;
  lines: number;
  medianIndex: number;
  spend: number;
  onTimeRate: number | null;
  onTimePct: number | null;
  onTimeLower: number | null;
  avgDaysLate: number | null;
  leadTimeP90: number | null;
  riskRating: string | null;
  tier: number | null;
  esgScore: number | null;
  contractCoverage: number | null;
  score: number;
}

/** Supplier scorecard over a set of lines. Composite: price 40% · delivery 30% · risk 15% · ESG & compliance 15%. */
export function vendorCard(ctx: DetectCtx, vendorId: string, lines: Line[]): VendorCard {
  const idx = lines.map((l) => l.index);
  const med = median(idx) ?? 1;
  const shrunk = (lines.length * med + 5 * 1) / (lines.length + 5); // shrink thin samples toward the market (index 1)
  const del = lines.filter((l) => l.proc?.onTime != null);
  const w = del.length ? wilson(del.filter((l) => l.proc!.onTime).length, del.length) : null;
  const late = lines.map((l) => l.proc?.daysLate).filter((d): d is number => d != null);
  const lead = lines.map((l) => l.proc?.leadTimeDays).filter((d): d is number => d != null);
  const withContract = lines.filter((l) => l.proc && 'contractId' in l.proc);
  const covered = withContract.filter((l) => l.proc!.contractId && !/^no[- ]?contract$/i.test(String(l.proc!.contractId)));
  const prof = ctx.vendorProfiles?.get(vendorId);
  const priceScore = Math.max(0, Math.min(100, ((1.3 - shrunk) / 0.6) * 100));
  const avgLate = late.length ? late.reduce((a, b) => a + b, 0) / late.length : null;
  const deliveryScore = w ? 0.7 * w.lower * 100 + 0.3 * Math.max(0, 100 - Math.max(0, avgLate ?? 0) * 5) : 50;
  const riskScore = Math.max(0, (RISK_SCORE[String(prof?.riskRating ?? '').toLowerCase()] ?? 60) - Math.max(0, ((prof?.tier ?? 1) - 1) * 10));
  const coverage = withContract.length ? covered.length / withContract.length : null;
  const esgCompliance = 0.5 * (prof?.esgScore ?? 50) + 0.5 * (coverage != null ? coverage * 100 : 50);
  const W = SOURCING.scoreWeights;
  return {
    vendorId,
    vendorName: vName(ctx, vendorId),
    lines: lines.length,
    medianIndex: round(med, 4),
    spend: round(lines.reduce((n, l) => n + lineSpend(l), 0), 2),
    onTimeRate: w ? round(w.rate, 3) : null,
    onTimePct: w ? round(w.rate * 100, 1) : null,
    onTimeLower: w ? round(w.lower, 3) : null,
    avgDaysLate: avgLate != null ? round(avgLate, 1) : null,
    leadTimeP90: lead.length ? round(quantile(lead, 0.9)!, 0) : null,
    riskRating: prof?.riskRating ?? null,
    tier: prof?.tier ?? null,
    esgScore: prof?.esgScore ?? null,
    contractCoverage: coverage != null ? round(coverage, 3) : null,
    score: round(W.price * priceScore + W.delivery * deliveryScore + W.risk * riskScore + W.esgCompliance * esgCompliance, 1),
  };
}

// ------------------------------------------------------------------ 1. best-value sourcing shift (per category)

export function detectSourcingShift(pts: Pt[], ctx: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const asOf = ctx.asOf.getTime();
  const lines = indexedLines(pts, ctx, asOf - 2 * 365 * DAY_MS);
  const since12 = asOf - 365 * DAY_MS;
  for (const [category, rows] of groupBy(lines, (l) => l.category)) {
    const byVendor = groupBy(rows, (l) => l.vendorId!);
    const spend12 = (vid: string) => (byVendor.get(vid) ?? []).filter((l) => l.date.getTime() > since12).reduce((n, l) => n + lineSpend(l), 0);
    const incumbentId = [...byVendor.keys()].sort((a, b) => spend12(b) - spend12(a))[0];
    if (!incumbentId || spend12(incumbentId) <= 0) continue;
    const inc = byVendor.get(incumbentId)!;
    if (inc.length < SOURCING.minLinesPerVendor) continue;
    const incCard = vendorCard(ctx, incumbentId, inc);

    const qualified = [...byVendor.entries()]
      .filter(([vid, ls]) => vid !== incumbentId && ls.length >= SOURCING.minLinesPerVendor)
      .map(([vid, ls]) => ({ vid, ls, test: mannWhitneyLess(ls.map((l) => l.index), inc.map((l) => l.index)), card: vendorCard(ctx, vid, ls) }))
      .filter((c) => c.test && c.test.p < SOURCING.significance && c.card.medianIndex < incCard.medianIndex)
      .filter((c) => c.card.onTimeLower == null || incCard.onTimeLower == null || c.card.onTimeLower >= incCard.onTimeLower - 0.05)
      .sort((a, b) => b.card.score - a.card.score);
    const best = qualified[0];
    if (!best) continue;

    const incSpend12 = spend12(incumbentId);
    const savingsPct = 1 - best.card.medianIndex / incCard.medianIndex;
    const savings = round(incSpend12 * savingsPct, 2);
    const share = ctx.tenantSpend > 0 ? savings / ctx.tenantSpend : 0;
    const p = best.test!.p;
    const incItems = groupBy(inc.filter((l) => l.date.getTime() > since12), (l) => l.productId);
    const topProduct = [...incItems.entries()].sort((a, b) => b[1].reduce((n, l) => n + lineSpend(l), 0) - a[1].reduce((n, l) => n + lineSpend(l), 0))[0];
    const topPid = topProduct?.[0] ?? inc[0]!.productId;
    const candOnTop = best.ls.filter((l) => l.productId === topPid);
    const others = [...byVendor.keys()].filter((v) => v !== incumbentId).map((v) => vendorCard(ctx, v, byVendor.get(v)!)).sort((a, b) => b.score - a.score);

    out.push({
      type: 'SOURCING_SHIFT',
      fingerprint: `sourcing:${category}:${incumbentId}`,
      severity: tierLevel(share, [0.003, 0.01]),
      confidence: p < 0.01 && best.ls.length >= 15 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: [...new Set(inc.map((l) => l.productId))].slice(0, 25), vendorIds: [incumbentId, best.vid] },
      window: { from: isoDate(new Date(asOf - 2 * 365 * DAY_MS)), to: isoDate(ctx.asOf) },
      impact: {
        kind: 'savings',
        amountInr: savings,
        pct: round(savingsPct * 100, 2),
        basis: `${vName(ctx, incumbentId)}'s ${category} spend in the last 12 months × (1 − ${vName(ctx, best.vid)}'s median price index ÷ ${vName(ctx, incumbentId)}'s); price indices are line price ÷ the item's median price over 24 months`,
      },
      facts: {
        category,
        incumbent: incCard,
        recommended: best.card,
        test: { method: 'Mann–Whitney U, one-sided', pValue: round(p, 4), linesRecommended: best.ls.length, linesIncumbent: inc.length, significanceLevel: SOURCING.significance },
        incumbentSpend12m: round(incSpend12, 2),
        estimatedAnnualSavings: savings,
        savingsPct: round(savingsPct * 100, 2),
        impactAmountInr: savings,
        alternatives: others.slice(0, 5),
        weights: SOURCING.scoreWeights,
      },
      rfq: {
        productId: topPid,
        targetQuantity: topProduct ? round(topProduct[1].reduce((n, l) => n + (l.qty ?? 0), 0), 4) : null,
        quantityBasis: `Quantity bought from ${vName(ctx, incumbentId)} in the last 12 months`,
        referencePrice: candOnTop.length ? round(median(candOnTop.map(effPrice))!, 4) : null,
        referencePriceBasis: candOnTop.length ? `${vName(ctx, best.vid)}'s median net price for this item` : null,
        currentVendorIds: [incumbentId],
        suggestedVendorIds: [best.vid, ...others.filter((o) => o.vendorId !== best.vid).slice(0, 2).map((o) => o.vendorId)],
      },
    });
  }
  return out;
}

// ------------------------------------------------------------------ 2. delivery reliability

export function detectDeliveryRisk(pts: Pt[], ctx: DetectCtx): Signal[] {
  const asOf = ctx.asOf.getTime();
  const since = asOf - 365 * DAY_MS;
  const lines = pts.filter((p) => p.kind === 'purchase' && p.vendorId && p.proc?.onTime != null && p.date.getTime() > since && p.date.getTime() <= asOf);
  if (lines.length < 50) return [];
  const onTime = lines.filter((l) => l.proc!.onTime).length;
  const port = wilson(onTime, lines.length)!;
  const out: Signal[] = [];
  const cards = [...groupBy(lines, (l) => l.vendorId!).entries()]
    .filter(([, ls]) => ls.length >= 20)
    .map(([vid, ls]) => {
      const w = wilson(ls.filter((l) => l.proc!.onTime).length, ls.length)!;
      const late = ls.map((l) => l.proc!.daysLate).filter((d): d is number => d != null);
      return { vid, n: ls.length, w, avgLate: late.length ? late.reduce((a, b) => a + b, 0) / late.length : null, spend: ls.reduce((n, l) => n + lineSpend(l), 0) };
    })
    .sort((a, b) => a.w.rate - b.w.rate);

  // suppliers significantly worse than the rest of the portfolio
  for (const c of cards) {
    if (c.w.upper >= port.rate) continue;
    out.push({
      type: 'DELIVERY_RISK',
      fingerprint: `delivery:vendor:${c.vid}`,
      severity: port.rate - c.w.rate >= 0.15 ? 'HIGH' : port.rate - c.w.rate >= 0.08 ? 'MEDIUM' : 'LOW',
      confidence: c.n >= 60 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: [], vendorIds: [c.vid] },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: { kind: 'risk', amountInr: round(c.spend, 2), pct: round((port.rate - c.w.rate) * 100, 1), basis: 'Spend with this supplier in the last 12 months (exposure to late deliveries)' },
      facts: { scope: 'vendor', vendorId: c.vid, vendorName: vName(ctx, c.vid), lines: c.n, onTimeRate: round(c.w.rate * 100, 1), onTimeUpper: round(c.w.upper * 100, 1), portfolioOnTimeRate: round(port.rate * 100, 1), avgDaysLate: c.avgLate != null ? round(c.avgLate, 1) : null, spend12m: round(c.spend, 2), impactAmountInr: round(c.spend, 2) },
      rfq: null,
    });
  }

  if (port.rate < SOURCING.deliveryTarget) {
    const lateLines = lines.filter((l) => !l.proc!.onTime);
    const lateSpend = lateLines.reduce((n, l) => n + lineSpend(l), 0);
    const daysLate = lateLines.map((l) => l.proc!.daysLate).filter((d): d is number => d != null && d > 0);
    out.push({
      type: 'DELIVERY_RISK',
      fingerprint: 'delivery:portfolio',
      severity: port.rate < 0.7 ? 'HIGH' : port.rate < 0.8 ? 'MEDIUM' : 'LOW',
      confidence: lines.length >= 200 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: [], vendorIds: cards.slice(0, 3).map((c) => c.vid) },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: { kind: 'risk', amountInr: round(lateSpend, 2), pct: round((SOURCING.deliveryTarget - port.rate) * 100, 1), basis: 'Spend on purchase lines delivered late in the last 12 months' },
      facts: {
        scope: 'portfolio',
        lines: lines.length,
        onTimeRate: round(port.rate * 100, 1),
        targetRate: SOURCING.deliveryTarget * 100,
        lateLines: lateLines.length,
        lateSpend: round(lateSpend, 2),
        medianDaysLate: daysLate.length ? round(median(daysLate)!, 1) : null,
        worstSuppliers: cards.slice(0, 3).map((c) => ({ vendorId: c.vid, vendorName: vName(ctx, c.vid), onTimeRate: round(c.w.rate * 100, 1), lines: c.n })),
        bestSuppliers: [...cards].reverse().slice(0, 3).map((c) => ({ vendorId: c.vid, vendorName: vName(ctx, c.vid), onTimeRate: round(c.w.rate * 100, 1), lines: c.n })),
        impactAmountInr: round(lateSpend, 2),
      },
      rfq: null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ 3. maverick / off-contract spend

export function detectMaverickSpend(pts: Pt[], ctx: DetectCtx): Signal[] {
  const asOf = ctx.asOf.getTime();
  const since = asOf - 365 * DAY_MS;
  const lines = indexedLines(pts, ctx, since).filter((l) => l.proc?.maverick != null);
  const out: Signal[] = [];
  for (const [category, rows] of groupBy(lines, (l) => l.category)) {
    const mav = rows.filter((l) => l.proc!.maverick);
    const ok = rows.filter((l) => !l.proc!.maverick);
    const total = rows.reduce((n, l) => n + lineSpend(l), 0);
    const mavSpend = mav.reduce((n, l) => n + lineSpend(l), 0);
    const share = total > 0 ? mavSpend / total : 0;
    if (mav.length < 5 || share < SOURCING.maverickShare) continue;
    // do maverick purchases cost more than compliant ones? (one-sided: compliant cheaper)
    const test = ok.length >= 5 ? mannWhitneyLess(ok.map((l) => l.index), mav.map((l) => l.index)) : null;
    const mMav = median(mav.map((l) => l.index))!;
    const mOk = ok.length ? median(ok.map((l) => l.index))! : null;
    const premiumSignificant = Boolean(test && test.p < SOURCING.significance && mOk != null && mOk < mMav);
    const saving = premiumSignificant ? round(mavSpend * (1 - (mOk as number) / mMav), 2) : null;
    const byVendor = groupBy(mav, (l) => l.vendorId!);
    out.push({
      type: 'MAVERICK_SPEND',
      fingerprint: `maverick:${category}`,
      severity: tierLevel(share, [0.15, 0.25]),
      confidence: mav.length >= 20 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: [...new Set(mav.map((l) => l.productId))].slice(0, 25), vendorIds: [...byVendor.keys()].slice(0, 10) },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: premiumSignificant
        ? { kind: 'savings', amountInr: saving, pct: round((1 - (mOk as number) / mMav) * 100, 2), basis: 'Maverick spend × (1 − compliant median price index ÷ maverick median price index), last 12 months' }
        : { kind: 'risk', amountInr: round(mavSpend, 2), pct: round(share * 100, 1), basis: 'Spend flagged as maverick (outside the approved buying process) in the last 12 months' },
      facts: {
        category,
        maverickLines: mav.length,
        compliantLines: ok.length,
        maverickSpend: round(mavSpend, 2),
        categorySpend: round(total, 2),
        maverickSharePct: round(share * 100, 1),
        maverickMedianIndex: round(mMav, 4),
        compliantMedianIndex: mOk != null ? round(mOk, 4) : null,
        premiumTest: test ? { method: 'Mann–Whitney U, one-sided', pValue: round(test.p, 4), significant: premiumSignificant } : null,
        topVendors: [...byVendor.entries()].map(([vid, ls]) => ({ vendorId: vid, vendorName: vName(ctx, vid), lines: ls.length, spend: round(ls.reduce((n, l) => n + lineSpend(l), 0), 2) })).sort((a, b) => b.spend - a.spend).slice(0, 5),
        impactAmountInr: premiumSignificant ? saving : round(mavSpend, 2),
      },
      rfq: null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ 4. budget overrun

export function detectBudgetOverrun(pts: Pt[], ctx: DetectCtx): Signal[] {
  const asOf = ctx.asOf.getTime();
  const since = asOf - 365 * DAY_MS;
  const lines = indexedLines(pts, ctx, since).filter((l) => l.proc?.budgetUnitPriceBase != null && (l.qty ?? 0) > 0);
  const out: Signal[] = [];
  for (const [category, rows] of groupBy(lines, (l) => l.category)) {
    const over = rows.filter((l) => l.price > (l.proc!.budgetUnitPriceBase as number));
    const overrun = over.reduce((n, l) => n + (l.price - (l.proc!.budgetUnitPriceBase as number)) * (l.qty as number), 0);
    const spend = rows.reduce((n, l) => n + l.price * (l.qty as number), 0);
    const share = spend > 0 ? overrun / spend : 0;
    if (over.length < 5 || share < SOURCING.overrunShare) continue;
    const byItem = groupBy(over, (l) => l.productId);
    const items = [...byItem.entries()]
      .map(([pid, ls]) => ({ productId: pid, productName: ctx.products.get(pid)?.name ?? 'Unknown product', lines: ls.length, overrun: round(ls.reduce((n, l) => n + (l.price - (l.proc!.budgetUnitPriceBase as number)) * (l.qty as number), 0), 2) }))
      .sort((a, b) => b.overrun - a.overrun);
    out.push({
      type: 'BUDGET_OVERRUN',
      fingerprint: `budget:${category}`,
      severity: tierLevel(share, [0.06, 0.1]),
      confidence: over.length >= 20 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: items.slice(0, 25).map((i) => i.productId), vendorIds: [...new Set(over.map((l) => l.vendorId!))].slice(0, 10) },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: { kind: 'cost_increase', amountInr: round(overrun, 2), pct: round(share * 100, 2), basis: 'Σ (unit price − budget unit price) × quantity over lines priced above budget, last 12 months (list price, before discounts and tax)' },
      facts: {
        category,
        linesOverBudget: over.length,
        linesWithBudget: rows.length,
        overBudgetRatePct: round((over.length / rows.length) * 100, 1),
        overrunAmount: round(overrun, 2),
        categorySpend: round(spend, 2),
        overrunSharePct: round(share * 100, 2),
        topItems: items.slice(0, 5),
        impactAmountInr: round(overrun, 2),
      },
      rfq: items[0]
        ? {
            productId: items[0].productId,
            targetQuantity: round(rows.filter((l) => l.productId === items[0]!.productId).reduce((n, l) => n + (l.qty as number), 0), 4),
            quantityBasis: 'Quantity bought in the last 12 months',
            referencePrice: round(median(rows.filter((l) => l.productId === items[0]!.productId).map((l) => l.proc!.budgetUnitPriceBase as number))!, 4),
            referencePriceBasis: 'Median budget unit price for this item',
            currentVendorIds: [...new Set(byItem.get(items[0].productId)!.map((l) => l.vendorId!))].slice(0, 3),
            suggestedVendorIds: [],
          }
        : null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ 5. supply-risk concentration

export function detectSupplyRisk(pts: Pt[], ctx: DetectCtx): Signal[] {
  if (!ctx.vendorProfiles?.size) return [];
  const asOf = ctx.asOf.getTime();
  const since = asOf - 365 * DAY_MS;
  const lines = indexedLines(pts, ctx, since);
  const risky = (vid: string) => {
    const p = ctx.vendorProfiles!.get(vid);
    return Boolean(p && (String(p.riskRating).toLowerCase() === 'high' || String(p.approvalStatus).toLowerCase() === 'conditional'));
  };
  const out: Signal[] = [];
  for (const [category, rows] of groupBy(lines, (l) => l.category)) {
    const total = rows.reduce((n, l) => n + lineSpend(l), 0);
    const atRisk = rows.filter((l) => risky(l.vendorId!));
    const riskSpend = atRisk.reduce((n, l) => n + lineSpend(l), 0);
    const share = total > 0 ? riskSpend / total : 0;
    if (atRisk.length < 5 || share < SOURCING.supplyRiskShare) continue;
    const byVendor = groupBy(rows, (l) => l.vendorId!);
    const cards = [...byVendor.entries()].filter(([, ls]) => ls.length >= 3).map(([vid, ls]) => vendorCard(ctx, vid, ls));
    const riskyCards = cards.filter((c) => risky(c.vendorId)).sort((a, b) => b.spend - a.spend);
    const safer = cards.filter((c) => !risky(c.vendorId)).sort((a, b) => b.score - a.score);
    const singleSource = rows.filter((l) => l.proc?.singleSource).length;
    out.push({
      type: 'SUPPLY_RISK',
      fingerprint: `supplyrisk:${category}`,
      severity: tierLevel(share, [0.35, 0.5]),
      confidence: atRisk.length >= 20 ? 'HIGH' : 'MEDIUM',
      entities: { productIds: [...new Set(atRisk.map((l) => l.productId))].slice(0, 25), vendorIds: riskyCards.map((c) => c.vendorId) },
      window: { from: isoDate(new Date(since)), to: isoDate(ctx.asOf) },
      impact: { kind: 'risk', amountInr: round(riskSpend, 2), pct: round(share * 100, 1), basis: 'Spend in the last 12 months with suppliers rated High risk or Conditional status' },
      facts: {
        category,
        atRiskSpend: round(riskSpend, 2),
        categorySpend: round(total, 2),
        atRiskSharePct: round(share * 100, 1),
        singleSourceLines: singleSource,
        riskySuppliers: riskyCards.slice(0, 5),
        saferAlternatives: safer.slice(0, 3),
        impactAmountInr: round(riskSpend, 2),
      },
      rfq: null,
    });
  }
  return out;
}

/** Lead time to plan with when none is configured: the 75th percentile of measured PO lead times (5+ lines, last 12 months). */
export function measuredLeadTime(rows: Pt[], asOf: Date): number | null {
  const since = asOf.getTime() - 365 * DAY_MS;
  const lt = rows.filter((r) => r.kind === 'purchase' && r.date.getTime() > since && r.proc?.leadTimeDays != null).map((r) => r.proc!.leadTimeDays as number);
  return lt.length >= 5 ? Math.round(quantile(lt, 0.75)!) : null;
}
