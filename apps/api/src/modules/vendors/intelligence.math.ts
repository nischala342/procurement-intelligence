/**
 * Pure analytics helpers for vendor intelligence. No database access, so they are unit-tested directly.
 * All money is in the tenant's base currency; all prices are per base unit.
 */

export const DAY_MS = 86_400_000;
export const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Percentage change from `from` to `to`; null when the baseline is not positive. */
export const pctChange = (from: number | null | undefined, to: number | null | undefined): number | null =>
  from != null && to != null && from > 0 ? round(((to - from) / from) * 100, 2) : null;

/** Mean number of days between consecutive orders: (last - first) / (n - 1). Null with fewer than 2 orders. */
export function meanGapDays(dates: Date[]): number | null {
  if (dates.length < 2) return null;
  const t = dates.map((d) => d.getTime()).sort((a, b) => a - b);
  return round((t[t.length - 1]! - t[0]!) / DAY_MS / (t.length - 1), 1);
}

export type FrequencyStatus = 'weekly' | 'monthly' | 'quarterly' | 'occasional' | 'insufficient_data';

export function classifyFrequency(avgDays: number | null): FrequencyStatus {
  if (avgDays == null) return 'insufficient_data';
  if (avgDays <= 10) return 'weekly';
  if (avgDays <= 45) return 'monthly';
  if (avgDays <= 135) return 'quarterly';
  return 'occasional';
}

export type StabilityRating = 'stable' | 'moderate' | 'volatile' | 'insufficient_data';

/**
 * Price stability from the coefficient of variation (std-dev / mean) of unit prices.
 * Index: 100 at CV 0, 0 at CV >= 0.5. Ratings: < 5% stable, < 15% moderate, otherwise volatile.
 */
export function stabilityFromCv(cv: number | null): { index: number | null; rating: StabilityRating } {
  if (cv == null) return { index: null, rating: 'insufficient_data' };
  return {
    index: Math.round(clamp(100 - 200 * cv, 0, 100)),
    rating: cv < 0.05 ? 'stable' : cv < 0.15 ? 'moderate' : 'volatile',
  };
}

export const coefficientOfVariation = (std: number | null | undefined, mean: number | null | undefined, count: number): number | null =>
  count >= 2 && std != null && mean != null && mean > 0 ? round(std / mean, 4) : null;

// ------------------------------------------------------------------ payment delay estimation

export interface Dated {
  date: Date;
  amount: number;
}

export interface PaidInvoice {
  invoiceDate: Date;
  paidDate: Date;
  days: number;
}

export interface PaymentAnalysis {
  paid: PaidInvoice[];
  outstandingInvoices: number;
  outstandingAmount: number;
  /** Credit left over (payments exceeding invoices), e.g. advances or invoices not ingested. */
  unappliedCredit: number;
}

const EPS = 0.5; // currency units: tolerance for rounding differences between invoice and payment amounts

/**
 * Estimates how long invoices took to be paid by replaying invoices and payments in date order and applying
 * each payment to the oldest open invoice first (FIFO). Payments made before an invoice exists are held as credit.
 * This is an estimate: the source data does not link payments to invoices.
 */
export function analyzePayments(invoices: Dated[], payments: Dated[]): PaymentAnalysis {
  type Event = { t: number; kind: 'invoice' | 'payment'; date: Date; amount: number };
  const events: Event[] = [
    ...invoices.filter((i) => i.amount > 0).map((i) => ({ t: i.date.getTime(), kind: 'invoice' as const, date: i.date, amount: i.amount })),
    ...payments.filter((p) => p.amount > 0).map((p) => ({ t: p.date.getTime(), kind: 'payment' as const, date: p.date, amount: p.amount })),
  ].sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === 'invoice' ? -1 : 1)); // same day: invoice first

  const open: Array<{ date: Date; remaining: number }> = [];
  const paid: PaidInvoice[] = [];
  let credit = 0;

  const settle = (when: Date) => {
    while (open.length && credit > 0) {
      const inv = open[0]!;
      const use = Math.min(credit, inv.remaining);
      inv.remaining -= use;
      credit -= use;
      if (inv.remaining <= EPS) {
        paid.push({ invoiceDate: inv.date, paidDate: when, days: Math.max(0, Math.round((when.getTime() - inv.date.getTime()) / DAY_MS)) });
        open.shift();
      } else break;
    }
  };

  for (const e of events) {
    if (e.kind === 'invoice') {
      open.push({ date: e.date, remaining: e.amount });
      settle(e.date); // credit already on account pays it immediately
    } else {
      credit += e.amount;
      settle(e.date);
    }
  }
  return {
    paid,
    outstandingInvoices: open.length,
    outstandingAmount: round(open.reduce((n, i) => n + i.remaining, 0)),
    unappliedCredit: round(credit),
  };
}

export const averageDaysToPay = (paid: PaidInvoice[]): number | null => (paid.length ? round(paid.reduce((n, p) => n + p.days, 0) / paid.length, 1) : null);

export const onTimeRate = (paid: PaidInvoice[], termsDays: number | null | undefined): number | null =>
  termsDays == null || !paid.length ? null : round(paid.filter((p) => p.days <= termsDays).length / paid.length, 3);

// ------------------------------------------------------------------ supplier ranking

export interface RankableSupplier {
  lastPrice: number;
  volatilityCv: number | null;
}

/** Orders suppliers by latest unit price (lowest first); ties go to the steadier supplier. */
export function rankSuppliers<T extends RankableSupplier>(rows: T[]): Array<T & { rank: number }> {
  return [...rows]
    .sort((a, b) => a.lastPrice - b.lastPrice || (a.volatilityCv ?? Infinity) - (b.volatilityCv ?? Infinity))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export const labelTerms = (days: number | null | undefined): string | null => (days == null ? null : days === 0 ? 'Due on receipt' : `Net ${days}`);

// ------------------------------------------------------------------ cross-source payment de-duplication

export interface PaymentRecord extends Dated {
  sourceType: string;
}

/**
 * The same payment is often recorded twice, e.g. a Tally payment voucher and the bank debit. Pairs from DIFFERENT
 * sources with the same amount within `windowDays` are treated as one payment: the bank statement (actual cash date)
 * is kept, otherwise the earlier record. Same-source repeats are never merged. This is a heuristic; the count of
 * excluded records is reported so it is never silent.
 */
export function dedupeCrossSourcePayments<T extends PaymentRecord>(payments: T[], windowDays = 7): { kept: T[]; excluded: T[] } {
  const sorted = [...payments].sort((a, b) => a.date.getTime() - b.date.getTime());
  const matched = new Set<number>();
  const dropped = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (matched.has(i)) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (matched.has(j)) continue;
      const a = sorted[i]!;
      const b = sorted[j]!;
      if ((b.date.getTime() - a.date.getTime()) / DAY_MS > windowDays) break;
      if (a.sourceType !== b.sourceType && Math.abs(a.amount - b.amount) <= EPS) {
        matched.add(i);
        matched.add(j);
        dropped.add(a.sourceType === 'bank_statement' ? j : b.sourceType === 'bank_statement' ? i : j);
        break;
      }
    }
  }
  return { kept: sorted.filter((_, i) => !dropped.has(i)), excluded: sorted.filter((_, i) => dropped.has(i)) };
}
