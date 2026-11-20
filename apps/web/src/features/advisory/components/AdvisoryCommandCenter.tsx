import { useEffect, useId, useState } from 'react';
import { formatDate, formatMoney } from '../../../shared/lib/format';
import { Card } from '../../../shared/ui/Card';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { useAdvisorySummary, useInsights, useRunScan } from '../hooks';
import { TYPE_META, TYPE_ORDER } from '../meta';
import type { InsightFilters, InsightStatus, InsightType, Level, ScanResult } from '../types';
import { EvidenceDrawer } from './EvidenceDrawer';
import { InsightCard } from './InsightCard';
import { RfqDraftModal } from './RfqDraftModal';

const STATUS_OPTIONS: Array<[InsightFilters['status'], string]> = [
  ['ACTIVE', 'Active'],
  ['ACTIONED', 'Actioned'],
  ['SNOOZED', 'Snoozed'],
  ['DISMISSED', 'Dismissed'],
  ['ALL', 'All'],
];

function ScanBanner({ r }: { r: ScanResult }) {
  const reason = r.asOfReason === 'latest_data' ? `Analysed as of ${formatDate(r.asOf)}, the date of your latest price data (it is ${r.freshness.daysOld} days old).` : r.asOfReason === 'requested' ? `Analysed as of ${formatDate(r.asOf)}.` : `Analysed as of today (${formatDate(r.asOf)}).`;
  return (
    <p className="scan-banner" role="status">
      <strong>Scan complete.</strong> {reason} {r.signalsDetected} signal{r.signalsDetected === 1 ? '' : 's'} detected: {r.created} new, {r.updated} updated, {r.unchanged} unchanged
      {r.reopened ? `, ${r.reopened} reopened` : ''}
      {r.markedStale ? `, ${r.markedStale} no longer detected` : ''}. Text by {r.llmEnabled ? `AI for ${r.narratedByLlm} and template for ${r.narratedByTemplate}${r.llmFallbacks ? ` (${r.llmFallbacks} AI draft(s) rejected for ungrounded numbers or errors)` : ''}` : 'built-in templates (no AI key configured)'}.
      {r.skippedQuietReorder > 0 && ` ${r.skippedQuietReorder} product(s) skipped for reorder alerts because purchasing has gone quiet.`}
    </p>
  );
}

/** The actionable-insights command center: category strip, scan control, filters, and the prioritised feed. */
export function AdvisoryCommandCenter({ typeParam, onTypeConsumed }: { typeParam?: string | null; onTypeConsumed?: () => void } = {}) {
  const [filters, setFilters] = useState<InsightFilters>({ status: 'ACTIVE', page: 1 });
  // deep link: #/advisory?type=SOURCING_SHIFT opens the feed filtered to that type
  useEffect(() => {
    if (!typeParam) return;
    if ((TYPE_ORDER as string[]).includes(typeParam)) setFilters({ status: 'ACTIVE', page: 1, type: typeParam as InsightType });
    onTypeConsumed?.();
  }, [typeParam, onTypeConsumed]);
  const [asOf, setAsOf] = useState('');
  const [inspect, setInspect] = useState<string | null>(null);
  const [rfq, setRfq] = useState<{ id: string; headline: string } | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const asOfId = useId();
  const summary = useAdvisorySummary();
  const insights = useInsights(filters);
  const scan = useRunScan();
  const s = summary.data;
  const items = insights.data?.data ?? [];
  const neverScanned = summary.isSuccess && !s?.lastScan;

  const setType = (type?: InsightType) => setFilters((f) => ({ ...f, ...(type ? { type } : { type: undefined }), page: 1 }));
  const run = () => scan.mutate(asOf || undefined, { onSuccess: (r) => setLastScan(r) });

  return (
    <>
      <Card
        title="quoteScout insights"
        action={
          <div className="scan-control">
            <label htmlFor={asOfId} className="muted small">
              Analyse as of
            </label>
            <input id={asOfId} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} max={new Date().toISOString().slice(0, 10)} title="Optional. Defaults to today, or to your latest data when it is more than 45 days old." />
            <button className="btn btn-primary" onClick={run} disabled={scan.isPending} aria-busy={scan.isPending}>
              {scan.isPending ? 'Scanning…' : 'Run Intelligence Scan'}
            </button>
          </div>
        }
      >
        <p className="muted">Evidence-backed recommendations computed from your normalised purchasing data. Every figure traces back to records you can inspect.</p>
        {scan.isError && (
          <p className="error" role="alert">
            {scan.error instanceof Error ? scan.error.message : 'The scan failed'}
          </p>
        )}
        {lastScan && <ScanBanner r={lastScan} />}
        {!lastScan && s?.lastScan?.summary && (
          <p className="muted small">
            Last scan {s.lastScan.finishedAt ? formatDate(s.lastScan.finishedAt, true) : ''}, analysed as of {formatDate(s.lastScan.asOf)}
            {s.lastScan.asOfReason === 'latest_data' ? ' (your latest data)' : ''}.
          </p>
        )}

        <div className="category-strip" role="group" aria-label="Insight categories">
          {TYPE_ORDER.map((t) => {
            const c = s?.byType[t];
            const active = filters.type === t;
            return (
              <button key={t} type="button" className={`category ${active ? 'on' : ''}`} aria-pressed={active} onClick={() => setType(active ? undefined : t)}>
                <span className="category-top">
                  <span aria-hidden="true">{TYPE_META[t].glyph}</span> {TYPE_META[t].label}
                </span>
                <strong className="category-count tnum">{summary.isPending ? '–' : (c?.count ?? 0)}</strong>
                <span className="muted small">{TYPE_META[t].blurb}</span>
                {c && c.potentialSavings > 0 && <span className="category-save small tnum">≈ {formatMoney(c.potentialSavings)} potential</span>}
              </button>
            );
          })}
        </div>
        {s && s.activeTotal > 0 && <p className="muted small">{s.note}</p>}
      </Card>

      <Card title="Insights">
        <div className="filters">
          <select aria-label="Filter by category" value={filters.type ?? ''} onChange={(e) => setType((e.target.value || undefined) as InsightType | undefined)}>
            <option value="">All categories</option>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </select>
          <select aria-label="Filter by severity" value={filters.severity ?? ''} onChange={(e) => setFilters((f) => ({ ...f, severity: (e.target.value || undefined) as Level | undefined, page: 1 }))}>
            <option value="">All severities</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as InsightStatus | 'ALL', page: 1 }))}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>

        {insights.isError && (
          <p className="error" role="alert">
            {insights.error instanceof Error ? insights.error.message : 'Failed to load insights'}
          </p>
        )}
        {insights.isPending ? (
          <div aria-busy="true" aria-label="Loading insights">
            {[0, 1, 2].map((n) => (
              <div key={n} className="insight skeleton-card">
                <span className="skeleton" style={{ width: '40%' }} />
                <span className="skeleton" style={{ width: '85%', height: 16 }} />
                <span className="skeleton" style={{ width: '70%' }} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={neverScanned ? 'No scan has been run yet' : filters.status === 'ACTIVE' && !filters.type && !filters.severity ? 'No active insights' : 'No insights match these filters'}
            hint={
              neverScanned
                ? 'Run an intelligence scan to look for cost creep, overpriced suppliers, fragmented spend, reorder risks and verified market savings.'
                : filters.status === 'ACTIVE' && !filters.type && !filters.severity
                  ? 'Nothing needs attention right now. Run a scan after ingesting new data, or review actioned and dismissed items.'
                  : 'Try clearing the filters.'
            }
            action={neverScanned ? <button className="btn btn-primary" onClick={run} disabled={scan.isPending}>Run Intelligence Scan</button> : undefined}
          />
        ) : (
          <ul className="insight-feed" aria-label="Insights, most severe first">
            {items.map((i) => (
              <InsightCard key={i.id} insight={i} onInspect={setInspect} onDraftRfq={(id, headline) => setRfq({ id, headline })} />
            ))}
          </ul>
        )}
        {insights.data && <Pagination meta={insights.data.meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />}
      </Card>

      <EvidenceDrawer insightId={inspect} onClose={() => setInspect(null)} onDraftRfq={(id, headline) => setRfq({ id, headline })} />
      <RfqDraftModal insightId={rfq?.id ?? null} {...(rfq ? { headline: rfq.headline } : {})} onClose={() => setRfq(null)} />
    </>
  );
}
