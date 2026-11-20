import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzePayments,
  averageDaysToPay,
  classifyFrequency,
  coefficientOfVariation,
  dedupeCrossSourcePayments,
  labelTerms,
  meanGapDays,
  onTimeRate,
  pctChange,
  rankSuppliers,
  stabilityFromCv,
} from '../../src/modules/vendors/intelligence.math';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('purchase cadence', () => {
  it('mean gap = span / (n - 1)', () => {
    assert.equal(meanGapDays([d('2025-01-01'), d('2025-01-11'), d('2025-01-31')]), 15);
    assert.equal(meanGapDays([d('2025-03-01'), d('2025-01-01')]), 59); // order-insensitive
  });
  it('needs at least two orders', () => {
    assert.equal(meanGapDays([]), null);
    assert.equal(meanGapDays([d('2025-01-01')]), null);
  });
  it('classifies frequency', () => {
    assert.equal(classifyFrequency(7), 'weekly');
    assert.equal(classifyFrequency(30), 'monthly');
    assert.equal(classifyFrequency(90), 'quarterly');
    assert.equal(classifyFrequency(200), 'occasional');
    assert.equal(classifyFrequency(null), 'insufficient_data');
  });
});

describe('price consistency', () => {
  it('computes CV only with 2+ points and a positive mean', () => {
    assert.equal(coefficientOfVariation(5, 100, 4), 0.05);
    assert.equal(coefficientOfVariation(5, 100, 1), null);
    assert.equal(coefficientOfVariation(5, 0, 4), null);
  });
  it('maps CV to an index and rating', () => {
    assert.deepEqual(stabilityFromCv(0), { index: 100, rating: 'stable' });
    assert.deepEqual(stabilityFromCv(0.1), { index: 80, rating: 'moderate' });
    assert.deepEqual(stabilityFromCv(0.3), { index: 40, rating: 'volatile' });
    assert.deepEqual(stabilityFromCv(0.9), { index: 0, rating: 'volatile' });
    assert.deepEqual(stabilityFromCv(null), { index: null, rating: 'insufficient_data' });
  });
  it('percentage change', () => {
    assert.equal(pctChange(100, 112), 12);
    assert.equal(pctChange(100, 88), -12);
    assert.equal(pctChange(0, 5), null);
    assert.equal(pctChange(null, 5), null);
  });
});

describe('payment delay estimation (FIFO)', () => {
  it('measures days from invoice to the payment that settles it', () => {
    const r = analyzePayments([{ date: d('2025-04-05'), amount: 42600 }], [{ date: d('2025-04-20'), amount: 42600 }]);
    assert.equal(r.paid.length, 1);
    assert.equal(r.paid[0]!.days, 15);
    assert.equal(r.outstandingAmount, 0);
    assert.equal(averageDaysToPay(r.paid), 15);
  });
  it('applies payments to the oldest invoice first and tracks what is outstanding', () => {
    const r = analyzePayments(
      [
        { date: d('2025-01-01'), amount: 100 },
        { date: d('2025-01-10'), amount: 200 },
      ],
      [
        { date: d('2025-01-20'), amount: 100 }, // settles invoice 1 (19 days)
        { date: d('2025-02-15'), amount: 50 }, // partial on invoice 2
      ],
    );
    assert.deepEqual(r.paid.map((p) => p.days), [19]);
    assert.equal(r.outstandingInvoices, 1);
    assert.equal(r.outstandingAmount, 150);
  });
  it('splits one payment across invoices and holds early payments as credit', () => {
    const split = analyzePayments(
      [
        { date: d('2025-01-01'), amount: 100 },
        { date: d('2025-01-05'), amount: 100 },
      ],
      [{ date: d('2025-01-31'), amount: 200 }],
    );
    assert.deepEqual(split.paid.map((p) => p.days), [30, 26]);
    const advance = analyzePayments([{ date: d('2025-02-01'), amount: 100 }], [{ date: d('2025-01-01'), amount: 100 }]);
    assert.equal(advance.paid[0]!.days, 0);
    assert.equal(advance.unappliedCredit, 0);
  });
  it('reports on-time rate against configured terms', () => {
    const paid = [{ days: 10 }, { days: 25 }, { days: 40 }].map((x) => ({ ...x, invoiceDate: d('2025-01-01'), paidDate: d('2025-01-01') }));
    assert.equal(onTimeRate(paid, 30), 0.667);
    assert.equal(onTimeRate(paid, null), null);
    assert.equal(onTimeRate([], 30), null);
  });
  it('labels terms', () => {
    assert.equal(labelTerms(30), 'Net 30');
    assert.equal(labelTerms(0), 'Due on receipt');
    assert.equal(labelTerms(null), null);
  });
});

describe('supplier ranking', () => {
  it('ranks by price then stability', () => {
    const ranked = rankSuppliers([
      { id: 'a', lastPrice: 12, volatilityCv: 0.1 },
      { id: 'b', lastPrice: 10, volatilityCv: 0.2 },
      { id: 'c', lastPrice: 10, volatilityCv: 0.02 },
      { id: 'd', lastPrice: 10, volatilityCv: null },
    ]);
    assert.deepEqual(ranked.map((r) => [r.id, r.rank]), [['c', 1], ['b', 2], ['d', 3], ['a', 4]]);
  });
});

describe('cross-source payment de-duplication', () => {
  const p = (date: string, amount: number, sourceType: string) => ({ date: d(date), amount, sourceType });
  it('merges a Tally voucher and the matching bank debit, keeping the bank date', () => {
    const r = dedupeCrossSourcePayments([p('2025-04-20', 42600, 'tally'), p('2025-04-22', 42600, 'bank_statement')]);
    assert.equal(r.kept.length, 1);
    assert.equal(r.kept[0]!.sourceType, 'bank_statement');
    assert.equal(r.excluded.length, 1);
  });
  it('never merges repeats from the same source or records far apart', () => {
    assert.equal(dedupeCrossSourcePayments([p('2025-04-20', 100, 'tally'), p('2025-04-21', 100, 'tally')]).kept.length, 2);
    assert.equal(dedupeCrossSourcePayments([p('2025-04-01', 100, 'tally'), p('2025-04-20', 100, 'bank_statement')]).kept.length, 2);
    assert.equal(dedupeCrossSourcePayments([p('2025-04-20', 100, 'tally'), p('2025-04-21', 250, 'bank_statement')]).kept.length, 2);
  });
  it('pairs each record at most once', () => {
    const r = dedupeCrossSourcePayments([p('2025-04-20', 100, 'tally'), p('2025-04-21', 100, 'bank_statement'), p('2025-04-22', 100, 'bank_statement')]);
    assert.equal(r.kept.length, 2);
  });
});
