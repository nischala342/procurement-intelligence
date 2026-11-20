import { formatDate } from '../../../shared/lib/format';
import { Drawer } from '../../../shared/ui/Drawer';
import { Pill } from '../../../shared/ui/Pill';
import { useInsightDetail } from '../hooks';
import { CONFIDENCE_LABEL, ImpactFigure, SeverityBadge, TYPE_META } from '../meta';
import { EvidencePanel } from './EvidencePanels';
import { InsightActions } from './InsightActions';

/** Evidence & provenance: the exact numbers behind a recommendation, how it was computed, and who/what wrote the text. */
export function EvidenceDrawer({ insightId, onClose, onDraftRfq }: { insightId: string | null; onClose: () => void; onDraftRfq: (id: string, headline: string) => void }) {
  const q = useInsightDetail(insightId);
  const i = q.data;
  const single = Boolean(i && i.entities.productIds.length === 1 && i.rfq);

  return (
    <Drawer open={Boolean(insightId)} onClose={onClose} width={860} title={i ? i.headline : 'Evidence'} subtitle={i ? TYPE_META[i.type].label : undefined}>
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load the evidence'}
        </p>
      )}
      {q.isPending && <p className="muted" role="status">Loading evidence…</p>}
      {i && (
        <>
          <div className="evidence-head">
            <SeverityBadge level={i.severity} />
            <Pill tone="neutral">Confidence: {CONFIDENCE_LABEL[i.confidence]}</Pill>
            {i.status !== 'ACTIVE' && <Pill tone="info">{i.status.toLowerCase()}</Pill>}
            {i.stale && <Pill tone="warn" glyph="⚠">Not detected in the latest scan</Pill>}
          </div>

          <p>{i.summary}</p>
          <p className="muted">{i.rationale}</p>
          <p>
            <strong>Recommended action:</strong> {i.recommendedAction}
          </p>

          <h3 className="section">Impact</h3>
          <ImpactFigure impact={i.impact} />
          <p className="muted small">How it is computed: {i.impact.basis}.</p>

          <h3 className="section">Evidence</h3>
          <EvidencePanel insight={i} />

          <h3 className="section">Provenance</h3>
          <dl className="kv wide">
            <div className="kv-row">
              <dt>Analysis date</dt>
              <dd className="tnum">{formatDate(i.asOf)}</dd>
            </div>
            {i.window?.from && (
              <div className="kv-row">
                <dt>Data window</dt>
                <dd className="tnum">
                  {formatDate(i.window.from)} – {formatDate(i.window.to)}
                </dd>
              </div>
            )}
            <div className="kv-row">
              <dt>First detected</dt>
              <dd className="tnum">{formatDate(i.firstDetectedAt, true)}</dd>
            </div>
            <div className="kv-row">
              <dt>Last confirmed</dt>
              <dd className="tnum">{formatDate(i.lastDetectedAt, true)}</dd>
            </div>
            <div className="kv-row">
              <dt>Records</dt>
              <dd>
                {i.entities.productIds.map((id) => (
                  <a key={id} className="link" href={`#/products?open=${id}`}>
                    Product
                  </a>
                )).reduce<React.ReactNode[]>((a, x, n) => (n ? [...a, ' · ', x] : [x]), [])}
                {i.entities.productIds.length > 0 && i.entities.vendorIds.length > 0 && ' · '}
                {i.entities.vendorIds.map((id, n) => (
                  <a key={id} className="link" href={`#/vendors?open=${id}`}>
                    {`Vendor ${n + 1}`}
                  </a>
                )).reduce<React.ReactNode[]>((a, x, n) => (n ? [...a, ' · ', x] : [x]), [])}
              </dd>
            </div>
            <div className="kv-row">
              <dt>Text written by</dt>
              <dd>
                {i.generator === 'llm' ? `AI (${i.model ?? 'model'}), every number verified against this evidence` : 'Built-in template, written directly from this evidence'}
                {i.fallbackReason && <span className="muted small block">AI text not used: {i.fallbackReason}</span>}
              </dd>
            </div>
          </dl>

          {i.statusHistory.length > 0 && (
            <>
              <h3 className="section">History</h3>
              <ul className="issues">
                {[...i.statusHistory].reverse().map((h, n) => (
                  <li key={n}>
                    <span className="tnum">{formatDate(h.at, true)}</span>: {h.status.toLowerCase()}
                    {h.by && h.by !== 'system' ? ` by ${h.by}` : h.by === 'system' ? ' (system)' : ''}
                    {h.note ? `. ${h.note}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="evidence-actions">
            {single && (
              <button className="btn btn-primary" onClick={() => onDraftRfq(i.id, i.headline)}>
                Draft RFQ
              </button>
            )}
            <InsightActions insight={i} />
          </div>
        </>
      )}
    </Drawer>
  );
}
