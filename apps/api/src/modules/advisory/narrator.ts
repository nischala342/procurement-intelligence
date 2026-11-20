import { z } from 'zod';
import { env } from '../../config/env';
import { narrationViolations } from './grounding';
import type { Narration, Signal } from './types';

// ------------------------------------------------------------------ formatting (numbers come only from facts)

const num = (n: number, dp = 2) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: Math.min(dp, 2), maximumFractionDigits: dp }));
const MONEY_LOCALE: Record<string, string> = { INR: 'en-IN', GBP: 'en-GB', EUR: 'en-IE', USD: 'en-US', JPY: 'en-US', AUD: 'en-US', CAD: 'en-US', SGD: 'en-US', AED: 'en-US', CNY: 'en-US' };
/** Money in the given currency, never converted. Decimals are kept as in the data (up to 2), including for JPY. */
export const money = (n: number, currency = 'INR') => {
  try {
    return new Intl.NumberFormat(MONEY_LOCALE[currency] ?? 'en-US', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${num(n)}`;
  }
};
export const inr = (n: number) => money(n, 'INR');
const pct = (n: number) => `${Number(Math.abs(n).toFixed(1))}%`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type F = Record<string, any>;

// ------------------------------------------------------------------ deterministic templates

/** Plain-language insight text written purely from the evidence packet. This is the default and the fallback. */
export function templateNarration(signal: Signal): Narration {
  const f = signal.facts as F;
  const m = (n: number) => money(n, (f.currency as string) ?? 'INR');
  switch (signal.type) {
    case 'COST_CREEP': {
      if (f.scope === 'portfolio') {
        const top = (f.topProducts as F[]).slice(0, 3);
        return {
          headline: `Purchase prices are up ${pct(f.weightedChangePct)} across ${f.productCount} products`,
          summary: `Spend-weighted, the average price paid across ${f.productCount} products rose ${pct(f.weightedChangePct)} in the last ${f.windowDays} days compared with the ${f.windowDays} days before.`,
          rationale: `Largest contributors: ${list(top.map((p) => `${p.productName} (+${pct(p.changePct)})`))}.${f.impactAmountInr != null ? ` At recent volumes this adds about ${m(f.impactAmountInr)}.` : ''}`,
          recommendedAction: 'Review the largest contributors first, confirm whether the increases are contractual, and request competing quotations for the biggest movers.',
        };
      }
      const vendors = (f.vendors as F[]).map((v) => v.vendorName);
      return {
        headline: `${f.productName} costs ${pct(f.changePct)} more than ${f.windowDays} days ago`,
        summary: `The average price paid for ${f.productName} rose from ${m(f.prior.avgPrice)} to ${m(f.recent.avgPrice)} per ${f.baseUnit} (+${pct(f.changePct)}), comparing ${fmtDate(f.recent.from)} to ${fmtDate(f.recent.to)} with the ${f.windowDays} days before.`,
        rationale: `Based on ${f.recent.purchaseLines} purchase line(s) in the recent window and ${f.prior.purchaseLines} in the prior window.${f.impactAmountInr != null ? ` At the recent volume this adds about ${m(f.impactAmountInr)}.` : ' Quantities are missing on some lines, so the extra cost is not estimated.'}`,
        recommendedAction: `Check recent invoices and agreed terms with ${list(vendors) || 'the supplier'}, and consider requesting quotations from alternative suppliers.`,
      };
    }
    case 'SUPPLIER_VARIANCE':
      return {
        headline: `${f.vendor.vendorName} charges ${pct(f.premiumPct)} more than ${f.peer.vendorName} for ${f.productName}`,
        summary: `You last paid ${f.vendor.vendorName} ${m(f.vendor.latestPurchasePrice)} per ${f.baseUnit} for ${f.productName} on ${fmtDate(f.vendor.latestPurchaseDate)}, while ${f.peer.vendorName} ${f.peer.priceKind === 'purchase' ? 'charged' : 'quoted'} ${m(f.peer.price)} on ${fmtDate(f.peer.date)} (${m(f.premiumPerUnit)} lower per ${f.baseUnit}).`,
        rationale: `${f.comparison.monthsCompared >= 2 ? `In ${f.comparison.monthsHigher} of ${f.comparison.monthsCompared} months with prices from both suppliers, ${f.vendor.vendorName} was higher.` : 'Only one overlapping period is available, so consistency cannot be confirmed.'}${f.impactAmountInr != null ? ` On the ${f.vendor.quantity} ${f.baseUnit} bought in the last ${f.lookbackDays} days the gap is worth about ${m(f.impactAmountInr)}.` : ''}`,
        recommendedAction: `Ask ${f.vendor.vendorName} to match ${m(f.peer.price)} per ${f.baseUnit}, or request a quotation from ${f.peer.vendorName} and other suppliers.`,
      };
    case 'CONSOLIDATION': {
      if (f.scope === 'category') {
        const items = (f.items as F[]).filter((i) => i.bestVendorName).slice(0, 3);
        return {
          headline: `${f.category} spend is spread over ${f.vendorCount} suppliers`,
          summary: `In the last ${f.windowDays} days ${f.productCount} ${f.category} items were bought from ${f.avgVendorsPerItem} suppliers each on average, ${m(f.totalSpend)} in total.`,
          rationale: `Buying each item from its lowest-median-price supplier would have saved about ${m(f.savingsAtBestMedian)}. This is indicative: prices are noisy and no volume discount is assumed.${items.length ? ` Biggest opportunities: ${list(items.map((i) => `${i.productName} via ${i.bestVendorName}`))}.` : ''}`,
          recommendedAction: `Run a consolidated ${f.category} tender with the best-value suppliers to gain volume leverage.`,
        };
      }
      const top = (f.vendors as F[]).slice(0, 3);
      return {
        headline: `${f.productName} is split across ${f.vendorCount} suppliers`,
        summary: `In the last ${f.windowDays} days ${f.productName} was bought from ${f.vendorCount} suppliers (${list(top.map((v) => `${v.vendorName} ${v.sharePct}%`))}), totalling ${m(f.totalSpend)}.`,
        rationale: `${f.bestVendor.vendorName} has the lowest latest purchase price at ${m(f.bestVendor.price)} per ${f.baseUnit}.${f.savingsAtBestPrice != null ? ` Buying the whole ${num(f.totalQuantity)} ${f.baseUnit} at that price would have saved about ${m(f.savingsAtBestPrice)}, before any volume discount, which is not assumed.` : ' Quantities are missing on some purchases, so the saving is not estimated.'}`,
        recommendedAction: `Consider consolidating ${f.productName} volume with fewer suppliers and request volume-based quotations, starting with ${f.bestVendor.vendorName}.`,
      };
    }
    case 'REORDER_ALERT':
      return {
        headline: f.runwayDays != null && f.runwayDays < f.leadTimeDays ? `${f.productName} may run out before a new order can arrive` : `${f.productName} is at or near its reorder point`,
        summary: `Estimated stock of ${f.productName} is ${num(f.estimatedStock)} ${f.baseUnit} against a reorder point of ${num(f.reorderPoint)} ${f.baseUnit}${f.runwayDays != null ? `, about ${num(f.runwayDays, 1)} days of cover` : ''}. Lead time is ${f.leadTimeDays} days (${f.leadTimeSource === 'configured' ? 'configured' : f.leadTimeSource === 'measured' ? 'measured from purchase orders' : 'assumed default'}).`,
        rationale: `Estimated demand is ${num(f.velocityPerDay)} ${f.baseUnit} per day from ${f.ordersConsidered} purchases about ${num(f.avgDaysBetweenOrders, 1)} days apart. The last order was ${num(f.lastOrderQty)} ${f.baseUnit} on ${fmtDate(f.lastOrderDate)}. ${f.leadTimeSource === 'assumed_default' ? 'The lead time is a default, so set the real value to refine this alert.' : ''}`.trim(),
        recommendedAction: `Order about ${num(f.recommendedOrderQty)} ${f.baseUnit} of ${f.productName}${f.orderByDate ? ` by ${fmtDate(f.orderByDate)}` : ''} (roughly ${m(f.estimatedOrderValue)} at the lowest recent price).`,
      };
    case 'SOURCING_SHIFT': {
      const inc = f.incumbent as F;
      const rec = f.recommended as F;
      return {
        headline: `${rec.vendorName} offers better value than ${inc.vendorName} for ${f.category}`,
        summary: `${inc.vendorName} is your largest ${f.category} supplier (${m(f.incumbentSpend12m)} in the last 12 months) at a median price index of ${inc.medianIndex}. ${rec.vendorName} sits at ${rec.medianIndex}, about ${pct(f.savingsPct)} lower, and the gap is statistically significant (p = ${f.test.pValue}; ${f.test.linesRecommended} vs ${f.test.linesIncumbent} purchase lines).`,
        rationale: `Best-value score ${rec.score} vs ${inc.score}.${rec.onTimePct != null && inc.onTimePct != null ? ` On-time delivery ${rec.onTimePct}% vs ${inc.onTimePct}%.` : ''}${rec.riskRating || inc.riskRating ? ` Supplier risk ${rec.riskRating ?? 'not rated'} vs ${inc.riskRating ?? 'not rated'}.` : ''} A price index of 1 is the item's median price, so suppliers are compared like-for-like across items.`,
        recommendedAction: `Request quotations from ${rec.vendorName} for your main ${f.category} items and shift volume gradually; the estimated annual saving is about ${m(f.estimatedAnnualSavings)}.`,
      };
    }
    case 'DELIVERY_RISK': {
      if (f.scope === 'portfolio') {
        const worst = (f.worstSuppliers as F[]).map((s) => `${s.vendorName} (${s.onTimeRate}%)`);
        const best = (f.bestSuppliers as F[]).map((s) => `${s.vendorName} (${s.onTimeRate}%)`);
        return {
          headline: `Only ${f.onTimeRate}% of deliveries arrive on time (target ${f.targetRate}%)`,
          summary: `${f.lateLines} of ${f.lines} purchase lines in the last 12 months were delivered late, worth ${m(f.lateSpend)}${f.medianDaysLate != null ? `, typically ${f.medianDaysLate} days late` : ''}.`,
          rationale: `Least reliable: ${list(worst)}. Most reliable: ${list(best)}.`,
          recommendedAction: 'Hold delivery-performance reviews with the least reliable suppliers, plan buffer stock for their items, and favour the most reliable suppliers when volumes are re-allocated.',
        };
      }
      return {
        headline: `${f.vendorName} delivers on time only ${f.onTimeRate}% of the time`,
        summary: `Over the last 12 months ${f.onTimeRate}% of ${f.lines} purchase lines from ${f.vendorName} arrived on time, against ${f.portfolioOnTimeRate}% across all suppliers; even the optimistic bound is ${f.onTimeUpper}%.`,
        rationale: `${f.avgDaysLate != null ? `Deliveries average ${f.avgDaysLate} days late. ` : ''}${m(f.spend12m)} of spend is exposed to these delays.`,
        recommendedAction: `Agree delivery KPIs with ${f.vendorName}, hold extra buffer stock for its items, or qualify an alternative supplier.`,
      };
    }
    case 'MAVERICK_SPEND': {
      const test = f.premiumTest as F | null;
      return {
        headline: `${f.maverickSharePct}% of ${f.category} spend bypasses the approved process`,
        summary: `${f.maverickLines} ${f.category} purchase lines worth ${m(f.maverickSpend)} were maverick buys in the last 12 months, out of ${m(f.categorySpend)} in the category.`,
        rationale: `${test?.significant ? `Maverick purchases paid a median price index of ${f.maverickMedianIndex} vs ${f.compliantMedianIndex} for compliant ones (p = ${test.pValue}), an extra cost of about ${m(f.impactAmountInr)}.` : `Their prices are not significantly higher than compliant purchases${test ? ` (p = ${test.pValue})` : ''}, so this is a control and compliance issue rather than a price one.`} Main suppliers involved: ${list((f.topVendors as F[]).slice(0, 3).map((v) => v.vendorName))}.`,
        recommendedAction: `Route ${f.category} purchases through contracted or preferred suppliers and tighten purchase approvals.`,
      };
    }
    case 'BUDGET_OVERRUN':
      return {
        headline: `${f.category} purchases ran ${m(f.overrunAmount)} over budget`,
        summary: `${f.linesOverBudget} of ${f.linesWithBudget} ${f.category} purchase lines (${f.overBudgetRatePct}%) were priced above their budget unit price in the last 12 months, an overrun of ${f.overrunSharePct}% of category spend.`,
        rationale: `Largest overruns: ${list((f.topItems as F[]).slice(0, 3).map((i) => `${i.productName} (${m(i.overrun)})`))}. Budget is compared with the list unit price, before discounts and tax.`,
        recommendedAction: 'Renegotiate the items with the largest overruns, or update their budget prices if the market has moved.',
      };
    case 'SUPPLY_RISK':
      return {
        headline: `${f.atRiskSharePct}% of ${f.category} spend sits with high-risk or conditional suppliers`,
        summary: `${m(f.atRiskSpend)} of ${m(f.categorySpend)} spent on ${f.category} in the last 12 months went to suppliers rated High risk or approved only conditionally: ${list((f.riskySuppliers as F[]).map((s) => s.vendorName))}.`,
        rationale: `${f.singleSourceLines > 0 ? `${f.singleSourceLines} of these purchase lines were single-sourced. ` : ''}${(f.saferAlternatives as F[]).length ? `Lower-risk alternatives with strong scores: ${list((f.saferAlternatives as F[]).map((s) => s.vendorName))}.` : ''}`.trim() || 'Supplier risk ratings come from your supplier master data.',
        recommendedAction: `Qualify a lower-risk second source for ${f.category} and reduce dependence on the flagged suppliers.`,
      };
    case 'MARKET_SAVINGS':
      return {
        headline: `${f.productName} is ${pct(f.premiumPct)} above a verified market price`,
        summary: `You last paid ${m(f.paid.latestPrice)} per ${f.baseUnit} for ${f.productName} on ${fmtDate(f.paid.latestDate)}. A verified benchmark from ${f.benchmark.sourceName} (observed ${fmtDate(f.benchmark.observedAt)}) shows ${m(f.benchmark.price)}.`,
        rationale: `${f.grossSavings != null ? `On the ${num(f.paid.quantity)} ${f.baseUnit} bought in the last ${f.lookbackDays} days the gross difference is about ${m(f.grossSavings)}.` : ''} Gross figure: freight, duties and switching costs are not included.`.trim(),
        recommendedAction: `Request quotations referencing this benchmark from ${f.paid.vendorName} and alternative suppliers before the next order.`,
      };
  }
}

// ------------------------------------------------------------------ optional LLM narration (Claude)

export const narrationSchema = z.object({
  headline: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(700),
  rationale: z.string().trim().min(5).max(900),
  recommendedAction: z.string().trim().min(5).max(500),
});

export type LlmCall = (system: string, user: string) => Promise<string>;

export const SYSTEM_PROMPT = `You write short, plain-language procurement advisories for business users.
You are given ONE evidence packet as JSON. Rules, all mandatory:
1. Use ONLY facts present in the packet. Never invent, estimate, round differently or extrapolate prices, percentages, quantities, dates, suppliers or quotes.
2. Every number you write must appear in the packet (you may round to at most 2 decimals). Do not write any number that is not in the packet.
3. Refer to products and suppliers by the names given in the packet.
4. If a value is null or missing, do not mention it.
5. Money values are in the packet's "currency"; never convert them or change their currency.
6. Do not add savings, risks or deadlines beyond those in the packet. State caveats that the packet lists (e.g. gross savings, assumed lead time).
Respond with a single JSON object and nothing else: {"headline": string, "summary": string, "rationale": string, "recommendedAction": string}.`;

/** Returns a Claude caller when ANTHROPIC_API_KEY is set, else null (templates are used and nothing leaves the server). */
export function claudeCaller(): LlmCall | null {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return async (system, user) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), env.ADVISORY_LLM_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: env.ADVISORY_MODEL, max_tokens: 700, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
      });
      if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((c) => c.type === 'text')?.text;
      if (!text) throw new Error('Empty model response');
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface NarrationResult {
  narration: Narration;
  generator: 'template' | 'llm';
  model?: string;
  fallbackReason?: string;
}

const parseJsonObject = (raw: string): unknown => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(raw.slice(start, end + 1));
};

/**
 * Narrates a signal. With an LLM: the output must (1) parse, (2) satisfy the Zod schema, and (3) contain no number
 * absent from the evidence packet; otherwise the deterministic template is used and the reason is recorded.
 */
export async function narrate(signal: Signal, llm: LlmCall | null): Promise<NarrationResult> {
  const template = templateNarration(signal);
  if (!llm) return { narration: template, generator: 'template' };
  try {
    const packet = JSON.stringify({ type: signal.type, severity: signal.severity, confidence: signal.confidence, impact: signal.impact, window: signal.window, facts: signal.facts });
    const raw = await llm(SYSTEM_PROMPT, `Evidence packet:\n${packet}`);
    const parsed = narrationSchema.parse(parseJsonObject(raw));
    const bad = narrationViolations(parsed, { facts: signal.facts, impact: signal.impact, window: signal.window });
    if (bad.length) return { narration: template, generator: 'template', fallbackReason: `Rejected: model output contained numbers not in the evidence (${bad.slice(0, 5).join(', ')})` };
    return { narration: parsed, generator: 'llm', model: env.ADVISORY_MODEL };
  } catch (e) {
    return { narration: template, generator: 'template', fallbackReason: `LLM unavailable or invalid: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown error'}` };
  }
}
