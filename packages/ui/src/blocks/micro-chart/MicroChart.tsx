import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

export type MicroChartType = 'sparkline' | 'bar' | 'bullet' | 'progress' | 'waffle' | 'donut-ring';

/** Props for the MicroChart component.
 * @example
 * ```tsx
 * <MicroChart />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/micro-chart)
 */
export interface MicroChartProps extends AccessControlledProps {
  /** Visualization type */
  type: MicroChartType;
  /** Data points — interpretation depends on type */
  data: number[];
  /** Width in px (default 64) */
  width?: number;
  /** Height in px (default 32) */
  height?: number;
  /** Primary color */
  color?: string;
  /** Secondary / track color */
  trackColor?: string;
  /** Additional class names */
  className?: string;
  /** Aria label override */
  ariaLabel?: string;
}

// ── Sub-renderers ──

function renderSparkline(data: number[], w: number, h: number, color: string): React.ReactElement {
  if (data.length < 2)
    return <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={color} strokeWidth={1.5} />;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  const pad = 2;
  const innerH = h - pad * 2;
  const stepX = w / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - minVal) / range) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  // Gradient fill area
  const areaPath = [
    `M 0,${pad + innerH - ((data[0] - minVal) / range) * innerH}`,
    ...data.map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - minVal) / range) * innerH;
      return `L ${x},${y}`;
    }),
    `L ${w},${h}`,
    `L 0,${h}`,
    'Z',
  ].join(' ');

  return (
    <>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={(data.length - 1) * stepX}
        cy={pad + innerH - ((data[data.length - 1] - minVal) / range) * innerH}
        r={2}
        fill={color}
      />
    </>
  );
}

function renderBar(
  data: number[],
  w: number,
  h: number,
  color: string,
  trackColor: string,
): React.ReactElement {
  const maxVal = Math.max(...data, 1);
  const gap = 1;
  const barW = Math.max(1, (w - gap * (data.length - 1)) / data.length);

  return (
    <>
      {data.map((v, i) => {
        const barH = (v / maxVal) * (h - 2);
        const x = i * (barW + gap);
        return (
          <React.Fragment key={i}>
            <rect x={x} y={0} width={barW} height={h} fill={trackColor} rx={1} opacity={0.2} />
            <rect x={x} y={h - barH} width={barW} height={barH} fill={color} rx={1} />
          </React.Fragment>
        );
      })}
    </>
  );
}

function renderBullet(
  data: number[],
  w: number,
  h: number,
  color: string,
  trackColor: string,
): React.ReactElement {
  // data[0] = actual, data[1] = target, data[2..] = qualitative ranges
  const actual = data[0] ?? 0;
  const target = data[1] ?? 0;
  const maxVal = Math.max(actual, target, data[2] ?? 100, 1);

  const qualitative = data.length > 2 ? data.slice(2) : [maxVal * 0.33, maxVal * 0.66, maxVal];
  const sorted = [...qualitative].sort((a, b) => a - b);

  const barH = h * 0.35;
  const barY = (h - barH) / 2;
  const targetH = h * 0.6;
  const targetY = (h - targetH) / 2;

  return (
    <>
      {/* Qualitative ranges */}
      {sorted.map((limit, i) => {
        const prev = i === 0 ? 0 : sorted[i - 1];
        const x0 = (prev / maxVal) * w;
        const rw = ((limit - prev) / maxVal) * w;
        return (
          <rect
            key={`q-${i}`}
            x={x0}
            y={0}
            width={Math.max(0, rw)}
            height={h}
            fill={trackColor}
            opacity={0.15 + i * 0.12}
          />
        );
      })}
      {/* Actual bar */}
      <rect x={0} y={barY} width={(actual / maxVal) * w} height={barH} fill={color} rx={1} />
      {/* Target marker */}
      <rect
        x={(target / maxVal) * w - 1}
        y={targetY}
        width={2}
        height={targetH}
        fill="var(--text-primary)"
        rx={0.5}
      />
    </>
  );
}

function renderProgress(
  data: number[],
  w: number,
  h: number,
  color: string,
  trackColor: string,
): React.ReactElement {
  const pct = Math.max(0, Math.min(100, data[0] ?? 0));
  const barH = Math.min(h, 8);
  const barY = (h - barH) / 2;
  const labelY = barY - 2;

  return (
    <>
      {/* Track */}
      <rect x={0} y={barY} width={w} height={barH} fill={trackColor} rx={barH / 2} opacity={0.25} />
      {/* Fill */}
      <rect x={0} y={barY} width={(pct / 100) * w} height={barH} fill={color} rx={barH / 2} />
      {/* Percentage label */}
      <text
        x={w}
        y={labelY > 6 ? labelY : barY + barH + 10}
        textAnchor="end"
        fontSize={9}
        fontWeight={600}
        fill="var(--text-secondary)"
      >
        {Math.round(pct)}%
      </text>
    </>
  );
}

function renderWaffle(
  data: number[],
  w: number,
  h: number,
  color: string,
  trackColor: string,
): React.ReactElement {
  const filled = Math.max(0, Math.min(100, Math.round(data[0] ?? 0)));
  const cols = 10;
  const rows = 10;
  const cellW = w / cols;
  const cellH = h / rows;
  const gap = 0.5;

  const cells: React.ReactElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const isFilled = idx < filled;
      cells.push(
        <rect
          key={`w-${idx}`}
          x={col * cellW + gap}
          y={row * cellH + gap}
          width={cellW - gap * 2}
          height={cellH - gap * 2}
          fill={isFilled ? color : trackColor}
          opacity={isFilled ? 1 : 0.15}
          rx={1}
        />,
      );
    }
  }

  return <>{cells}</>;
}

function renderDonutRing(
  data: number[],
  w: number,
  h: number,
  color: string,
  trackColor: string,
): React.ReactElement {
  const pct = Math.max(0, Math.min(100, data[0] ?? 0));
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const strokeW = Math.max(3, size * 0.18);
  const r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const dashLen = (pct / 100) * circumference;

  return (
    <>
      {/* Background ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeW}
        opacity={0.2}
      />
      {/* Value arc */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Center label */}
      <text
        x={cx}
        y={cy + 3}
        textAnchor="middle"
        fontSize={Math.max(8, size * 0.22)}
        fontWeight={700}
        fill="var(--text-primary)"
      >
        {Math.round(pct)}
      </text>
    </>
  );
}

// ── Component ──

/** Compact inline chart supporting sparkline, bar, bullet, progress, waffle, and donut-ring types. */
export const MicroChart: React.FC<MicroChartProps> = ({
  type,
  data,
  width = 64,
  height = 32,
  color = 'var(--interactive-primary)',
  trackColor = 'var(--surface-muted)',
  className,
  ariaLabel,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const renderers: Record<MicroChartType, () => React.ReactElement> = {
    sparkline: () => renderSparkline(data, width, height, color),
    bar: () => renderBar(data, width, height, color, trackColor),
    bullet: () => renderBullet(data, width, height, color, trackColor),
    progress: () => renderProgress(data, width, height, color, trackColor),
    waffle: () => renderWaffle(data, width, height, color, trackColor),
    'donut-ring': () => renderDonutRing(data, width, height, color, trackColor),
  };

  const renderer = renderers[type];
  if (!renderer) return null;

  return (
    <div
      className={cn('inline-flex items-center', accessStyles(accessState.state), className)}
      data-component="micro-chart"
      data-chart-type={type}
      data-access-state={accessState.state}
      title={accessReason}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? `${type} micro chart`}
      >
        {renderer()}
      </svg>
    </div>
  );
};

MicroChart.displayName = 'MicroChart';
export default MicroChart;
