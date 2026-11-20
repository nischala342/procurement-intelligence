interface Props {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}

/** Tiny inline trend line. Colour reflects direction, and the label carries the meaning for screen readers. */
export function Sparkline({ values, width = 84, height = 24, label }: Props) {
  if (values.length < 2) return <span className="muted" aria-label={`${label}: not enough data`}>—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i * (width - pad * 2)) / (values.length - 1), height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const rising = values[values.length - 1]! > values[0]!;
  const falling = values[values.length - 1]! < values[0]!;
  const color = rising ? '#b45309' : falling ? '#047857' : '#6b7280';
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}
