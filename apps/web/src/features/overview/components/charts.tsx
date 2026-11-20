import { useState, type ReactNode } from 'react';

/**
 * Small dependency-free SVG/HTML chart kit for the overview (light surface).
 * Palette: validated categorical order (blue, orange, aqua, yellow, magenta, green, violet, red); colours follow the entity,
 * text always uses ink tokens; 2px lines, <= 24px bars with 4px rounded data ends, hairline grid, hover tooltips, and
 * every chart offers a data table.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#a3a29b' } as const;

/** Round, human tick values from 0 to >= max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function roundedTopBar(x: number, y: number, w: number, y0: number, r = 4) {
  const h = y0 - y;
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y0}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y0}Z`;
}

function Tip({ xPct, children }: { xPct: number; children: ReactNode }) {
  const align = xPct > 75 ? 'right' : xPct < 25 ? 'left' : 'center';
  return (
    <div className={`viz-tip tip-${align}`} style={{ left: `${xPct}%` }} role="status">
      {children}
    </div>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  tip: ReactNode;
}

/** Single-series columns (magnitude over time) with a per-column hover tooltip; the latest column is labelled. */
export function ColumnChart({ data, color = SERIES[0], formatTick, formatValue, ariaLabel, height = 230 }: { data: ColumnDatum[]; color?: string; formatTick: (n: number) => string; formatValue: (n: number) => string; ariaLabel: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 680;
  const H = height;
  const m = { l: 58, r: 14, t: 22, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1]!;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, band * 0.62);
  const every = Math.ceil(data.length / 8);
  const last = data.length - 1;
  return (
    <div className="viz" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-axis' : 'viz-grid'} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          return (
            <g key={d.key}>
              <path d={roundedTopBar(cx - bw / 2, y(d.value), bw, y(0))} fill={color} opacity={hover == null || hover === i ? 1 : 0.45} />
              {i % every === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="viz-tick">
                  {d.label}
                </text>
              )}
              {i === last && d.value > 0 && (
                <text x={cx} y={y(d.value) - 7} textAnchor={i === last ? 'end' : 'middle'} dx={bw / 2} className="viz-value">
                  {formatValue(d.value)}
                </text>
              )}
              <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && <Tip xPct={((m.l + band * hover + band / 2) / W) * 100}>{data[hover]!.tip}</Tip>}
    </div>
  );
}

export interface LineDatum {
  key: string;
  label: string;
  value: number | null;
  tip: ReactNode;
}

/** Single-series percentage line with an optional reference (target) line and a crosshair tooltip. */
export function LineChart({ data, color = SERIES[2], reference, ariaLabel, height = 230 }: { data: LineDatum[]; color?: string; reference?: { value: number; label: string }; ariaLabel: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 680;
  const H = height;
  const m = { l: 44, r: 16, t: 18, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  const lo = Math.max(0, Math.floor((Math.min(...vals, reference?.value ?? 100) - 10) / 10) * 10);
  const hi = 100;
  const ticks = Array.from({ length: Math.floor((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10).filter((t, i, a) => a.length <= 6 || i % 2 === 0 || t === hi);
  const x = (i: number) => m.l + (data.length <= 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const segs: string[] = [];
  let cur = '';
  data.forEach((d, i) => {
    if (d.value == null) {
      if (cur) segs.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i)},${y(d.value)}`;
  });
  if (cur) segs.push(cur);
  const lastIdx = [...data.keys()].reverse().find((i) => data[i]!.value != null);
  const every = Math.ceil(data.length / 8);
  const step = data.length > 1 ? iw / (data.length - 1) : iw;
  return (
    <div className="viz" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === lo ? 'viz-axis' : 'viz-grid'} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-tick">
              {t}%
            </text>
          </g>
        ))}
        {reference && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={y(reference.value)} y2={y(reference.value)} className="viz-ref" />
            <text x={W - m.r} y={y(reference.value) - 6} textAnchor="end" className="viz-ref-label">
              {reference.label}
            </text>
          </g>
        )}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.key} x={x(i)} y={H - 8} textAnchor="middle" className="viz-tick">
              {d.label}
            </text>
          ) : null,
        )}
        <path d={segs.join('')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && data[hover]?.value != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="viz-crosshair" />
            <circle cx={x(hover)} cy={y(data[hover]!.value!)} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        {lastIdx != null && (
          <g>
            <circle cx={x(lastIdx)} cy={y(data[lastIdx]!.value!)} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
            <text x={x(lastIdx) - 8} y={y(data[lastIdx]!.value!) - 10} textAnchor="end" className="viz-value">
              {data[lastIdx]!.value}%
            </text>
          </g>
        )}
        {data.map((d, i) => (
          <rect key={d.key} x={x(i) - step / 2} y={m.t} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && data[hover] && <Tip xPct={(x(hover) / W) * 100}>{data[hover]!.tip}</Tip>}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  valueLabel: string;
  color: string;
  detail?: ReactNode;
  tip?: string;
}

/** Horizontal bars (HTML): label | bar from a shared zero | value at the tip. Colour carries the entity, text stays ink. */
export function BarList({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="barlist" aria-label={ariaLabel}>
      {rows.map((r) => (
        <li key={r.key} title={r.tip}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track">
            <span className="barlist-bar" style={{ width: `${Math.max(0.8, (r.value / max) * 100)}%`, background: r.color }} />
          </span>
          <span className="barlist-value tnum">{r.valueLabel}</span>
          {r.detail != null && <span className="barlist-detail">{r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface Part {
  key: string;
  label: string;
  value: number;
  color: string;
  ink?: string;
}

/** Tall segmented bar: one whole split into parts, 2px gaps, values inside blocks wide enough; legend names the parts. */
export function SegmentedBar({ parts, ariaLabel }: { parts: Part[]; ariaLabel: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <p className="muted small">Nothing to show yet.</p>;
  return (
    <div>
      <div className="segbar" role="img" aria-label={`${ariaLabel}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} className="segbar-part" style={{ flexGrow: p.value, background: p.color, color: p.ink ?? '#fff' }} title={`${p.label}: ${p.value}`}>
              {p.value / total >= 0.1 ? p.value : ''}
            </span>
          ))}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className="swatch" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stat-tile trend: de-emphasised line, current period marked in the accent. */
export function TileSpark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 30;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => [2 + (i * (w - 6)) / (values.length - 1), h - 4 - ((v - min) / span) * (h - 8)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="tile-spark">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#a3a29b" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={SERIES[0]} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/** Collapsible data table: the accessible, exact-number view of a chart. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <details className="viz-table">
      <summary>Show data table</summary>
      <div className="table-wrap">
        <table className="grid compact">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={i ? 'num' : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j ? 'num tnum' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
