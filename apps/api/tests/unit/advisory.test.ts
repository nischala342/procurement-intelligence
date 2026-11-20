import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectAllowedNumbers, extractNumbers, groundingViolations, narrationViolations } from '../../src/modules/advisory/grounding';
import { narrate, templateNarration, type LlmCall } from '../../src/modules/advisory/narrator';
import { detectAll, detectCostCreep, detectFragmentation, detectMarketSavings, detectReorder, detectSupplierVariance, type BenchmarkInfo, type DetectCtx, type Pt } from '../../src/modules/advisory/signals.math';
import type { Signal } from '../../src/modules/advisory/types';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const P = (productId: string, vendorId: string | null, kind: 'purchase' | 'quote', date: string, price: number, qty: number | null = null): Pt => ({
  productId,
  vendorId,
  kind,
  date: d(date),
  price,
  qty,
  amount: qty != null ? price * qty : null,
  reference: null,
});

const ctx = (over: Partial<DetectCtx> = {}): DetectCtx => ({
  asOf: d('2025-06-10'),
  products: new Map([
    ['steel', { id: 'steel', name: 'Steel Rod 12mm', sku: 'STL-001', baseUnit: 'kg', leadTimeDays: null, safetyStockDays: null }],
    ['box', { id: 'box', name: 'Corrugated Box Large', baseUnit: 'pcs', leadTimeDays: null, safetyStockDays: null }],
  ]),
  vendors: new Map([['acme', 'Acme'], ['bharat', 'Bharat Steel'], ['globex', 'Globex'], ['packright', 'PackRight'], ['sunrise', 'Sunrise']]),
  tenantSpend: 1_000_000,
  minVendors: 3,
  lookbackDays: 365,
  fragmentationDays: 180,
  benchmarks: [],
  ...over,
});

const steelPurchases = [P('steel', 'acme', 'purchase', '2025-04-05', 73, 500), P('steel', 'acme', 'purchase', '2025-05-06', 74, 200), P('steel', 'acme', 'purchase', '2025-06-04', 75.5, 250)];
const bharatQuotes = [P('steel', 'bharat', 'quote', '2025-04-10', 68.4), P('steel', 'bharat', 'quote', '2025-05-10', 69.9), P('steel', 'bharat', 'quote', '2025-06-10', 71.2)];

describe('cost creep', () => {
  it('flags a product whose recent average price rose vs the prior window', () => {
    const s = detectCostCreep(steelPurchases, ctx()).filter((x) => x.fingerprint === 'creep:product:steel');
    assert.equal(s.length, 1);
    const f = s[0]!.facts as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(f.windowDays, 60);
    assert.ok(f.changePct > 2.4 && f.changePct < 2.6, `changePct ${f.changePct}`);
    assert.equal(s[0]!.severity, 'LOW');
    assert.equal(s[0]!.confidence, 'MEDIUM'); // 2 recent lines, 1 prior
    assert.equal(s[0]!.impact.kind, 'cost_increase');
    assert.ok(s[0]!.impact.amountInr! > 800 && s[0]!.impact.amountInr! < 850);
  });
  it('ignores flat/falling prices and products without both windows', () => {
    const falling = [P('steel', 'acme', 'purchase', '2025-04-05', 80, 10), P('steel', 'acme', 'purchase', '2025-06-04', 70, 10)];
    assert.equal(detectCostCreep(falling, ctx()).length, 0);
    assert.equal(detectCostCreep([P('steel', 'acme', 'purchase', '2025-06-04', 75, 10)], ctx()).length, 0);
    assert.equal(detectCostCreep([...bharatQuotes], ctx()).length, 0); // quotes are not what was paid
  });
  it('emits a portfolio signal when spend-weighted prices rise across products', () => {
    const pts = [...steelPurchases, P('box', 'globex', 'purchase', '2025-03-20', 100, 10), P('box', 'globex', 'purchase', '2025-05-20', 104, 10)];
    const s = detectCostCreep(pts, ctx());
    const p = s.find((x) => x.fingerprint === 'creep:portfolio');
    assert.ok(p, 'portfolio signal');
    assert.equal((p!.facts as Record<string, unknown>).productCount, 2);
    assert.equal(p!.rfq, null);
  });
  it('honours a requested single window', () => {
    const s = detectCostCreep(steelPurchases, ctx({ windowDays: 30 })).find((x) => x.fingerprint === 'creep:product:steel')!;
    assert.equal((s.facts as Record<string, unknown>).windowDays, 30);
  });
});

describe('supplier variance', () => {
  it('flags a supplier we buy from that is consistently pricier than a peer, with the exact cost of the gap', () => {
    const s = detectSupplierVariance([...steelPurchases, ...bharatQuotes], ctx());
    assert.equal(s.length, 1);
    const x = s[0]!;
    assert.equal(x.fingerprint, 'variance:steel:acme');
    assert.equal(x.impact.amountInr, 2535); // 500*(73-71.2)+200*(74-71.2)+250*(75.5-71.2)
    assert.equal(x.confidence, 'HIGH'); // 3 of 3 months higher
    assert.equal(x.severity, 'LOW'); // 6.0% premium
    assert.deepEqual(x.rfq!.currentVendorIds, ['acme']);
    assert.deepEqual(x.rfq!.suggestedVendorIds, ['bharat']);
    assert.equal(x.rfq!.referencePrice, 71.2);
  });
  it('does not flag when the supplier is not consistently higher, or is not one we buy from', () => {
    const mixed = [
      ...steelPurchases,
      P('steel', 'bharat', 'quote', '2025-04-10', 80), // Bharat pricier in Apr and May, cheaper only at the end
      P('steel', 'bharat', 'quote', '2025-05-10', 80),
      P('steel', 'bharat', 'quote', '2025-06-10', 71.2),
    ];
    assert.equal(detectSupplierVariance(mixed, ctx()).length, 0);
    assert.equal(detectSupplierVariance(bharatQuotes, ctx()).length, 0);
  });
  it('ignores small gaps (< 4%)', () => {
    const s = detectSupplierVariance([...steelPurchases, P('steel', 'bharat', 'quote', '2025-06-10', 74)], ctx());
    assert.equal(s.length, 0);
  });
});

describe('spend fragmentation', () => {
  const box = [P('box', 'globex', 'purchase', '2025-04-12', 45, 200), P('box', 'sunrise', 'purchase', '2025-05-20', 47, 150), P('box', 'packright', 'purchase', '2025-06-03', 44.5, 300)];
  it('flags a product split across 3+ suppliers and computes the conservative saving', () => {
    const s = detectFragmentation(box, ctx());
    assert.equal(s.length, 1);
    assert.equal(s[0]!.impact.amountInr, 475); // 200*(45-44.5)+150*(47-44.5)
    const f = s[0]!.facts as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(f.vendorCount, 3);
    assert.equal(f.bestVendor.vendorName, 'PackRight');
    assert.equal(s[0]!.severity, 'LOW');
    assert.ok(s[0]!.impact.basis.includes('volume discount'));
  });
  it('respects the minimum supplier threshold and the look-back window', () => {
    assert.equal(detectFragmentation(box.slice(0, 2), ctx()).length, 0);
    assert.equal(detectFragmentation(box.slice(0, 2), ctx({ minVendors: 2 })).length, 1);
    assert.equal(detectFragmentation(box, ctx({ fragmentationDays: 10 })).length, 0);
  });
});

describe('reorder runway', () => {
  it('flags a product at its reorder point; severity rises when runway is shorter than the lead time', () => {
    const base = detectReorder(steelPurchases, ctx());
    assert.equal(base.signals.length, 1);
    assert.equal(base.signals[0]!.severity, 'MEDIUM'); // order_now, runway 15.4d >= 14d default lead time
    assert.equal(base.signals[0]!.confidence, 'MEDIUM'); // 3 orders but lead time is a default
    const f = base.signals[0]!.facts as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(f.leadTimeSource, 'assumed_default');
    assert.equal(f.recommendedOrderQty, 350);
    assert.equal(f.reorderPoint, 204);

    const longLead = ctx({ products: new Map([['steel', { id: 'steel', name: 'Steel Rod 12mm', baseUnit: 'kg', leadTimeDays: 20, safetyStockDays: null }]]) });
    const hi = detectReorder(steelPurchases, longLead).signals[0]!;
    assert.equal(hi.severity, 'HIGH'); // 15.4 days of cover < 20 days lead time
    assert.equal(hi.confidence, 'HIGH'); // configured lead time and 3 orders
    assert.equal(hi.impact.kind, 'risk');
  });
  it('skips products whose purchasing has gone quiet instead of raising false alarms', () => {
    const r = detectReorder(steelPurchases, ctx({ asOf: d('2026-06-10') }));
    assert.equal(r.signals.length, 0);
    assert.equal(r.skippedQuiet, 1);
  });
  it('needs two purchase dates with quantities', () => {
    assert.equal(detectReorder([P('steel', 'acme', 'purchase', '2025-06-04', 75, 100)], ctx()).signals.length, 0);
  });
});

describe('verified market benchmark', () => {
  const bench = (over: Partial<BenchmarkInfo> = {}): BenchmarkInfo => ({
    id: 'b1',
    productId: 'steel',
    priceBase: 69,
    sourceName: 'Example Metals Index',
    sourceUrl: 'https://example.com/index',
    observedAt: d('2025-06-01'),
    verified: true,
    verifiedBy: 'buyer@example.com',
    verifiedAt: d('2025-06-02'),
    notes: null,
    ...over,
  });
  it('raises gross savings from a verified, fresh benchmark below the price paid', () => {
    const s = detectMarketSavings(steelPurchases, ctx({ benchmarks: [bench()] }));
    assert.equal(s.length, 1);
    assert.equal(s[0]!.impact.amountInr, 4625); // 500*4 + 200*5 + 250*6.5
    assert.equal(s[0]!.severity, 'MEDIUM'); // 9.4% above benchmark
    assert.equal(s[0]!.confidence, 'HIGH'); // benchmark 9 days old, last purchase 6 days old
    assert.ok(s[0]!.impact.basis.startsWith('GROSS'));
  });
  it('ignores unverified, unsourced, stale or non-competitive benchmarks', () => {
    assert.equal(detectMarketSavings(steelPurchases, ctx({ benchmarks: [bench({ verified: false })] })).length, 0);
    assert.equal(detectMarketSavings(steelPurchases, ctx({ benchmarks: [bench({ sourceUrl: null })] })).length, 0);
    assert.equal(detectMarketSavings(steelPurchases, ctx({ benchmarks: [bench({ observedAt: d('2024-10-01') })] })).length, 0);
    assert.equal(detectMarketSavings(steelPurchases, ctx({ benchmarks: [bench({ priceBase: 75 })] })).length, 0); // only 0.7% above
  });
});

describe('detectAll', () => {
  it('runs every detector and returns unique fingerprints', () => {
    const pts = [...steelPurchases, ...bharatQuotes];
    const { signals } = detectAll(pts, ctx({ benchmarks: [{ id: 'b1', productId: 'steel', priceBase: 69, sourceName: 'Idx', sourceUrl: 'https://example.com', observedAt: d('2025-06-01'), verified: true, verifiedBy: 'x', verifiedAt: d('2025-06-02'), notes: null }] }));
    const types = new Set(signals.map((s) => s.type));
    for (const t of ['COST_CREEP', 'SUPPLIER_VARIANCE', 'REORDER_ALERT', 'MARKET_SAVINGS']) assert.ok(types.has(t as Signal['type']), `missing ${t}`);
    assert.equal(new Set(signals.map((s) => s.fingerprint)).size, signals.length);
  });
});

// ---------------------------------------------------------------- grounding & narration

const allSignals = (): Signal[] => {
  const pts = [...steelPurchases, ...bharatQuotes, P('box', 'globex', 'purchase', '2025-04-12', 45, 200), P('box', 'sunrise', 'purchase', '2025-05-20', 47, 150), P('box', 'packright', 'purchase', '2025-06-03', 44.5, 300), P('box', 'globex', 'purchase', '2025-03-20', 43, 10)];
  const bench: BenchmarkInfo = { id: 'b1', productId: 'steel', priceBase: 69, sourceName: 'Example Metals Index', sourceUrl: 'https://example.com', observedAt: d('2025-06-01'), verified: true, verifiedBy: 'x', verifiedAt: d('2025-06-02'), notes: null };
  return detectAll(pts, ctx({ benchmarks: [bench] })).signals;
};

describe('grounding guard', () => {
  it('extracts numbers, including Indian digit grouping and decimals', () => {
    assert.deepEqual(extractNumbers('Saved ₹1,23,456.50 (5.7%) on 12 Jun 2025'), [123456.5, 5.7, 12, 2025]);
  });
  it('accepts roundings of evidence numbers and digits inside strings (dates, names)', () => {
    const allowed = collectAllowedNumbers({ price: 75.4999, date: '2025-06-10', name: 'Steel Rod 12mm', pct: 5.695 });
    assert.deepEqual(groundingViolations('Price ₹75.50 vs 5.7% on 10 Jun 2025 for 12mm rod', allowed), []);
    assert.deepEqual(groundingViolations('This will save 20% next year', allowed), [20]);
  });
  it('every deterministic template is fully grounded in its own evidence', () => {
    const signals = allSignals();
    const types = new Set(signals.map((s) => s.type));
    assert.ok(types.size >= 4);
    for (const s of signals) {
      const n = templateNarration(s);
      assert.deepEqual(narrationViolations(n as unknown as Record<string, string>, { facts: s.facts, impact: s.impact, window: s.window }), [], `${s.fingerprint}: ${JSON.stringify(n)}`);
      assert.ok(n.headline.length > 10 && n.recommendedAction.length > 10);
    }
  });
});

describe('LLM narration contract', () => {
  const signal = () => allSignals().find((s) => s.type === 'SUPPLIER_VARIANCE')!;
  const f = () => signal().facts as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('uses templates (no external call) when no LLM is configured', async () => {
    const r = await narrate(signal(), null);
    assert.equal(r.generator, 'template');
    assert.equal(r.fallbackReason, undefined);
  });
  it('accepts grounded model output', async () => {
    const llm: LlmCall = async () =>
      JSON.stringify({
        headline: `${f().vendor.vendorName} is ${f().premiumPct}% pricier than ${f().peer.vendorName}`,
        summary: `Latest paid price is ${f().vendor.latestPurchasePrice} per ${f().baseUnit} against ${f().peer.price} from ${f().peer.vendorName}.`,
        rationale: `The gap is worth ${f().impactAmountInr} rupees on recent volume.`,
        recommendedAction: `Ask ${f().vendor.vendorName} to match the lower price.`,
      });
    const r = await narrate(signal(), llm);
    assert.equal(r.generator, 'llm');
    assert.ok(r.narration.headline.includes(String(f().premiumPct)));
  });
  it('rejects model output containing an invented number and falls back to the template', async () => {
    const llm: LlmCall = async () => JSON.stringify({ headline: 'Acme overcharges by 37%', summary: 'You could save 99999 rupees a year by switching.', rationale: 'Market data shows 12.3% lower prices elsewhere.', recommendedAction: 'Switch suppliers now.' });
    const r = await narrate(signal(), llm);
    assert.equal(r.generator, 'template');
    assert.match(r.fallbackReason!, /not in the evidence/);
    assert.ok(!r.narration.headline.includes('37'));
  });
  it('falls back when the model fails, returns non-JSON, or violates the schema', async () => {
    for (const llm of [async () => { throw new Error('boom'); }, async () => 'I think you should negotiate.', async () => JSON.stringify({ headline: 'x' })] as LlmCall[]) {
      const r = await narrate(signal(), llm);
      assert.equal(r.generator, 'template');
      assert.ok(r.fallbackReason);
    }
  });
  it('tolerates JSON wrapped in prose or code fences', async () => {
    const body = { headline: `${f().productName} costs less elsewhere`, summary: `Peer price is ${f().peer.price}.`, rationale: 'Based on the supplier comparison.', recommendedAction: 'Request a quotation.' };
    const r = await narrate(signal(), async () => 'Here you go:\n```json\n' + JSON.stringify(body) + '\n```');
    assert.equal(r.generator, 'llm');
  });
});
