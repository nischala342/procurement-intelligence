import { Pill, type Tone } from '../../shared/ui/Pill';
import type { FrequencyStatus } from './types';

// Generic indicators live in shared/ui so other features (products) can use them too.
export { ChangePill, StabilityPill } from '../../shared/ui/Indicators';

const FREQ: Record<FrequencyStatus, { label: string; tone: Tone; glyph: string }> = {
  weekly: { label: 'Weekly', tone: 'ok', glyph: '●' },
  monthly: { label: 'Monthly', tone: 'ok', glyph: '◕' },
  quarterly: { label: 'Quarterly', tone: 'neutral', glyph: '◑' },
  occasional: { label: 'Occasional', tone: 'warn', glyph: '◔' },
  insufficient_data: { label: 'Not enough data', tone: 'neutral', glyph: '○' },
};

export function FrequencyPill({ status, avgDays }: { status: FrequencyStatus; avgDays?: number | null }) {
  const m = FREQ[status];
  return (
    <Pill tone={m.tone} glyph={m.glyph}>
      {m.label}
      {avgDays != null && <span className="tnum"> · {Math.round(avgDays)}d</span>}
    </Pill>
  );
}
