/** Default reporting currency for new organizations. Each tenant can set its own (Tenant.baseCurrency). */
export const DEFAULT_BASE_CURRENCY = 'INR';
/** @deprecated use the tenant's base currency; kept for the reference endpoint */
export const BASE_CURRENCY = DEFAULT_BASE_CURRENCY;

/**
 * Static reference rates: 1 unit of currency = N INR.
 * These are fixed defaults for deterministic ingestion/tests; swap for a dated rate table or live feed
 * when FX accuracy matters. Every transaction stores the rate it was converted with (`fxRate`).
 */
export const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.2,
  EUR: 90.5,
  GBP: 105.8,
  AED: 22.65,
  SGD: 61.9,
  CAD: 61.2,
  AUD: 54.8,
  JPY: 0.55,
  CNY: 11.5,
};

const ALIASES: Record<string, string> = {
  '₹': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR', rupee: 'INR', rupees: 'INR',
  $: 'USD', usd: 'USD', us$: 'USD', dollar: 'USD', dollars: 'USD',
  '€': 'EUR', eur: 'EUR', euro: 'EUR',
  '£': 'GBP', gbp: 'GBP',
  aed: 'AED', dh: 'AED', dirham: 'AED',
  sgd: 'SGD', cad: 'CAD', aud: 'AUD',
  '¥': 'JPY', jpy: 'JPY', yen: 'JPY', cny: 'CNY', rmb: 'CNY',
};

/** Normalises a currency symbol/code to ISO-4217; null if unrecognised. */
export function normalizeCurrency(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  return ALIASES[s] ?? (FX_TO_INR[s.toUpperCase()] !== undefined ? s.toUpperCase() : null);
}

/** Finds a currency marker embedded in an amount string such as "₹1,200.00" or "USD 45". */
export function detectCurrencyInText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/(₹|€|£|¥|US\$|\$|\b(?:INR|USD|EUR|GBP|AED|SGD|CAD|AUD|JPY|CNY|RMB|Rs\.?)\b)/i);
  return m?.[1] ? normalizeCurrency(m[1]) : null;
}

export const getFxRate = (currency: string): number | null => FX_TO_INR[currency] ?? null;

export const SUPPORTED_CURRENCIES = Object.keys(FX_TO_INR);

/**
 * Units of `to` per 1 unit of `from`, via the INR reference table. Identical currencies always convert at exactly 1,
 * so amounts already in the tenant's currency are never altered. Null if either currency is unknown.
 */
export function crossRate(from: string, to: string): number | null {
  if (from === to) return 1;
  const a = FX_TO_INR[from];
  const b = FX_TO_INR[to];
  return a !== undefined && b !== undefined ? a / b : null;
}

export const listCurrencies = () => ({ baseCurrency: BASE_CURRENCY, ratesToBase: FX_TO_INR });
