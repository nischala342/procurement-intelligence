/**
 * Display formatting. Money is shown in the signed-in organization's base currency (set once at login via
 * `setDisplayCurrency`) and is never converted on the client: the API already returns base-currency amounts.
 */
let displayCurrency = 'INR';

const LOCALE: Record<string, string> = { INR: 'en-IN', GBP: 'en-GB', EUR: 'en-IE', USD: 'en-US', JPY: 'en-US', AUD: 'en-US', CAD: 'en-US', SGD: 'en-US', AED: 'en-US', CNY: 'en-US' };
const locale = (currency = displayCurrency) => LOCALE[currency] ?? 'en-US';

export const setDisplayCurrency = (code: string | null | undefined) => {
  displayCurrency = (code || 'INR').toUpperCase();
};
export const currencyCode = () => displayCurrency;

export const formatNumber = (n: number | null | undefined): string => (n == null ? '—' : new Intl.NumberFormat(locale(), { maximumFractionDigits: 4 }).format(n));

/** Keeps the data's own decimals (up to 2), including for JPY, so values are shown exactly as recorded. */
export function formatMoney(amount: number | null | undefined, currency: string = displayCurrency): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(locale(currency), { style: 'currency', currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Short money for axes and tiles: £1.2M, €840K, ¥12M. */
export function formatMoneyCompact(amount: number | null | undefined, currency: string = displayCurrency): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(locale(currency), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: Math.abs(amount) >= 1000 ? 1 : 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

/** 'YYYY-MM' -> "Oct 24" (or "October 2024" when long). */
export function formatMonth(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', long ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function formatDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
