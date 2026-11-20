import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { formatMoney } from '../../../shared/lib/format';
import type { PriceSeries } from '../types';

const COLORS = ['#4f46e5', '#0891b2', '#d97706', '#be123c', '#7c3aed', '#15803d', '#475569', '#c026d3'];
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
const W = 680;
const H = 270;
const M = { l: 62, r: 18, t: 14, b: 34 };

function Marker({ shape, x, y, color, size = 4.5 }: { shape: (typeof SHAPES)[number]; x: number; y: number; color: string; size?: number }) {
  const s = size;
  if (shape === 'square') return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} />;
  if (shape === 'triangle') return <polygon points={`${x},${y - s - 1} ${x + s + 1},${y + s} ${x - s - 1},${y + s}`} fill={color} />;
  if (shape === 'diamond') return <polygon points={`${x},${y - s - 1} ${x + s + 1},${y} ${x},${y + s + 1} ${x - s - 1},${y}`} fill={color} />;
  return <circle cx={x} cy={y} r={s} fill={color} />;
}

const niceTicks = (min: number, max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => min + ((max - min) * i) / n);

interface Props {
  series: PriceSeries[];
  granularity: 'month' | 'quarter';
}

/**
 * Interactive multi-product price trend (base currency per base unit). Hover or use the arrow keys to read exact values;
 * series differ by colour AND marker shape, and a data table alternative is available.
 */
export function PriceTrendChart({ series, granularity }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(series.slice(0, 4).map((s) => s.productId)));
  const [mode, setMode] = useState<'price' | 'index'>('price');
  const [hover, setHover] = useState<number | null>(null);

  const colorOf = (id: string) => series.findIndex((s) => s.productId === id);
  const active = useMemo(() => series.filter((s) => selected.has(s.productId)), [series, selected]);
  const periods = useMemo(() => [...new Set(active.flatMap((s) => s.points.map((p) => p.period)))].sort(), [active]);

  const value = (s: PriceSeries, period: string): number | null => {
    const p = s.points.find((x) => x.period === period);
    if (!p) return null;
    return mode === 'price' ? p.avgPrice : (p.avgPrice / s.points[0]!.avgPrice) * 100; // index: first observation = 100
  };

  const all = active.flatMap((s) => periods.map((p) => value(s, p)).filter((v): v is number => v != null));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const pad = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.15;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const x = (i: number) => M.l + (periods.length <= 1 ? plotW / 2 : (i * plotW) / (periods.length - 1));
  const y = (v: number) => M.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const fmtY = (v: number) => (mode === 'price' ? formatMoney(v) : v.toFixed(0));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!periods.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < periods.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!periods.length) return;
    if (e.key === 'ArrowRight') (e.preventDefault(), setHover((h) => Math.min(periods.length - 1, (h ?? -1) + 1)));
    else if (e.key === 'ArrowLeft') (e.preventDefault(), setHover((h) => Math.max(0, (h ?? periods.length) - 1)));
    else if (e.key === 'Escape') setHover(null);
  };

  if (!series.length) return <p className="muted">No dated price observations yet. Ingest price lists or invoices with dates to see trends.</p>;

  return (
    <div className="trend">
      <div className="trend-controls">
        <div className="chips" role="group" aria-label="Products shown on the chart">
          {series.map((s, i) => {
            const on = selected.has(s.productId);
            const ci = colorOf(s.productId);
            return (
              <button key={s.productId} type="button" className={`legend-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(s.productId)}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <Marker shape={SHAPES[ci % SHAPES.length]!} x={7} y={7} color={on ? COLORS[ci % COLORS.length]! : '#9ca3af'} size={4} />
                </svg>
                {s.name}
                <span className="sr-only">{i >= 0 ? (on ? ' (shown)' : ' (hidden)') : ''}</span>
              </button>
            );
          })}
        </div>
        <div className="seg" role="group" aria-label="Chart scale">
          <button type="button" aria-pressed={mode === 'price'} className={mode === 'price' ? 'on' : ''} onClick={() => setMode('price')}>
            Price
          </button>
          <button type="button" aria-pressed={mode === 'index'} className={mode === 'index' ? 'on' : ''} onClick={() => setMode('index')} title="Each product's first observation = 100, to compare inflation across products">
            Index
          </button>
        </div>
      </div>

      {active.length === 0 ? (
        <p className="muted">Select at least one product to chart.</p>
      ) : (
        <div className="trend-plot">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="group"
            aria-label={`Unit price over time by ${granularity}, ${active.length} product${active.length > 1 ? 's' : ''}. Use left and right arrow keys to inspect values.`}
            tabIndex={0}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onKeyDown={onKey}
            onFocus={() => setHover((h) => h ?? 0)}
          >
            {niceTicks(yMin, yMax).map((t) => (
              <g key={t}>
                <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
                <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280" className="tnum">
                  {fmtY(t)}
                </text>
              </g>
            ))}
            {periods.map((p, i) => (
              <text key={p} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="#6b7280">
                {p}
              </text>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + plotH} stroke="#9ca3af" strokeDasharray="4 3" />}
            {active.map((s) => {
              const ci = colorOf(s.productId);
              const color = COLORS[ci % COLORS.length]!;
              const shape = SHAPES[ci % SHAPES.length]!;
              const pts = periods.map((p, i) => ({ i, v: value(s, p) })).filter((d): d is { i: number; v: number } => d.v != null);
              return (
                <g key={s.productId}>
                  {pts.length > 1 && <polyline points={pts.map((d) => `${x(d.i)},${y(d.v)}`).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
                  {pts.map((d) => (
                    <Marker key={d.i} shape={shape} x={x(d.i)} y={y(d.v)} color={color} size={hover === d.i ? 6 : 4.2} />
                  ))}
                </g>
              );
            })}
          </svg>
          {hover != null && periods[hover] && (
            <div className="trend-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
              <strong>{periods[hover]}</strong>
              {active.map((s) => {
                const v = value(s, periods[hover!]!);
                const ci = colorOf(s.productId);
                return (
                  <div key={s.productId} className="trend-tip-row">
                    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                      <Marker shape={SHAPES[ci % SHAPES.length]!} x={7} y={7} color={COLORS[ci % COLORS.length]!} size={4} />
                    </svg>
                    <span>{s.name}</span>
                    <span className="tnum">{v == null ? '—' : mode === 'price' ? `${formatMoney(v)} / ${s.baseUnit}` : v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <details className="trend-table">
        <summary>Show data table</summary>
        <div className="table-wrap">
          <table className="grid compact">
            <thead>
              <tr>
                <th scope="col">Period</th>
                {active.map((s) => (
                  <th key={s.productId} scope="col" className="num">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p}>
                  <th scope="row">{p}</th>
                  {active.map((s) => {
                    const v = value(s, p);
                    return (
                      <td key={s.productId} className="num tnum">
                        {v == null ? '—' : mode === 'price' ? formatMoney(v) : v.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
