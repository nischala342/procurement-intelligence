import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyTrend,
  consumptionFromPurchases,
  monthlyChanges,
  planReorder,
  savingsOnVolume,
  scoreVendors,
  stdDevSample,
  trendPctPerPeriod,
} from '../../src/modules/products/intelligence.math';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const near = (a: number | null, b: number, eps = 0.01) => assert.ok(a != null && Math.abs(a - b) <= eps, `${a} !~ ${b}`);

describe('price fluctuation', () => {
  it('month-over-month changes, annualising gaps to a per-month rate', () => {
    const r = monthlyChanges([
      { period: '2025-04', avgPrice: 100 },
      { period: '2025-05', avgPrice: 110 },
      { period: '2025-07', avgPrice: 133.1 }, // two months later: 10%/month compounded
    ]);
    assert.equal(r[0]!.changePct, null);
    assert.equal(r[1]!.changePct, 10);
    near(r[2]!.changePct, 10, 0.01);
  });
  it('trend slope and classification', () => {
    near(trendPctPerPeriod([100, 102, 104, 106]), 1.94, 0.02);
    assert.equal(trendPctPerPeriod([100]), null);
    assert.equal(classifyTrend(1.9), 'rising');
    assert.equal(classifyTrend(-1.2), 'falling');
    assert.equal(classifyTrend(0.2), 'flat');
    assert.equal(classifyTrend(null), 'insufficient_data');
    assert.equal(trendPctPerPeriod([50, 50, 50]), 0);
  });
  it('sample standard deviation', () => {
    near(stdDevSample([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001);
    assert.equal(stdDevSample([1]), null);
  });
});

describe('vendor scoring', () => {
  const base = { avg: 100, std: 2, count: 5, purchaseCount: 5 };
  it('rewards low price, stability and track record', () => {
    const r = scoreVendors([
      { vendorId: 'cheap-thin', lastPrice: 90, lastDate: d('2025-06-01'), avg: 90, std: 1, count: 1, purchaseCount: 0 },
      { vendorId: 'solid', lastPrice: 100, lastDate: d('2025-06-01'), ...base },
      { vendorId: 'volatile', lastPrice: 100, lastDate: d('2025-06-01'), avg: 100, std: 40, count: 5, purchaseCount: 5 },
    ]);
    assert.equal(r[0]!.vendorId, 'solid'); // established supplier beats a one-quote cheaper one
    const solid = r.find((x) => x.vendorId === 'solid')!;
    const volatile = r.find((x) => x.vendorId === 'volatile')!;
    assert.ok(volatile.composite < solid.composite && volatile.stabilityScore < solid.stabilityScore);
    assert.deepEqual(r.map((x) => x.rank), [1, 2, 3]);
    assert.ok(r.every((x) => x.composite >= 0 && x.composite <= 100));
  });
  it('lowest price scores 100 on price; stale suppliers lose recency', () => {
    const r = scoreVendors([
      { vendorId: 'a', lastPrice: 50, lastDate: d('2025-06-01'), ...base },
      { vendorId: 'b', lastPrice: 100, lastDate: d('2024-06-01'), ...base },
    ]);
    const a = r.find((x) => x.vendorId === 'a')!;
    const b = r.find((x) => x.vendorId === 'b')!;
    assert.equal(a.priceScore, 100);
    assert.equal(b.priceScore, 50);
    assert.ok(a.reliabilityScore > b.reliabilityScore);
  });
  it('single vendor / empty input', () => {
    assert.equal(scoreVendors([]).length, 0);
    assert.equal(scoreVendors([{ vendorId: 'x', lastPrice: 10, lastDate: null, ...base }])[0]!.rank, 1);
  });
});

describe('consumption velocity', () => {
  it('uses all quantities except the last over the observed span', () => {
    const c = consumptionFromPurchases([
      { date: d('2025-04-05'), qty: 500 },
      { date: d('2025-05-06'), qty: 200 },
      { date: d('2025-06-04'), qty: 250 },
    ])!;
    near(c.velocityPerDay, 700 / 60, 0.0001);
    assert.equal(c.ordersConsidered, 3);
    near(c.avgDaysBetweenOrders, 30, 0.0001);
    near(c.avgOrderQty, 316.667, 0.001);
    assert.equal(c.intervalRates.length, 2);
  });
  it('merges same-day orders and needs two distinct dates', () => {
    assert.equal(consumptionFromPurchases([{ date: d('2025-04-05'), qty: 5 }, { date: d('2025-04-05'), qty: 5 }]), null);
    const c = consumptionFromPurchases([{ date: d('2025-04-01'), qty: 10 }, { date: d('2025-04-01'), qty: 20 }, { date: d('2025-05-01'), qty: 5 }])!;
    near(c.velocityPerDay, 1, 0.0001); // 30 units / 30 days
    assert.equal(consumptionFromPurchases([]), null);
  });
});

describe('reorder planning', () => {
  const consumption = consumptionFromPurchases([
    { date: d('2025-04-05'), qty: 500 },
    { date: d('2025-05-06'), qty: 200 },
    { date: d('2025-06-04'), qty: 250 },
  ])!;
  const plan = (over: Partial<Parameters<typeof planReorder>[0]> = {}) =>
    planReorder({ consumption, lastOrderQty: 250, daysSinceLastOrder: 6, asOf: d('2025-06-10'), leadTimeDays: 14, safetyStockDays: null, ...over });

  it('statistical safety stock with 3+ orders; order quantity = one historical cycle', () => {
    const p = plan();
    assert.equal(p.safetyStockMethod, 'statistical');
    near(p.safetyStock, 40.3, 0.5);
    assert.equal(p.reorderPoint, 204);
    assert.equal(p.recommendedOrderQty, 350);
    near(p.estimatedStockOnHand, 180, 0.01);
    assert.equal(p.status, 'order_now'); // 180 <= 204
  });
  it('configured safety days override the statistical estimate; plenty of stock is "ok"', () => {
    const p = plan({ leadTimeDays: 5, safetyStockDays: 3 });
    assert.equal(p.safetyStockMethod, 'configured_days');
    near(p.safetyStock, 35, 0.01);
    assert.equal(p.reorderPoint, 94);
    assert.equal(p.status, 'order_soon'); // 180 > 94 but within 14 days of consumption of the reorder point
    assert.ok(p.orderByDate && p.orderByDate.getTime() > d('2025-06-10').getTime());
    assert.equal(plan({ leadTimeDays: 5, safetyStockDays: 3, lastOrderQty: 600, daysSinceLastOrder: 0 }).status, 'ok');
  });
  it('falls back to 25% of lead-time demand with only two orders', () => {
    const c2 = consumptionFromPurchases([{ date: d('2025-01-01'), qty: 100 }, { date: d('2025-01-31'), qty: 100 }])!;
    const p = planReorder({ consumption: c2, lastOrderQty: 100, daysSinceLastOrder: 0, asOf: d('2025-01-31'), leadTimeDays: 10, safetyStockDays: null });
    assert.equal(p.safetyStockMethod, 'fallback_percentage');
    near(p.safetyStock, 0.25 * (100 / 30) * 10, 0.1);
  });
  it('consumed stock floors at zero', () => {
    const p = plan({ daysSinceLastOrder: 400 });
    assert.equal(p.estimatedStockOnHand, 0);
    assert.equal(p.status, 'order_now');
  });
});

describe('savings', () => {
  it('estimates what past volume would have saved at a better price, never negative', () => {
    assert.equal(savingsOnVolume(1000, 100, 8), 200);
    assert.equal(savingsOnVolume(1000, 100, 12), 0);
    assert.equal(savingsOnVolume(0, 0, 8), 0);
  });
});
