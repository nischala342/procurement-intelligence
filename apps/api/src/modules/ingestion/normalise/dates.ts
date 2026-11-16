const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function build(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Reject overflow such as 31 Feb
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * Parses dates from ISO, YYYYMMDD (Tally), D/M/Y, D-M-Y, D.M.Y, "5 Apr 2025", "Apr 5, 2025", Excel serials and Date objects.
 * Ambiguous numeric dates (e.g. 03/04/2025) follow `dayFirst` (default true). Returns a UTC midnight Date or null.
 */
export function parseDate(value: unknown, dayFirst = true): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Excel serial date (1900 system)
    if (value > 20000 && value < 80000) return new Date(Math.round((value - 25569) * 86400 * 1000));
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!);

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!);

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = fullYear(+m[3]!);
    if (a > 12) return build(y, b, a); // must be day-first
    if (b > 12) return build(y, a, b); // must be month-first
    return dayFirst ? build(y, b, a) : build(y, a, b);
  }

  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]*(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    return mi >= 0 ? build(fullYear(+m[3]!), mi + 1, +m[1]!) : null;
  }

  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    return mi >= 0 ? build(+m[3]!, mi + 1, +m[2]!) : null;
  }

  // Fallback for full timestamps such as "2025-04-05 10:12:00 +0530"
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}
