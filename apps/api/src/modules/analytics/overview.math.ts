/** Pure helpers for the analytics overview (unit-tested). */

export const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100, 1) : null);

/** UTC month keys ('YYYY-MM') from the month of `from` to the month of `to`, inclusive. */
export function monthKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const endY = to.getUTCFullYear();
  const endM = to.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** First instant of the month `months - 1` months before `asOf`'s month, so the window holds `months` calendar months. */
export function windowStart(asOf: Date, months: number): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (months - 1), 1));
}

/** Keeps the `n - 1` largest rows and folds the rest into one "Other" row (never more than `n` rows). */
export function topWithOther<T extends { spend: number }>(rows: T[], n: number, other: (rest: T[]) => T): T[] {
  const sorted = [...rows].sort((a, b) => b.spend - a.spend);
  if (sorted.length <= n) return sorted;
  return [...sorted.slice(0, n - 1), other(sorted.slice(n - 1))];
}
