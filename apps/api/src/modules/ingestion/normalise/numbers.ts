/**
 * Parses messy numeric text: "₹1,23,456.50", "(1,200.00)" (negative), "1.234,56" (EU), "12 Kgs" -> 12.
 * Returns null when no number can be extracted.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,-]/g, '');
  if (s.startsWith('-')) negative = !negative;
  s = s.replace(/-/g, '');
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = (s.match(/,/g) ?? []).length;
    const afterLast = s.length - lastComma - 1;
    // "1,234" / "1,23,456" => thousands; "12,5" / "1234,56" => decimal comma
    s = commas === 1 && afterLast !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Splits "10 Nos" / "2.5kg" into a quantity and unit text. */
export function splitQuantityUnit(value: unknown): { quantity: number | null; unit?: string } {
  if (typeof value === 'number') return { quantity: value };
  const s = String(value ?? '').trim();
  const m = s.match(/^(-?[\d.,]+)\s*([^\d\s].*)?$/);
  if (!m) return { quantity: null };
  const unit = m[2]?.trim();
  return { quantity: parseAmount(m[1]), ...(unit ? { unit } : {}) };
}
