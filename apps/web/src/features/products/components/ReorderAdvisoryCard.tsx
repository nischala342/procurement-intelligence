import { useEffect, useId, useState, type FormEvent } from 'react';
import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { Pill, type Tone } from '../../../shared/ui/Pill';
import { useSaveReorderSettings } from '../hooks';
import type { ProductIntelligence, ReorderStatus } from '../types';

const STATUS: Record<ReorderStatus, { tone: Tone; glyph: string; label: string }> = {
  order_now: { tone: 'bad', glyph: '!', label: 'Order now' },
  order_soon: { tone: 'warn', glyph: '◔', label: 'Order soon' },
  ok: { tone: 'ok', glyph: '✓', label: 'Stock OK' },
  insufficient_data: { tone: 'neutral', glyph: '○', label: 'Not enough data' },
};
const METHOD = { configured_days: 'configured cover', statistical: 'statistical (95% service level)', fallback_percentage: '25% of lead-time demand' } as const;

function Settings({ data }: { data: ProductIntelligence }) {
  const leadId = useId();
  const safeId = useId();
  const save = useSaveReorderSettings(data.product.id);
  const [lead, setLead] = useState(data.product.leadTimeDays == null ? '' : String(data.product.leadTimeDays));
  const [safe, setSafe] = useState(data.product.safetyStockDays == null ? '' : String(data.product.safetyStockDays));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLead(data.product.leadTimeDays == null ? '' : String(data.product.leadTimeDays));
    setSafe(data.product.safetyStockDays == null ? '' : String(data.product.safetyStockDays));
  }, [data.product.leadTimeDays, data.product.safetyStockDays]);

  const parse = (v: string): number | null | undefined => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 365 ? n : undefined;
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l = parse(lead);
    const s = parse(safe);
    if (l === undefined || s === undefined) return setError('Enter whole days between 0 and 365, or leave blank to use the default.');
    setError(null);
    save.mutate({ leadTimeDays: l, safetyStockDays: s });
  };

  return (
    <form className="terms-form" onSubmit={submit}>
      <label htmlFor={leadId}>Lead time (days)</label>
      <input id={leadId} inputMode="numeric" placeholder="14 (default)" value={lead} onChange={(e) => setLead(e.target.value)} />
      <label htmlFor={safeId}>Safety stock (days of cover)</label>
      <input id={safeId} inputMode="numeric" placeholder="auto" value={safe} onChange={(e) => setSafe(e.target.value)} />
      <button className="btn btn-primary" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save & recalculate'}
      </button>
      {(error || save.isError) && (
        <p className="error" role="alert">
          {error ?? (save.error instanceof Error ? save.error.message : 'Could not save')}
        </p>
      )}
    </form>
  );
}

/** Actionable reorder guidance derived from purchase velocity, lead time and a safety buffer. */
export function ReorderAdvisoryCard({ data }: { data: ProductIntelligence }) {
  const r = data.reorder;
  const m = STATUS[r.status];
  const unit = data.product.baseUnit;
  return (
    <section className="reorder" aria-label="Reorder recommendation">
      <div className="reorder-head">
        <Pill tone={m.tone} glyph={m.glyph}>
          {m.label}
        </Pill>
        <span className="muted small">As of {formatDate(data.asOf)}</span>
      </div>

      {r.status === 'insufficient_data' ? (
        <p className="muted">{r.reason}</p>
      ) : (
        <>
          <div className="reorder-grid">
            <div>
              <span className="hero-label">Recommended order</span>
              <strong className="hero-value tnum">
                {formatNumber(r.recommendedOrderQty)} {unit}
              </strong>
              <span className="muted small tnum">≈ one {formatNumber(r.coverDays)}-day cycle{r.estimatedOrderCost != null ? ` · ${formatMoney(r.estimatedOrderCost)}` : ''}</span>
            </div>
            <div>
              <span className="hero-label">Reorder point</span>
              <strong className="hero-value tnum">
                {formatNumber(r.reorderPoint)} {unit}
              </strong>
              <span className="muted small tnum">
                incl. safety stock {formatNumber(r.safetyStock)} {unit}
                {r.safetyStockMethod ? ` (${METHOD[r.safetyStockMethod]})` : ''}
              </span>
            </div>
            <div>
              <span className="hero-label">Estimated stock</span>
              <strong className="hero-value tnum">
                {formatNumber(r.estimatedStockOnHand)} {unit}
              </strong>
              <span className="muted small tnum">{r.daysOfCoverRemaining != null ? `≈ ${formatNumber(r.daysOfCoverRemaining)} days of cover` : ''}</span>
            </div>
            <div>
              <span className="hero-label">Order by</span>
              <strong className="hero-value tnum">{r.status === 'order_now' ? 'Now' : formatDate(r.orderByDate)}</strong>
              <span className="muted small tnum">
                lead time {r.leadTimeDays} days {r.leadTimeSource === 'assumed_default' ? '(assumed default)' : '(configured)'}
              </span>
            </div>
          </div>
          {r.assumptions && (
            <details className="trend-table">
              <summary>Assumptions</summary>
              <ul className="issues">
                {r.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Settings data={data} />
    </section>
  );
}
