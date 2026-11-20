export const MARKER_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type MarkerShape = (typeof MARKER_SHAPES)[number];
export const SERIES_COLORS = ['#4f46e5', '#0891b2', '#d97706', '#be123c', '#7c3aed', '#15803d', '#475569', '#c026d3'];

interface Props {
  shape: MarkerShape;
  x: number;
  y: number;
  color: string;
  size?: number;
  /** hollow markers are used for quotes (offers) as opposed to filled purchases */
  hollow?: boolean;
}

/** SVG data-point marker. Series differ by colour AND shape so the chart does not rely on colour alone. */
export function ChartMarker({ shape, x, y, color, size = 4.5, hollow = false }: Props) {
  const s = size;
  const paint = hollow ? { fill: '#fff', stroke: color, strokeWidth: 1.8 } : { fill: color };
  if (shape === 'square') return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} {...paint} />;
  if (shape === 'triangle') return <polygon points={`${x},${y - s - 1} ${x + s + 1},${y + s} ${x - s - 1},${y + s}`} {...paint} />;
  if (shape === 'diamond') return <polygon points={`${x},${y - s - 1} ${x + s + 1},${y} ${x},${y + s + 1} ${x - s - 1},${y}`} {...paint} />;
  return <circle cx={x} cy={y} r={s} {...paint} />;
}
