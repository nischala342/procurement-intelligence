import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNoisy, type Pt } from '../../src/modules/advisory/signals.math';
import { mannWhitneyLess, median, quantile, wilson } from '../../src/modules/advisory/stats';
import { monthKeys, topWithOther, windowStart } from '../../src/modules/analytics/overview.math';
import { parsePurchaseOrders } from '../../src/modules/ingestion/parsers/purchaseOrders';
import { crossRate } from '../../src/modules/reference/currency';

describe('statistics', () => {
  it('median and quantile', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
    assert.equal(quantile([1, 2, 3, 4, 5], 0.75), 4);
  });
  it('Wilson score interval brackets the observed rate and narrows with n', () => {
    const small = wilson(6, 10)!;
    const big = wilson(600, 1000)!;
    assert.equal(small.rate, 0.6);
    assert.ok(small.lower < 0.6 && small.upper > 0.6);
    assert.ok(big.upper - big.lower < small.upper - small.lower);
    assert.equal(wilson(0, 0), null);
  });
  it('Mann–Whitney one-sided: clearly lower sample is significant, identical samples are not', () => {
    const low = [1, 2, 3, 4, 5, 6, 7, 8];
    const high = [9, 10, 11, 12, 13, 14, 15, 16];
    assert.ok(mannWhitneyLess(low, high)!.p < 0.01);
    assert.ok(mannWhitneyLess(high, low)!.p > 0.95);
    assert.ok(mannWhitneyLess(low, low)!.p > 0.4);
  });
});

describe('noise guard', () => {
  const P = (vendorId: string, price: number, i: number): Pt => ({ productId: 'x', vendorId, kind: 'purchase', date: new Date(Date.UTC(2024, 0, 1 + i)), price, qty: 1, amount: price, reference: null });
  it('stable per-supplier prices are not noisy', () => {
    assert.equal(isNoisy([P('a', 100, 0), P('a', 101, 1), P('a', 102, 2), P('b', 90, 3), P('b', 91, 4)]), false);
  });
  it('large within-supplier spread (pooled over repeat lines) is noisy', () => {
    assert.equal(isNoisy([P('a', 160, 0), P('a', 87, 1), P('b', 134, 2), P('b', 84, 3), P('c', 63, 4), P('c', 82, 5)]), true);
  });
  it('dense products are always treated as noisy', () => {
    assert.equal(isNoisy(Array.from({ length: 20 }, (_, i) => P('a', 100, i))), true);
  });
});

describe('currency cross rates', () => {
  it('same currency is exactly 1 (dataset amounts are never converted)', () => {
    for (const c of ['GBP', 'EUR', 'USD', 'JPY', 'AUD', 'INR']) assert.equal(crossRate(c, c), 1);
  });
  it('cross rate is the inverse in the other direction and unknown codes give null', () => {
    const r = crossRate('USD', 'GBP')!;
    assert.ok(Math.abs(r * crossRate('GBP', 'USD')! - 1) < 1e-9);
    assert.equal(crossRate('XXX', 'GBP'), null);
  });
});

describe('overview math', () => {
  it('window start holds N calendar months ending at the analysis month', () => {
    assert.equal(windowStart(new Date('2024-09-30T00:00:00Z'), 12).toISOString().slice(0, 10), '2023-10-01');
    assert.deepEqual(monthKeys(new Date('2023-11-15T00:00:00Z'), new Date('2024-02-01T00:00:00Z')), ['2023-11', '2023-12', '2024-01', '2024-02']);
  });
  it('top-N folds the tail into one Other row', () => {
    const rows = [5, 1, 4, 2, 3].map((s) => ({ k: String(s), spend: s }));
    const out = topWithOther(rows, 3, (rest) => ({ k: 'Other', spend: rest.reduce((n, r) => n + r.spend, 0) }));
    assert.deepEqual(out.map((r) => r.k), ['5', '4', 'Other']);
    assert.equal(out[2]!.spend, 6);
  });
});

describe('purchase-order parser', () => {
  const header = 'PO Number,PO Date,PO Status,Supplier Name,Supplier Country,Supplier Tier,Supplier Risk,Payment Terms,Item Code,Item Description,Category,Unit of Measure,Unit Price,Quantity,Line Net,Currency,Budget Unit Price,Requested Delivery,Actual Delivery,Days Late,On Time Delivery,Lead Time Days,Contract ID,Maverick Spend,Supplier ESG Score';
  const csv = [
    header,
    'PO-1,03/01/2024,Closed,Acme Ltd,United Kingdom,1,Low,Net 30,IT-01,Laptop,IT Hardware,EA,900,2,1800,GBP,950,10/01/2024,12/01/2024,2,No,9,CON-1,No,71',
    'PO-2,04/01/2024,Cancelled,Acme Ltd,United Kingdom,1,Low,Net 30,IT-01,Laptop,IT Hardware,EA,900,1,900,GBP,950,10/01/2024,,,,,NO-CONTRACT,No,71',
    'PO-3,05/01/2024,Closed,,United Kingdom,1,Low,Net 30,IT-01,Laptop,IT Hardware,EA,900,1,900,GBP,950,10/01/2024,10/01/2024,0,Yes,5,CON-2,Yes,71',
  ].join('\n');
  it('maps PO lines to purchases with procurement context, skips cancelled lines and reports bad rows', async () => {
    const r = await parsePurchaseOrders(Buffer.from(csv), { filename: 'po.csv' });
    assert.equal(r.skipped, 1);
    assert.equal(r.rows.length, 1);
    assert.equal(r.errors.length, 1); // missing supplier
    const row = r.rows[0]!;
    assert.equal(row.kind, 'invoice_line');
    assert.equal(row.vendorName, 'Acme Ltd');
    assert.equal(row.reference, 'PO-1');
    assert.equal(row.amount, 1800);
    assert.equal(row.procurement?.onTime, false);
    assert.equal(row.procurement?.daysLate, 2);
    assert.equal(row.procurement?.budgetUnitPrice, 950);
    assert.equal(row.procurement?.maverick, false);
  });
});
