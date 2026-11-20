import { formatMoney } from '../../shared/lib/format';
import { Pill, type Tone } from '../../shared/ui/Pill';
import type { Impact, InsightType, Level } from './types';

export const TYPE_META: Record<InsightType, { label: string; glyph: string; blurb: string }> = {
  COST_CREEP: { label: 'Cost creep', glyph: '↗', blurb: 'Prices paid are rising' },
  SUPPLIER_VARIANCE: { label: 'Supplier variance', glyph: '⇄', blurb: 'Paying more than peers' },
  CONSOLIDATION: { label: 'Consolidation', glyph: '⊕', blurb: 'Spend split across suppliers' },
  REORDER_ALERT: { label: 'Reorder alerts', glyph: '◷', blurb: 'Stock runway running short' },
  MARKET_SAVINGS: { label: 'Market savings', glyph: '◎', blurb: 'Verified lower market prices' },
  SOURCING_SHIFT: { label: 'Sourcing shift', glyph: '⇆', blurb: 'A better-scoring supplier exists' },
  DELIVERY_RISK: { label: 'Delivery risk', glyph: '⏱', blurb: 'Late deliveries above target' },
  MAVERICK_SPEND: { label: 'Maverick spend', glyph: '⚑', blurb: 'Buying outside contracts' },
  BUDGET_OVERRUN: { label: 'Budget overrun', glyph: '△', blurb: 'Paying above budget prices' },
  SUPPLY_RISK: { label: 'Supply risk', glyph: '⛨', blurb: 'Spend with high-risk suppliers' },
};
export const TYPE_ORDER: InsightType[] = ['SOURCING_SHIFT', 'CONSOLIDATION', 'MAVERICK_SPEND', 'BUDGET_OVERRUN', 'SUPPLY_RISK', 'DELIVERY_RISK', 'COST_CREEP', 'SUPPLIER_VARIANCE', 'REORDER_ALERT', 'MARKET_SAVINGS'];

const SEVERITY: Record<Level, { tone: Tone; glyph: string; label: string }> = {
  HIGH: { tone: 'bad', glyph: '‼', label: 'High' },
  MEDIUM: { tone: 'warn', glyph: '!', label: 'Medium' },
  LOW: { tone: 'neutral', glyph: '·', label: 'Low' },
};

export function SeverityBadge({ level }: { level: Level }) {
  const m = SEVERITY[level];
  return (
    <Pill tone={m.tone} glyph={m.glyph}>
      {m.label} severity
    </Pill>
  );
}

export const CONFIDENCE_LABEL: Record<Level, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

const IMPACT_LABEL: Record<Impact['kind'], string> = {
  savings: 'Potential saving',
  cost_increase: 'Extra cost incurred',
  risk: 'Order value at stake',
  none: 'Impact not quantified',
};

/** Quantified impact with tabular numbers; always states what kind of figure it is and links to its derivation. */
export function ImpactFigure({ impact }: { impact: Impact }) {
  return (
    <div className="impact" title={impact.basis}>
      <span className="impact-label">{IMPACT_LABEL[impact.kind]}</span>
      <strong className="impact-value tnum">{impact.amountInr != null ? formatMoney(impact.amountInr) : '—'}</strong>
      {impact.pct != null && <span className="muted small tnum">{impact.pct > 0 ? '+' : ''}{impact.pct}%</span>}
    </div>
  );
}
