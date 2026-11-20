import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatDate, formatMoney } from '../../../shared/lib/format';
import { ChartMarker, MARKER_SHAPES, SERIES_COLORS } from '../../../shared/ui/ChartMarker';
import type { PricePoint } from '../types';

const W = 720;
const H = 290;
const M = { l: 66, r: 24, t: 16, b: 34 };
const DAY = 86_400_000;

interface Props {
  points: PricePoint[];
  baseUnit: string;
  lowestPurchase: number | null;
  weightedAvg: number | null;
}

/**
 * Unit price over time. Filled markers are purchases (joined by a line), hollow markers are supplier quotes.
 * Marker colour AND shape identify the supplier. Hover, or focus the chart and use the arrow keys, to read exact values.
 */
export function PriceHistoryChart({ points, baseUnit, lowestPurchase, weightedAvg }: Props) {
  const [showQuotes, setShowQuotes] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  const dated = useMemo(
    () =>
      points
        .filter((p): p is PricePoint & { date: string } => Boolean(p.date))
        .map((p) => ({ ...p, t: new Date(p.date).getTime() }))
        .sort((a, b) => a.t - b.t),
    [points],
  );
  const vendorIds = useMemo(() => [...new Set(dated.map((p) => p.vendorId ?? 'unknown'))], [dated]);
  const styleOf = (id: string | null) => {
    const i = Math.max(0, vendorIds.indexOf(id ?? 'unknown'));
    return { color: SERIES_COLORS[i % SERIES_COLORS.length]!, shape: MARKER_SHAPES[i % MARKER_SHAPES.length]! };
  };
  const visible = useMemo(() => dated.filter((p) => showQuotes || p.kind === 'purchase'), [dated, showQuotes]);

  if (!dated.length) {
    return <p className="muted">No dated price observations yet. Ingest invoices or price lists with dates to see the price history.</p>;
  }

  const prices = visible.map((p) => p.price).concat([lowestPurchase, weightedAvg].filter((v): v is number => v != null));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo || hi * 0.1 || 1) * 0.18;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const t0 = dated[0]!.t;
  const t1 = dated[dated.length - 1]!.t;
  const span = Math.max(t1 - t0, DAY);
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const x = (t: number) => M.l + (t1 === t0 ? plotW / 2 : ((t - t0) / span) * plotW);
  const y = (v: number) => M.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = t1 === t0 ? [t0] : Array.from({ length: 5 }, (_, i) => t0 + (span * i) / 4);
  const purchaseLine = visible.filter((p) => p.kind === 'purchase');
  const activePoint = active != null ? visible[active] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bestD = Infinity;
    visible.forEach((p, i) => {
      const d = (x(p.t) - px) ** 2 + (y(p.price) - py) ** 2;
      if (d < bestD) (bestD = d), (best = i);
    });
    setActive(best >= 0 && bestD < 60 ** 2 ? best : null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') (e.preventDefault(), setActive((a) => Math.min(visible.length - 1, (a ?? -1) + 1)));
    else if (e.key === 'ArrowLeft') (e.preventDefault(), setActive((a) => Math.max(0, (a ?? visible.length) - 1)));
    else if (e.key === 'Escape') setActive(null);
  };

  const vendors = vendorIds.map((id) => ({ id, name: dated.find((p) => (p.vendorId ?? 'unknown') === id)?.vendorName ?? 'Unknown supplier' }));

  return (
    <div className="trend">
      <div className="trend-controls">
        <div className="chips" aria-label="Suppliers">
          {vendors.map((v) => {
            const s = styleOf(v.id === 'unknown' ? null : v.id);
            return (
              <span key={v.id} className="legend-chip on">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <ChartMarker shape={s.shape} x={7} y={7} color={s.color} size={4} />
                </svg>
                {v.name}
              </span>
            );
          })}
        </div>
        <div className="chart-key">
          <span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="#475569" />
            </svg>{' '}
            Purchase
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="4.2" fill="#fff" stroke="#475569" strokeWidth="1.8" />
            </svg>{' '}
            Quote
          </span>
          <label className="check">
            <input type="checkbox" checked={showQuotes} onChange={(e) => (setShowQuotes(e.target.checked), setActive(null))} />
            Show quotes
          </label>
        </div>
      </div>

      <div className="trend-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={`Unit price per ${baseUnit} over time, ${visible.length} observations. Use left and right arrow keys to inspect each point.`}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? 0)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280" className="tnum">
                {formatMoney(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="11" fill="#6b7280">
              {new Date(t).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
            </text>
          ))}
          {lowestPurchase != null && (
            <g>
              <line x1={M.l} x2={W - M.r} y1={y(lowestPurchase)} y2={y(lowestPurchase)} stroke="#15803d" strokeDasharray="5 4" />
              <text x={W - M.r - 4} y={y(lowestPurchase) - 5} textAnchor="end" fontSize="10.5" fill="#15803d">
                Lowest paid
              </text>
            </g>
          )}
          {weightedAvg != null && (
            <g>
              <line x1={M.l} x2={W - M.r} y1={y(weightedAvg)} y2={y(weightedAvg)} stroke="#6b7280" strokeDasharray="2 4" />
              <text x={M.l + 4} y={y(weightedAvg) - 5} fontSize="10.5" fill="#6b7280">
                Weighted avg
              </text>
            </g>
          )}
          {activePoint && <line x1={x(activePoint.t)} x2={x(activePoint.t)} y1={M.t} y2={M.t + plotH} stroke="#9ca3af" strokeDasharray="4 3" />}
          {purchaseLine.length > 1 && <polyline points={purchaseLine.map((p) => `${x(p.t)},${y(p.price)}`).join(' ')} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinejoin="round" />}
          {visible.map((p, i) => {
            const s = styleOf(p.vendorId);
            return <ChartMarker key={i} shape={s.shape} x={x(p.t)} y={y(p.price)} color={s.color} hollow={p.kind === 'quote'} size={active === i ? 6.2 : 4.4} />;
          })}
        </svg>
        {activePoint && (
          <div className="trend-tip" style={{ left: `${Math.min(70, (x(activePoint.t) / W) * 100)}%` }} role="status">
            <strong className="tnum">{formatMoney(activePoint.price)}</strong> / {baseUnit}
            <div className="trend-tip-row two">
              <span>{activePoint.kind === 'purchase' ? 'Purchased' : 'Quoted'}</span>
              <span className="tnum">{formatDate(activePoint.date)}</span>
            </div>
            <div className="trend-tip-row two">
              <span>Supplier</span>
              <span>{activePoint.vendorName ?? 'Unknown'}</span>
            </div>
            {activePoint.quantity != null && (
              <div className="trend-tip-row two">
                <span>Quantity</span>
                <span className="tnum">
                  {activePoint.quantity} {baseUnit}
                </span>
              </div>
            )}
            {activePoint.reference && (
              <div className="trend-tip-row two">
                <span>Ref</span>
                <span>{activePoint.reference}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {dated.length < points.length && <p className="muted small">{points.length - dated.length} observation(s) without a date are not plotted.</p>}

      <details className="trend-table">
        <summary>Show data table</summary>
        <div className="table-wrap">
          <table className="grid compact">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col">Supplier</th>
                <th scope="col" className="num">
                  Price / {baseUnit}
                </th>
                <th scope="col" className="num">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {dated.map((p, i) => (
                <tr key={i}>
                  <td className="tnum">{formatDate(p.date)}</td>
                  <td>{p.kind === 'purchase' ? 'Purchase' : 'Quote'}</td>
                  <td>{p.vendorName ?? '—'}</td>
                  <td className="num tnum">{formatMoney(p.price)}</td>
                  <td className="num tnum">{p.quantity ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
