import { formatDate } from '../../../shared/lib/format';
import { Pill } from '../../../shared/ui/Pill';
import { CONFIDENCE_LABEL, ImpactFigure, SeverityBadge, TYPE_META } from '../meta';
import type { Insight } from '../types';
import { InsightActions } from './InsightActions';

interface Props {
  insight: Insight;
  onInspect: (id: string) => void;
  onDraftRfq: (id: string, headline: string) => void;
}

/** Scannable priority card: plain-language headline, quantified impact, severity, and quick actions. */
export function InsightCard({ insight: i, onInspect, onDraftRfq }: Props) {
  const t = TYPE_META[i.type];
  // portfolio-level insights span many products and have no single item to quote
  const canRfq = i.entities.productIds.length === 1;
  return (
    <li className={`insight sev-${i.severity.toLowerCase()} ${i.status !== 'ACTIVE' ? 'dimmed' : ''}`}>
      <article aria-label={i.headline}>
        <header className="insight-head">
          <span className="insight-type">
            <span aria-hidden="true">{t.glyph}</span> {t.label}
          </span>
          <SeverityBadge level={i.severity} />
          <Pill tone="neutral">Confidence: {CONFIDENCE_LABEL[i.confidence]}</Pill>
          {i.status !== 'ACTIVE' && (
            <Pill tone="info">
              {i.status === 'SNOOZED' && i.snoozedUntil ? `Snoozed until ${formatDate(i.snoozedUntil)}` : i.status.charAt(0) + i.status.slice(1).toLowerCase()}
            </Pill>
          )}
          <span className="insight-gen muted small" title={i.generator === 'llm' ? `Written by ${i.model ?? 'an AI model'}; every number verified against the evidence` : 'Written from the evidence by a built-in template'}>
            {i.generator === 'llm' ? 'AI-written · verified' : 'Template'}
          </span>
        </header>
        <div className="insight-body">
          <div className="insight-text">
            <h3>{i.headline}</h3>
            <p>{i.summary}</p>
            <p className="muted small">
              <strong>Next step:</strong> {i.recommendedAction}
            </p>
          </div>
          <ImpactFigure impact={i.impact} />
        </div>
        <footer className="insight-actions">
          <button className="btn btn-primary" onClick={() => onInspect(i.id)}>
            Inspect evidence
          </button>
          {canRfq && (
            <button className="btn btn-ghost" onClick={() => onDraftRfq(i.id, i.headline)}>
              Draft RFQ
            </button>
          )}
          <InsightActions insight={i} compact />
        </footer>
      </article>
    </li>
  );
}
