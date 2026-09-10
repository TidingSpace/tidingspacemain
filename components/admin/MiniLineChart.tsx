import { COLORS } from '@/lib/designTokens';

type Point = { day: string; count: number };

// A deliberately simple hand-built line chart, not a charting library —
// avoids adding a new dependency for Phase 1 of the admin panel. Good
// enough for "here's the shape of the trend," not meant to replace a real
// analytics tool if this admin panel grows into needing one.
export default function MiniLineChart({ data, color = COLORS.violet }: { data: Point[]; color?: string }) {
  const width = 560;
  const height = 140;
  const padding = 8;
  const max = Math.max(1, ...data.map((d) => d.count));

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = height - padding - (d.count / max) * (height - padding * 2);
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? padding} ${height - padding} L ${points[0]?.x ?? padding} ${height - padding} Z`;

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <path d={areaPath} fill={color} opacity={0.08} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>{total} total over this period</div>
    </div>
  );
}
