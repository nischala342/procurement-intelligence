import { parseDate } from './dates';

/**
 * Normalises the procurement context of a PO line: dates parsed with the job's day-first setting, and the budget price
 * expressed per base unit in the tenant's base currency (same conversion as the unit price; unchanged when already in it).
 */
export function normalizeProcurement(p: Record<string, unknown> | undefined, opts: { dayFirst: boolean; fxRate?: number; unitFactor?: number }) {
  if (!p) return undefined;
  const out: Record<string, unknown> = { ...p };
  for (const k of ['requestedDelivery', 'actualDelivery'] as const) {
    if (p[k] != null) {
      const d = parseDate(p[k], opts.dayFirst);
      if (d) out[k] = d;
      else delete out[k];
    }
  }
  if (typeof p.budgetUnitPrice === 'number' && opts.fxRate != null && opts.unitFactor) {
    out.budgetUnitPriceBase = Math.round(((p.budgetUnitPrice * opts.fxRate) / opts.unitFactor) * 10_000) / 10_000;
  }
  return out;
}
