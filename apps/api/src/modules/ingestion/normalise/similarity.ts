function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

const sortTokens = (s: string) => s.split(' ').sort().join(' ');

/** 0..1 similarity of two already-normalised names; word-order insensitive (Dice on bigrams). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  return Math.max(dice(a, b), dice(sortTokens(a), sortTokens(b)));
}
