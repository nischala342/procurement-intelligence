import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { normalizeRow } from '../../src/modules/ingestion/normalise/row';
import { parseDate } from '../../src/modules/ingestion/normalise/dates';
import { extractCounterparty, normalizeProductName, normalizeVendorName } from '../../src/modules/ingestion/normalise/names';
import { parseAmount, splitQuantityUnit } from '../../src/modules/ingestion/normalise/numbers';
import { similarity } from '../../src/modules/ingestion/normalise/similarity';
import { parseBankStatement } from '../../src/modules/ingestion/parsers/bank';
import { parsePdfInvoice } from '../../src/modules/ingestion/parsers/pdf';
import { parsePriceSheet } from '../../src/modules/ingestion/parsers/priceSheet';
import { parseShopify } from '../../src/modules/ingestion/parsers/shopify';
import { parseTally } from '../../src/modules/ingestion/parsers/tally';
import { normalizeCurrency } from '../../src/modules/reference/currency';
import { normalizeUnit } from '../../src/modules/reference/units';

const SAMPLES = path.resolve(__dirname, '../../../../scripts/seed/data/samples');
const sample = (f: string) => fs.readFileSync(path.join(SAMPLES, f));

describe('numbers', () => {
  it('parses messy amounts', () => {
    assert.equal(parseAmount('₹1,23,456.50'), 123456.5);
    assert.equal(parseAmount('(1,200.00)'), -1200);
    assert.equal(parseAmount('1.234,56'), 1234.56);
    assert.equal(parseAmount('12,5'), 12.5);
    assert.equal(parseAmount('-36500.00'), -36500);
    assert.equal(parseAmount('abc'), null);
    assert.equal(parseAmount(''), null);
  });
  it('splits quantity and unit', () => {
    assert.deepEqual(splitQuantityUnit('500 Kgs'), { quantity: 500, unit: 'Kgs' });
    assert.deepEqual(splitQuantityUnit('2.5kg'), { quantity: 2.5, unit: 'kg' });
  });
});

describe('dates', () => {
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10);
  it('handles common formats', () => {
    assert.equal(iso(parseDate('20250405')), '2025-04-05');
    assert.equal(iso(parseDate('2025-04-05 10:12:00 +0530')), '2025-04-05');
    assert.equal(iso(parseDate('05/04/2025')), '2025-04-05'); // day-first default
    assert.equal(iso(parseDate('05/04/2025', false)), '2025-05-04');
    assert.equal(iso(parseDate('25/04/2025', false)), '2025-04-25'); // unambiguous wins
    assert.equal(iso(parseDate('5 Apr 2025')), '2025-04-05');
    assert.equal(iso(parseDate('Apr 5, 2025')), '2025-04-05');
    assert.equal(iso(parseDate(45752)), '2025-04-05'); // Excel serial
  });
  it('rejects impossible dates', () => {
    assert.equal(parseDate('31/02/2025'), null);
    assert.equal(parseDate('not a date'), null);
  });
});

describe('units and currency', () => {
  it('normalises units to base', () => {
    assert.deepEqual(normalizeUnit('Dozen'), { unit: 'dozen', dimension: 'count', factor: 12, baseUnit: 'pcs' });
    assert.equal(normalizeUnit('Kgs')?.unit, 'kg');
    assert.equal(normalizeUnit('Ltr')?.baseUnit, 'l');
    assert.equal(normalizeUnit('bananas'), null);
  });
  it('normalises currency', () => {
    assert.equal(normalizeCurrency('₹'), 'INR');
    assert.equal(normalizeCurrency('Rs'), 'INR');
    assert.equal(normalizeCurrency('usd'), 'USD');
    assert.equal(normalizeCurrency('XYZ'), null);
  });
  it('1 dozen and 12 pcs normalise to the same base quantity; INR/USD to INR', () => {
    const base = { rowNumber: 1, raw: {}, kind: 'invoice_line' as const };
    const opts = { dayFirst: true, defaultCurrency: 'INR' };
    const a = normalizeRow({ ...base, quantity: 1, unit: 'dozen', amount: 100 }, opts);
    const b = normalizeRow({ ...base, quantity: 12, unit: 'pcs', amount: 100 }, opts);
    assert.ok(a.ok && b.ok);
    assert.equal(a.value.baseQuantity, 12);
    assert.equal(b.value.baseQuantity, 12);
    const usd = normalizeRow({ ...base, amount: '$10', currency: '$' }, opts);
    assert.ok(usd.ok);
    assert.equal(usd.value.currency, 'USD');
    assert.equal(usd.value.amountBase, 832);
  });
  it('flags unknown unit/currency instead of failing', () => {
    const r = normalizeRow({ rowNumber: 1, raw: {}, kind: 'invoice_line', amount: 5, quantity: 1, unit: 'bananas', currency: 'XYZ' }, { dayFirst: true, defaultCurrency: 'INR' });
    assert.ok(r.ok);
    assert.ok(r.value.warnings.includes('UNKNOWN_UNIT:bananas'));
    assert.ok(r.value.warnings.includes('UNKNOWN_CURRENCY:XYZ'));
    assert.equal(r.value.amountBase, undefined);
  });
  it('rejects rows with no amount', () => {
    const r = normalizeRow({ rowNumber: 1, raw: {}, kind: 'payment' }, { dayFirst: true, defaultCurrency: 'INR' });
    assert.equal(r.ok, false);
  });
});

describe('entity names', () => {
  it('vendor spellings collapse to one key', () => {
    const keys = new Set(['ACME Pvt Ltd', 'Acme Private Limited', 'Acme Pvt. Ltd.', 'ACME'].map(normalizeVendorName));
    assert.deepEqual([...keys], ['acme']);
    assert.equal(normalizeVendorName('Initech L.L.C.'), 'initech');
    assert.equal(normalizeVendorName('INITECH L L C'), 'initech');
    assert.equal(normalizeVendorName('Smith & Sons Co.'), 'smith and sons');
  });
  it('fuzzy similarity ranks near-duplicates above distinct names', () => {
    assert.ok(similarity('globex', 'globex') === 1);
    assert.equal(normalizeProductName('Steel Rod 12 mm'), normalizeProductName('steel rod 12mm'));
    assert.ok(similarity('hydraulic oil 1l', 'hydraulic oil') > 0.75);
    assert.ok(similarity('globex', 'initech') < 0.5);
    assert.ok(similarity('rod steel 12mm', 'steel rod 12mm') > 0.9); // word order
  });
  it('extracts bank counterparties', () => {
    assert.equal(extractCounterparty('NEFT/ACME PVT LTD/INV-1001'), 'ACME PVT LTD');
    assert.equal(extractCounterparty('UPI/GLOBEX CORP/payment'), 'GLOBEX CORP');
    assert.equal(extractCounterparty('IMPS/INITECH L L C/OIL-200'), 'INITECH L L C');
  });
});

describe('parsers (sample files)', () => {
  it('price sheet: 5 rows + 1 row error', async () => {
    const r = await parsePriceSheet(sample('price-sheet.csv'), { filename: 'price-sheet.csv' });
    assert.equal(r.rows.length, 5);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0]!.message, /unit price/i);
    assert.equal(r.rows[0]!.kind, 'price_quote');
  });
  it('tally: 3 purchase lines + 1 payment, journal skipped', async () => {
    const r = await parseTally(sample('tally-purchases.xml'), { filename: 'x.xml' });
    assert.equal(r.rows.filter((x) => x.kind === 'invoice_line').length, 3);
    assert.equal(r.rows.filter((x) => x.kind === 'payment').length, 1);
    assert.equal(r.skipped, 1);
    const first = r.rows[0]!;
    assert.equal(first.vendorTaxId, '27AAACA1234A1Z5');
    assert.equal(first.quantity, 500);
    assert.equal(first.unit, 'Kgs');
    assert.equal(first.amount, 36500);
  });
  it('shopify orders csv carries order-level fields to continuation lines', async () => {
    const r = await parseShopify(sample('shopify-orders.csv'), { filename: 'o.csv' });
    assert.equal(r.rows.length, 3);
    assert.equal(r.rows[1]!.reference, '#1001');
    assert.equal(r.rows[1]!.currency, 'INR');
    assert.equal(r.rows[2]!.currency, 'USD');
  });
  it('shopify products json', async () => {
    const r = await parseShopify(sample('shopify-products.json'), { filename: 'p.json' });
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0]!.vendorName, 'Umbrella Corporation');
  });
  it('bank statement: debits become payments, credits skipped', async () => {
    const r = await parseBankStatement(sample('bank-statement.csv'), { filename: 'b.csv' });
    assert.equal(r.rows.length, 3);
    assert.equal(r.skipped, 1);
    assert.equal(r.rows[0]!.vendorName, 'ACME PVT LTD');
    assert.equal(r.rows[0]!.amount, 42600);
  });
  it('pdf adapter refuses explicitly', async () => {
    await assert.rejects(() => parsePdfInvoice(Buffer.from('x'), { filename: 'a.pdf' }), { code: 'NOT_IMPLEMENTED' });
  });
});
