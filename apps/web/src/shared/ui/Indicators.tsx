import { Pill, type Tone } from './Pill';

export type StabilityRating = 'stable' | 'moderate' | 'volatile' | 'insufficient_data';

const STABILITY: Record<StabilityRating, { label: string; tone: Tone; glyph: string }> = {
  stable: { label: 'Stable', tone: 'ok', glyph: '≈' },
  moderate: { label: 'Moderate', tone: 'warn', glyph: '∿' },
  volatile: { label: 'Volatile', tone: 'bad', glyph: '↯' },
  insufficient_data: { label: 'Not enough data', tone: 'neutral', glyph: '○' },
};

export function StabilityPill({ rating }: { rating: StabilityRating }) {
  const m = STABILITY[rating];
  return (
    <Pill tone={m.tone} glyph={m.glyph}>
      {m.label}
    </Pill>
  );
}

/** Signed percentage; for a buyer rising prices are bad and falling prices good. Direction is shown by arrow + sign, not colour alone. */
export function ChangePill({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="muted">—</span>;
  if (pct === 0) return <Pill glyph="＝">0%</Pill>;
  return (
    <Pill tone={pct > 0 ? 'bad' : 'ok'} glyph={pct > 0 ? '▲' : '▼'}>
      <span className="tnum">
        {pct > 0 ? '+' : '−'}
        {Math.abs(pct).toFixed(1)}%
      </span>
    </Pill>
  );
}
