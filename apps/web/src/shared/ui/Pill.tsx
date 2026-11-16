import type { PropsWithChildren } from 'react';

export type Tone = 'neutral' | 'info' | 'warn' | 'ok' | 'bad';

/** Status pill. A glyph + text label (not colour alone) conveys the state. */
export function Pill({ tone = 'neutral', glyph, children }: PropsWithChildren<{ tone?: Tone; glyph?: string }>) {
  return (
    <span className={`pill pill-${tone}`}>
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {children}
    </span>
  );
}
