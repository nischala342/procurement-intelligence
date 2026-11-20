import { DEFAULT_BASE_CURRENCY } from '../reference/currency';
import { TenantModel } from './model';

/**
 * Per-tenant reporting currency. Amounts already in this currency are stored exactly as given (rate 1);
 * other currencies are converted with the static reference rates. Cached briefly: it is read on every analytics call.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { currency: string; country: string | null; at: number }>();

async function load(tenantId: string) {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const t = await TenantModel.findById(tenantId).select('baseCurrency country').lean();
  const entry = { currency: t?.baseCurrency ?? DEFAULT_BASE_CURRENCY, country: t?.country ?? null, at: Date.now() };
  cache.set(tenantId, entry);
  return entry;
}

export const tenantCurrency = async (tenantId: string): Promise<string> => (await load(tenantId)).currency;
export const tenantCountry = async (tenantId: string): Promise<string | null> => (await load(tenantId)).country;
export const forgetTenantSettings = (tenantId: string) => cache.delete(tenantId);
