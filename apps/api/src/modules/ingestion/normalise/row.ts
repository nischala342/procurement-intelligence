import { crossRate, detectCurrencyInText, normalizeCurrency } from '../../reference/currency';
import { normalizeUnit } from '../../reference/units';
import type { ParsedRow, RowKind } from '../parsers/types';
import { parseDate } from './dates';
import { parseAmount } from './numbers';

export interface NormalizedRow {
  kind: RowKind;
  date: Date | null;
  quantity?: number;
  unit?: string;
  baseQuantity?: number;
  baseUnit?: string;
  dimension: string;
  unitPrice?: number;
  amount?: number;
  currency: string;
  fxRate?: number;
  amountBase?: number;
  unitPriceBase?: number;
  warnings: string[];
}

export type RowResult = { ok: true; value: NormalizedRow } | { ok: false; error: string };

export interface NormalizeOptions {
  dayFirst: boolean;
  defaultCurrency: string;
  /** the tenant's reporting currency; amounts already in it are kept exactly (rate 1) */
  baseCurrency: string;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const present = (v: unknown) => v != null && String(v).trim() !== '';

/** Pure row normalisation: numbers, dates, units and currency. Never touches the database. */
export function normalizeRow(row: ParsedRow, opts: NormalizeOptions): RowResult {
  const warnings: string[] = [];

  // --- currency
  let currency = opts.defaultCurrency;
  let knownCurrency = true;
  if (present(row.currency)) {
    const c = normalizeCurrency(row.currency) ?? detectCurrencyInText(row.currency);
    if (c) currency = c;
    else if (/^[A-Za-z]{3}$/.test(String(row.currency).trim())) {
      currency = String(row.currency).trim().toUpperCase();
      knownCurrency = false;
      warnings.push(`UNKNOWN_CURRENCY:${currency}`);
    }
  }

  // --- numbers
  const quantity = parseAmount(row.quantity) ?? undefined;
  const unitPrice = parseAmount(row.unitPrice) ?? undefined;
  let amount = parseAmount(row.amount) ?? undefined;
  if (amount === undefined && unitPrice !== undefined && quantity !== undefined) amount = r4(unitPrice * quantity);

  if (row.kind === 'price_quote') {
    if (unitPrice === undefined) return { ok: false, error: 'Missing or unreadable unit price' };
  } else if (amount === undefined) {
    return { ok: false, error: 'Missing or unreadable amount' };
  }

  // --- date
  const date = parseDate(row.date, opts.dayFirst);
  if (present(row.date) && !date) warnings.push('INVALID_DATE');
  else if (!present(row.date) && row.kind !== 'price_quote') warnings.push('MISSING_DATE');

  // --- unit
  let unit: string | undefined;
  let baseUnit: string | undefined;
  let baseQuantity: number | undefined;
  let dimension = 'count';
  let factor: number | undefined;
  if (row.kind !== 'payment') {
    if (present(row.unit)) {
      const nu = normalizeUnit(row.unit);
      if (nu) {
        unit = nu.unit;
        baseUnit = nu.baseUnit;
        dimension = nu.dimension;
        factor = nu.factor;
      } else {
        unit = String(row.unit).trim().toLowerCase();
        warnings.push(`UNKNOWN_UNIT:${unit}`);
      }
    } else {
      const nu = normalizeUnit('pcs')!;
      unit = nu.unit;
      baseUnit = nu.baseUnit;
      factor = nu.factor;
      warnings.push('ASSUMED_UNIT_PCS');
    }
    if (quantity !== undefined && factor !== undefined) baseQuantity = r4(quantity * factor);
  }

  // --- currency conversion to base
  const fxRate = knownCurrency ? (crossRate(currency, opts.baseCurrency) ?? undefined) : undefined;
  if (fxRate === undefined && knownCurrency) warnings.push(`NO_FX_RATE:${currency}`);
  const amountBase = fxRate !== undefined && amount !== undefined ? r4(amount * fxRate) : undefined;
  const unitPriceBase = fxRate !== undefined && unitPrice !== undefined && factor ? r4((unitPrice * fxRate) / factor) : undefined;

  const value: NormalizedRow = {
    kind: row.kind,
    date,
    dimension,
    currency,
    warnings,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(baseUnit ? { baseUnit } : {}),
    ...(baseQuantity !== undefined ? { baseQuantity } : {}),
    ...(unitPrice !== undefined ? { unitPrice } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(fxRate !== undefined ? { fxRate } : {}),
    ...(amountBase !== undefined ? { amountBase } : {}),
    ...(unitPriceBase !== undefined ? { unitPriceBase } : {}),
  };
  return { ok: true, value };
}
