/** Small, dependency-free statistics used by the sourcing detectors. Pure and unit-tested. */

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Wilson score interval for a proportion (z = 1.96 → 95%). Honest for small samples, unlike p ± 1.96·se. */
export function wilson(successes: number, n: number, z = 1.96): { rate: number; lower: number; upper: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { rate: p, lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) };
}

/**
 * One-sided Mann–Whitney U test (normal approximation with tie correction): is sample `a` stochastically SMALLER
 * than sample `b`? Distribution-free, so robust to the heavy price noise seen in real purchasing data.
 */
export function mannWhitneyLess(a: number[], b: number[]): { u: number; z: number; p: number } | null {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return null;
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array<number>(all.length);
  let tieTerm = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1]!.v === all[i]!.v) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const t = j - i + 1;
    tieTerm += t * t * t - t;
    i = j + 1;
  }
  const r1 = all.reduce((s, x, i) => (x.g === 0 ? s + ranks[i]! : s), 0);
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const n = n1 + n2;
  const sd = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  if (sd === 0) return { u, z: 0, p: 0.5 };
  const z = (u - (n1 * n2) / 2 + 0.5) / sd; // +0.5 continuity correction toward "not smaller"
  return { u, z, p: normalCdf(z) };
}
