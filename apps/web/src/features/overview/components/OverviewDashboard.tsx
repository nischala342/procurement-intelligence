import { useState, type ReactNode } from 'react';
import { formatDate, formatMoney, formatMoneyCompact, formatMonth } from '../../../shared/lib/format';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { TYPE_META, TYPE_ORDER } from '../../advisory';
import { useOverview } from '../hooks';
import type { Overview } from '../types';
import { BarList, ColumnChart, DataTable, LineChart, SERIES, STATUS, SegmentedBar, TileSpark } from './charts';
import { DemoTour } from './DemoTour';

const RANGES = [6, 12, 24] as const;
const DELIVERY_TARGET = 85; // same target the delivery-risk detector uses

const SOURCE_NAME: Record<string, string> = { purchase_orders: 'Purchase orders (ERP)', price_sheet: 'Price sheets', tally: 'Tally', shopify: 'Shopify', bank_statement: 'Bank statements', pdf_invoice: 'Invoices' };

function onTimeStatus(p: number | null): { icon: string; label: string; color: string } | null {
  if (p == null) return null;
  if (p >= DELIVERY_TARGET) return { icon: '✓', label: 'On target', color: STATUS.good };
  if (p >= 70) return { icon: '!', label: 'Below target', color: STATUS.warning };
  return { icon: '▲', label: 'Well below target', color: STATUS.serious };
}

function Tile({ label, value, sub, accent, children }: { label: string; value: ReactNode; sub?: ReactNode; accent: string; children?: ReactNode }) {
  return (
    <div className="tile" style={{ ['--tile-accent' as string]: accent }}>
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
      {children}
    </div>
  );
}

function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Kpis({ o }: { o: Overview }) {
  const k = o.kpis;
  const st = onTimeStatus(k.onTimePct);
  const delta = k.spendChangePct;
  return (
    <div className="tiles">
      <div className="tile hero">
        <span className="tile-label">Spend, last {o.window.months} months</span>
        <strong className="hero-value">{formatMoneyCompact(k.spend)}</strong>
        <span className="tile-sub">
          {formatMoney(k.spend)}
          {delta != null && (
            <>
              {' · '}
              <span className="delta">
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta)}% vs the {o.window.months} months before
              </span>
            </>
          )}
        </span>
        <TileSpark values={o.monthly.map((m) => m.spend)} label="Monthly spend trend" />
      </div>
      <Tile label="Active suppliers" value={k.activeSuppliers} sub={`${k.productsBought} products bought · ${k.purchaseLines.toLocaleString('en-GB')} PO lines`} accent={SERIES[1]} />
      <Tile label="On-time delivery" value={k.onTimePct != null ? `${k.onTimePct}%` : '—'} accent={SERIES[2]} sub={k.onTimePct != null ? `${k.deliveriesMeasured.toLocaleString('en-GB')} deliveries · target ${DELIVERY_TARGET}%` : 'No delivery dates in your data'}>
        {st && (
          <span className="status-chip">
            <span className="status-dot" style={{ background: st.color }} aria-hidden="true">
              {st.icon}
            </span>
            {st.label}
          </span>
        )}
      </Tile>
      <Tile label="Maverick spend" value={k.maverickPct != null ? `${k.maverickPct}%` : '—'} sub={k.maverickPct != null ? 'of PO spend bought off-contract' : 'Needs purchase-order data'} accent={SERIES[4]} />
      <Tile label="Price vs budget" value={k.budgetVariancePct != null ? `${k.budgetVariancePct > 0 ? '+' : ''}${k.budgetVariancePct}%` : '—'} accent={SERIES[3]} sub={k.budgetVariancePct != null ? (k.budgetVariancePct <= 0 ? <span className="good-text">▼ paying under budget overall</span> : <span className="bad-text">▲ paying over budget overall</span>) : 'No budget prices in your data'} />
      <Tile label="Savings identified" value={formatMoneyCompact(o.insights.potentialSavings)} accent={SERIES[6]} sub={<a href="#/advisory" className="link">{o.insights.active} active recommendations →</a>} />
    </div>
  );
}

export function OverviewDashboard({ email, organizationName }: { email?: string; organizationName?: string }) {
  const [months, setMonths] = useState<number>(12);
  const q = useOverview(months);
  const o = q.data;

  const header = (
    <header className="overview-head">
      <div>
        <p className="eyebrow">{o?.country ? `${o.country} · ${o.currency}` : 'Overview'}</p>
        <h1>{organizationName ?? 'Overview'}</h1>
        {o && (
          <p className="subtitle">
            {formatDate(o.window.from)} to {formatDate(o.window.to)}
            {o.asOfReason === 'latest_data' ? ' · analysed as of your latest data' : ''}
          </p>
        )}
      </div>
      <div className="seg" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r} type="button" className={r === months ? 'on' : ''} aria-pressed={r === months} onClick={() => setMonths(r)}>
            {r} months
          </button>
        ))}
      </div>
    </header>
  );

  if (q.isLoading) {
    return (
      <main className="layout wide">
        {header}
        <div className="tiles" aria-busy="true" aria-label="Loading overview">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="tile"><span className="skeleton" style={{ width: '60%' }} /><span className="skeleton" style={{ width: '40%', height: 26 }} /></div>)}</div>
      </main>
    );
  }
  if (q.isError || !o) {
    return (
      <main className="layout wide">
        {header}
        <EmptyState title="Could not load the overview" hint={q.error instanceof Error ? q.error.message : 'Please retry.'} />
      </main>
    );
  }

  if (!o.kpis.purchaseLines) {
    return (
      <main className="layout wide">
        {header}
        <DemoTour email={email} />
        <EmptyState title="No purchases in this period yet" hint="Upload purchase orders, invoices or Tally exports in Ingestion and this dashboard fills in." action={<a className="btn btn-primary" href="#/ingestion">Go to Ingestion</a>} />
      </main>
    );
  }

  const monthly = o.monthly;
  const typeRows = TYPE_ORDER.filter((t) => o.insights.byType[t]).map((t) => ({
    key: t,
    label: (
      <a className="link" href={`#/advisory?type=${t}`}>
        {TYPE_META[t].label}
      </a>
    ),
    value: o.insights.byType[t] ?? 0,
    valueLabel: String(o.insights.byType[t] ?? 0),
    color: SERIES[6],
    tip: TYPE_META[t].blurb,
  }));

  return (
    <main className="layout wide overview">
      {header}
      <DemoTour email={email} />
      <Kpis o={o} />

      <div className="panels two">
        <Panel title="Monthly spend" subtitle={`What was paid per month (${o.currency}), purchase lines only`}>
          <ColumnChart
            ariaLabel={`Monthly spend over the last ${months} months`}
            formatTick={(n) => formatMoneyCompact(n)}
            formatValue={(n) => formatMoneyCompact(n)}
            data={monthly.map((m) => ({
              key: m.month,
              label: formatMonth(m.month),
              value: m.spend,
              tip: (
                <>
                  <strong>{formatMonth(m.month, true)}</strong>
                  <span>{formatMoney(m.spend)}</span>
                  <span className="muted">{m.lines} purchase lines</span>
                </>
              ),
            }))}
          />
          <DataTable caption="Monthly spend" head={['Month', 'Spend', 'Lines', 'On time']} rows={monthly.map((m) => [formatMonth(m.month, true), formatMoney(m.spend), m.lines, m.onTimePct != null ? `${m.onTimePct}%` : '—'])} />
        </Panel>
        <Panel title="On-time delivery" subtitle="Share of PO lines delivered by the requested date">
          {o.kpis.onTimePct == null ? (
            <EmptyState title="No delivery data" hint="Purchase-order exports with requested and actual delivery dates enable this chart." />
          ) : (
            <LineChart
              ariaLabel="On-time delivery rate by month"
              reference={{ value: DELIVERY_TARGET, label: `Target ${DELIVERY_TARGET}%` }}
              data={monthly.map((m) => ({
                key: m.month,
                label: formatMonth(m.month),
                value: m.onTimePct,
                tip: (
                  <>
                    <strong>{formatMonth(m.month, true)}</strong>
                    <span>{m.onTimePct != null ? `${m.onTimePct}% on time` : 'No deliveries'}</span>
                  </>
                ),
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="panels two">
        <Panel title="Spend by category" subtitle={`Share of ${formatMoneyCompact(o.kpis.spend)}`}>
          <BarList
            ariaLabel="Spend by category"
            rows={o.byCategory.map((c, i) => ({
              key: c.category,
              label: c.category === 'Other' ? `Other (${c.categories} categories)` : c.category,
              value: c.spend,
              valueLabel: `${formatMoneyCompact(c.spend)} · ${c.sharePct ?? 0}%`,
              color: c.category === 'Other' ? STATUS.neutral : SERIES[i % SERIES.length]!,
              tip: formatMoney(c.spend),
            }))}
          />
        </Panel>
        <Panel title="Top suppliers" subtitle="By spend, with on-time delivery in the same period" action={<a className="link" href="#/vendors">All suppliers →</a>}>
          <BarList
            ariaLabel="Top suppliers by spend"
            rows={o.topSuppliers.map((s) => {
              const st = onTimeStatus(s.onTimePct);
              return {
                key: s.vendorId,
                label: (
                  <a className="link" href={`#/vendors?open=${s.vendorId}`}>
                    {s.name}
                  </a>
                ),
                value: s.spend,
                valueLabel: `${formatMoneyCompact(s.spend)} · ${s.sharePct ?? 0}%`,
                color: SERIES[0],
                tip: `${s.name}${s.country ? ` (${s.country})` : ''}: ${formatMoney(s.spend)}, ${s.lines} lines`,
                detail: st ? (
                  <span className="status-chip small" title={st.label}>
                    <span className="status-dot" style={{ background: st.color }} aria-hidden="true">
                      {st.icon}
                    </span>
                    {s.onTimePct}% on time
                  </span>
                ) : undefined,
              };
            })}
          />
        </Panel>
      </div>

      <div className="panels two">
        <Panel title="Recommendations" subtitle="Active, evidence-backed insights by type" action={<a className="link" href="#/advisory">Open Advisory →</a>}>
          <SegmentedBar
            ariaLabel="Active recommendations by severity"
            parts={[
              { key: 'HIGH', label: `High severity (${o.insights.bySeverity.HIGH})`, value: o.insights.bySeverity.HIGH, color: STATUS.critical },
              { key: 'MEDIUM', label: `Medium (${o.insights.bySeverity.MEDIUM})`, value: o.insights.bySeverity.MEDIUM, color: STATUS.warning, ink: '#0b0b0b' },
              { key: 'LOW', label: `Low (${o.insights.bySeverity.LOW})`, value: o.insights.bySeverity.LOW, color: STATUS.neutral, ink: '#0b0b0b' },
            ]}
          />
          {typeRows.length ? <BarList ariaLabel="Active recommendations by type" rows={typeRows} /> : <p className="muted small">No active recommendations. Run an analysis in Advisory.</p>}
        </Panel>
        <Panel title="Data sources" subtitle="Transactions in your unified ledger, by where they came from" action={<a className="link" href="#/ingestion">Upload more →</a>}>
          <BarList
            ariaLabel="Transactions by source"
            rows={o.sources.map((s, i) => ({ key: s.sourceType, label: SOURCE_NAME[s.sourceType] ?? s.sourceType, value: s.transactions, valueLabel: s.transactions.toLocaleString('en-GB'), color: SERIES[(i + 2) % SERIES.length]! }))}
          />
          <dl className="mini-stats">
            <div>
              <dt>Suppliers on file</dt>
              <dd>{o.kpis.totalSuppliers}</dd>
            </div>
            <div>
              <dt>Products on file</dt>
              <dd>{o.kpis.totalProducts}</dd>
            </div>
            <div>
              <dt>Contract coverage</dt>
              <dd>{o.kpis.contractCoveragePct != null ? `${o.kpis.contractCoveragePct}%` : '—'}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </main>
  );
}
