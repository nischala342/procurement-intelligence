const LEGAL_SUFFIXES = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated', 'co', 'company',
  'corp', 'corporation', 'plc', 'gmbh', 'pte', 'sa', 'bv', 'opc',
]);

/** Lowercases, strips punctuation and legal suffixes: "Acme Pvt. Ltd." -> "acme". */
export function normalizeVendorName(name: string): string {
  const tokens = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .reduce<{ out: string[]; run: boolean }>(
      // "L.L.C." / "L L C" -> "llc": merge runs of single-letter tokens
      (st, t) => {
        const single = /^[a-z]$/.test(t);
        if (single && st.run) st.out[st.out.length - 1] += t;
        else st.out.push(t);
        st.run = single;
        return st;
      },
      { out: [], run: false },
    ).out;
  const kept = tokens.filter((t) => !LEGAL_SUFFIXES.has(t));
  return (kept.length ? kept : tokens).join(' ');
}

/** Lowercases, strips punctuation and collapses whitespace; keeps legal words (not meaningful for products). */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/(\d)\s+([a-z])/g, '$1$2') // "12 mm" -> "12mm"
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalizeSku = (sku: string): string => sku.toUpperCase().replace(/\s+/g, '').trim();

export const normalizeTaxId = (id: string): string => id.toUpperCase().replace(/[^A-Z0-9]/g, '');

const NOISE = /^(upi|neft|imps|rtgs|ach|ecs|pos|chq|cheque|cr|dr|payment|paid|pay|to|from|ref|txn|bank|transfer|inb|mob)$/i;

/** Extracts the counterparty from a bank narration such as "NEFT/ACME PVT LTD/INV-1001". */
export function extractCounterparty(narration: string): string {
  const segments = narration
    .split(/[/|\\]|\s-\s|-(?=[A-Za-z]{3})/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = segments.find((s) => {
    const letters = (s.match(/[A-Za-z]/g) ?? []).length;
    return letters >= 3 && !NOISE.test(s) && !s.includes('@') && !/^[A-Z]{2,5}\d{4,}/i.test(s) && letters / s.length > 0.6;
  });
  return (candidate ?? narration).trim();
}
