import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { formatValue, type FormatOptions } from '../../utils/format-helpers';

// ── Types ──

export interface BulletChartRange {
  /** Upper bound of this qualitative range (0-100 scale) */
  limit: number;
  /** Label for the range (e.g. "Poor", "Satisfactory", "Good") */
  label?: string;
  /** Custom color override — defaults to gray shading */
  color?: string;
}

/** Props for the BulletChart component. */
export interface BulletChartProps extends AccessControlledProps {
  /** Actual value to display as the primary bar */
  value: number;
  /** Target / comparative marker value */
  target: number;
  /** Minimum scale value (default 0) */
  min?: number;
  /** Maximum scale value (default 100) */
  max?: number;
  /** Label displayed alongside the chart */
  label?: string;
  /** Subtitle text under the label */
  subtitle?: string;
  /** Qualitative ranges — defaults to 3 equal zones */
  ranges?: BulletChartRange[];
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Bar color */
  barColor?: string;
  /** Target marker color */
  targetColor?: string;
  /** Number formatting */
  formatOptions?: FormatOptions;
  /** Additional class names */
  className?: string;
}

// ── Helpers ──

const SIZE_MAP = {
  sm: { height: 24, labelFont: 10, valueFont: 11 },
  md: { height: 32, labelFont: 12, valueFont: 13 },
  lg: { height: 40, labelFont: 14, valueFont: 15 },
} as const;

const DEFAULT_RANGES: BulletChartRange[] = [
  { limit: 33.33, label: 'Poor' },
  { limit: 66.66, label: 'Satisfactory' },
  { limit: 100, label: 'Good' },
];

const RANGE_GRAYS = ['var(--surface-muted)', 'var(--border-default)', 'var(--text-tertiary)'];

function scaleValue(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ── Component ──

/**
 * Horizontal bullet chart comparing an actual value against a target within qualitative ranges.
 *
 * @example
 * ```tsx
 * <BulletChart
 *   value={72}
 *   target={85}
 *   label="Revenue"
 *   subtitle="Q4 2025"
 *   size="md"
 * />
 * ```
 */
export const BulletChart: React.FC<BulletChartProps> = ({
  value,
  target,
  min = 0,
  max = 100,
  label,
  subtitle,
  ranges = DEFAULT_RANGES,
  orientation = 'horizontal',
  size = 'md',
  barColor = 'var(--interactive-primary)',
  targetColor = 'var(--text-primary)',
  formatOptions = {},
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const dims = SIZE_MAP[size];
  const isHorizontal = orientation === 'horizontal';
  const LABEL_WIDTH = label ? 120 : 0;
  const CHART_LENGTH = 300;
  const PADDING = 8;

  // Normalize ranges to the scale
  const sortedRanges = [...ranges].sort((a, b) => a.limit - b.limit);

  // Scale positions
  const valuePos = scaleValue(value, min, max);
  const targetPos = scaleValue(target, min, max);

  // Bar thickness — 40% of the track height
  const trackH = dims.height;
  const barH = Math.round(trackH * 0.4);
  const barOffset = Math.round((trackH - barH) / 2);

  // Target marker dimensions
  const targetW = 3;
  const targetH = Math.round(trackH * 0.7);
  const targetOffset = Math.round((trackH - targetH) / 2);

  const svgWidth = isHorizontal ? LABEL_WIDTH + CHART_LENGTH + PADDING * 2 : trackH + PADDING * 2;
  const svgHeight = isHorizontal
    ? trackH + (subtitle ? 20 : 0) + 24
    : LABEL_WIDTH + CHART_LENGTH + PADDING * 2;

  const renderHorizontal = () => {
    const chartX = LABEL_WIDTH + PADDING;
    const chartY = 4;

    return (
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Bullet chart: ${label ?? 'value'} is ${formatValue(value, formatOptions)}, target ${formatValue(target, formatOptions)}`}
      >
        {/* Label area */}
        {label && (
          <>
            <text
              x={LABEL_WIDTH - 4}
              y={chartY + trackH / 2 - (subtitle ? 4 : 0)}
              textAnchor="end"
              fontSize={dims.labelFont}
              fontWeight={600}
              fill="var(--text-primary)"
            >
              {label}
            </text>
            {subtitle && (
              <text
                x={LABEL_WIDTH - 4}
                y={chartY + trackH / 2 + 12}
                textAnchor="end"
                fontSize={dims.labelFont - 2}
                fill="var(--text-tertiary)"
              >
                {subtitle}
              </text>
            )}
          </>
        )}

        {/* Qualitative ranges (background) */}
        {sortedRanges.map((range, i) => {
          const prevLimit = i === 0 ? min : sortedRanges[i - 1].limit;
          const x0 = scaleValue(prevLimit, min, max) * CHART_LENGTH;
          const x1 = scaleValue(range.limit, min, max) * CHART_LENGTH;
          const fill = range.color ?? RANGE_GRAYS[i % RANGE_GRAYS.length];

          return (
            <rect
              key={`range-${i}`}
              x={chartX + x0}
              y={chartY}
              width={Math.max(0, x1 - x0)}
              height={trackH}
              fill={fill}
              opacity={0.25 + i * 0.15}
              rx={i === 0 ? 4 : 0}
            />
          );
        })}

        {/* Actual value bar */}
        <rect
          x={chartX}
          y={chartY + barOffset}
          width={valuePos * CHART_LENGTH}
          height={barH}
          fill={barColor}
          rx={2}
        />

        {/* Target marker */}
        <rect
          x={chartX + targetPos * CHART_LENGTH - targetW / 2}
          y={chartY + targetOffset}
          width={targetW}
          height={targetH}
          fill={targetColor}
          rx={1}
        />

        {/* Value text below chart */}
        <text
          x={chartX + valuePos * CHART_LENGTH}
          y={chartY + trackH + 16}
          textAnchor="middle"
          fontSize={dims.valueFont}
          fontWeight={700}
          fill="var(--text-primary)"
        >
          {formatValue(value, formatOptions)}
        </text>
      </svg>
    );
  };

  const renderVertical = () => {
    const chartX = PADDING;
    const chartY = PADDING;

    return (
      <svg
        width={svgWidth}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Bullet chart: ${label ?? 'value'} is ${formatValue(value, formatOptions)}, target ${formatValue(target, formatOptions)}`}
      >
        {/* Qualitative ranges (background) — bottom to top */}
        {sortedRanges.map((range, i) => {
          const prevLimit = i === 0 ? min : sortedRanges[i - 1].limit;
          const y0 = (1 - scaleValue(range.limit, min, max)) * CHART_LENGTH;
          const y1 = (1 - scaleValue(prevLimit, min, max)) * CHART_LENGTH;
          const fill = range.color ?? RANGE_GRAYS[i % RANGE_GRAYS.length];

          return (
            <rect
              key={`range-v-${i}`}
              x={chartX}
              y={chartY + y0}
              width={trackH}
              height={Math.max(0, y1 - y0)}
              fill={fill}
              opacity={0.25 + i * 0.15}
            />
          );
        })}

        {/* Actual value bar */}
        <rect
          x={chartX + barOffset}
          y={chartY + (1 - valuePos) * CHART_LENGTH}
          width={barH}
          height={valuePos * CHART_LENGTH}
          fill={barColor}
          rx={2}
        />

        {/* Target marker */}
        <rect
          x={chartX + targetOffset}
          y={chartY + (1 - targetPos) * CHART_LENGTH - targetW / 2}
          width={targetH}
          height={targetW}
          fill={targetColor}
          rx={1}
        />

        {/* Label below */}
        {label && (
          <text
            x={chartX + trackH / 2}
            y={chartY + CHART_LENGTH + 20}
            textAnchor="middle"
            fontSize={dims.labelFont}
            fontWeight={600}
            fill="var(--text-primary)"
          >
            {label}
          </text>
        )}
      </svg>
    );
  };

  return (
    <div
      className={cn('w-full', accessStyles(accessState.state), className)}
      data-component="bullet-chart"
      data-access-state={accessState.state}
      title={accessReason}
    >
      {isHorizontal ? renderHorizontal() : renderVertical()}
    </div>
  );
};

BulletChart.displayName = 'BulletChart';
export default BulletChart;
