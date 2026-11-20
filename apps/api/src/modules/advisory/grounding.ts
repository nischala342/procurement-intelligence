/**
 * Grounding guard. Generated text may only contain numbers that exist in the evidence packet (or are a rounding of one).
 * This is what makes "never invent prices, percentages, dates or quotes" enforceable rather than a prompt request.
 */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

export function extractNumbers(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((t) => Number(t.replace(/,/g, ''))).filter((n) => Number.isFinite(n));
}

const key = (n: number) => Number(n.toFixed(4)).toString();

function addVariants(set: Set<string>, n: number) {
  const a = Math.abs(n);
  for (const dp of [0, 1, 2, 3, 4]) set.add(key(Number(a.toFixed(dp))));
  set.add(key(a));
}

/** Every number present anywhere in the evidence (numeric values and digits inside strings such as ISO dates and names). */
export function collectAllowedNumbers(facts: unknown): Set<string> {
  const allowed = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) addVariants(allowed, v);
    else if (typeof v === 'string') extractNumbers(v).forEach((n) => addVariants(allowed, n));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(facts);
  return allowed;
}

/** Numbers in `text` that are not supported by the evidence. Empty = grounded. */
export function groundingViolations(text: string, allowed: Set<string>): number[] {
  return [...new Set(extractNumbers(text))].filter((n) => !allowed.has(key(n)));
}

export function narrationViolations(parts: Record<string, string>, facts: unknown): number[] {
  const allowed = collectAllowedNumbers(facts);
  return [...new Set(Object.values(parts).flatMap((t) => groundingViolations(t, allowed)))];
}
