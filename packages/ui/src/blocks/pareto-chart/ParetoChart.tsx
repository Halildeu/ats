import React, { useMemo, useState, useCallback } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single item in the Pareto chart.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/pareto-chart)
 */
export interface ParetoItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Numeric value (absolute count / cost / frequency) */
  value: number;
  /** Optional custom bar color */
  color?: string;
}

/**
 * Props for the ParetoChart component.
 *
 * @example
 * ```tsx
 * <ParetoChart
 *   items={[
 *     { id: 'a', label: 'Defect A', value: 80 },
 *     { id: 'b', label: 'Defect B', value: 45 },
 *     { id: 'c', label: 'Defect C', value: 25 },
 *   ]}
 *   show80Line
 * />
 * ```
 */
export interface ParetoChartProps extends AccessControlledProps {
  /** Array of Pareto items (sorted by value descending automatically) */
  items: ParetoItem[];
  /** Chart height (number for px, string for CSS value) */
  height?: number | string;
  /** Show the cumulative percentage line */
  showCumulativeLine?: boolean;
  /** Show percentage labels on the cumulative line points */
  showPercentLabels?: boolean;
  /** Show a horizontal dashed line at 80% cumulative */
  show80Line?: boolean;
  /** Custom value formatter for bar labels */
  format?: (value: number) => string;
  /** Callback when a bar is clicked */
  onItemClick?: (item: ParetoItem) => void;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BAR_COLOR = 'var(--pareto-bar)';
const LINE_COLOR = 'var(--pareto-line)';
const LINE_80_COLOR = 'var(--pareto-80line)';

const PADDING = { top: 30, right: 50, bottom: 70, left: 55 };

function defaultFormat(v: number): string {
  return v.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pareto (80/20) chart rendered as pure SVG.
 *
 * Combines a bar chart (left y-axis, absolute values) with a cumulative
 * percentage line (right y-axis, 0-100%). Items are automatically sorted
 * by value descending. An optional 80% horizontal line highlights the
 * classic Pareto threshold.
 *
 * @example
 * ```tsx
 * <ParetoChart
 *   items={defectData}
 *   show80Line
 *   showCumulativeLine
 *   showPercentLabels
 * />
 * ```
 */
export const ParetoChart: React.FC<ParetoChartProps> = ({
  items,
  height = 400,
  showCumulativeLine = true,
  showPercentLabels = true,
  show80Line = true,
  format = defaultFormat,
  onItemClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  // Sort items descending by value and compute cumulative %
  const computed = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    const total = sorted.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return { sorted: [], total: 0, cumulative: [] as number[], maxValue: 0 };

    let running = 0;
    const cumulative = sorted.map((item) => {
      running += item.value;
      return (running / total) * 100;
    });

    const maxValue = sorted.length > 0 ? sorted[0].value : 0;
    return { sorted, total, cumulative, maxValue };
  }, [items]);

  const handleClick = useCallback(
    (item: ParetoItem) => {
      if (canInteract && onItemClick) {
        onItemClick(item);
      }
    },
    [canInteract, onItemClick],
  );

  if (items.length === 0) {
    return (
      <div className={cn('p-8 text-center text-sm text-[var(--text-tertiary)]', className)}>
        No data
      </div>
    );
  }

  const { sorted, cumulative, maxValue } = computed;
  const chartHeight = typeof height === 'number' ? height : 400;

  // SVG dimensions
  const barGap = 6;
  const barWidth = Math.max(24, Math.min(56, 500 / sorted.length));
  const plotWidth = sorted.length * (barWidth + barGap) - barGap;
  const svgWidth = PADDING.left + plotWidth + PADDING.right;
  const plotHeight = chartHeight - PADDING.top - PADDING.bottom;

  // Y scales
  const yBar = (value: number): number => {
    return PADDING.top + plotHeight - (value / (maxValue || 1)) * plotHeight;
  };
  const yPercent = (pct: number): number => {
    return PADDING.top + plotHeight - (pct / 100) * plotHeight;
  };
  const baseY = PADDING.top + plotHeight;

  // Cumulative line path
  const linePath = cumulative
    .map((pct, i) => {
      const x = PADDING.left + i * (barWidth + barGap) + barWidth / 2;
      const y = yPercent(pct);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="pareto-chart"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pareto chart"
      >
        {/* Left y-axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = maxValue * frac;
          const y = yBar(val);
          return (
            <g key={`ltick-${frac}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotWidth}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth={0.5}
              />
              <text
                x={PADDING.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="var(--text-tertiary)"
              >
                {format(Math.round(val))}
              </text>
            </g>
          );
        })}

        {/* Right y-axis ticks (percentage) */}
        {showCumulativeLine &&
          [0, 25, 50, 75, 100].map((pct) => {
            const y = yPercent(pct);
            return (
              <text
                key={`rpct-${pct}`}
                x={PADDING.left + plotWidth + 6}
                y={y + 4}
                textAnchor="start"
                fontSize={10}
                fill="var(--text-tertiary)"
              >
                {pct}%
              </text>
            );
          })}

        {/* 80% line */}
        {show80Line && (
          <g>
            <line
              x1={PADDING.left}
              y1={yPercent(80)}
              x2={PADDING.left + plotWidth}
              y2={yPercent(80)}
              stroke={LINE_80_COLOR}
              strokeWidth={1}
              strokeDasharray="6 4"
            />
            <text
              x={PADDING.left + plotWidth + 6}
              y={yPercent(80) + 4}
              textAnchor="start"
              fontSize={9}
              fontWeight={600}
              fill={LINE_80_COLOR}
            >
              80%
            </text>
          </g>
        )}

        {/* Bars */}
        {sorted.map((item, i) => {
          const x = PADDING.left + i * (barWidth + barGap);
          const barH = Math.max((item.value / (maxValue || 1)) * plotHeight, 2);
          const barY = baseY - barH;
          const color = item.color ?? DEFAULT_BAR_COLOR;
          const isHovered = hoveredId === item.id;
          const isClickable = canInteract && !!onItemClick;

          return (
            <g key={item.id}>
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={barH}
                fill={color}
                rx={2}
                opacity={isHovered ? 1 : 0.8}
                className={cn(
                  'transition-opacity duration-(--motion-duration-fast)',
                  isClickable && 'cursor-pointer',
                )}
                onClick={() => handleClick(item)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
              {isHovered && (
                <rect
                  x={x - 1}
                  y={barY - 1}
                  width={barWidth + 2}
                  height={barH + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  rx={3}
                  pointerEvents="none"
                />
              )}

              {/* X-axis label (rotated) */}
              <text
                x={x + barWidth / 2}
                y={baseY + 12}
                textAnchor="end"
                fontSize={10}
                fill="var(--text-secondary)"
                transform={`rotate(-35, ${x + barWidth / 2}, ${baseY + 12})`}
              >
                {item.label}
              </text>
            </g>
          );
        })}

        {/* Cumulative line */}
        {showCumulativeLine && linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Cumulative dots + percent labels */}
        {showCumulativeLine &&
          cumulative.map((pct, i) => {
            const x = PADDING.left + i * (barWidth + barGap) + barWidth / 2;
            const y = yPercent(pct);
            return (
              <g key={`dot-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={3.5}
                  fill="var(--surface-default)"
                  stroke={LINE_COLOR}
                  strokeWidth={2}
                />
                {showPercentLabels && (
                  <text
                    x={x}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={LINE_COLOR}
                  >
                    {Math.round(pct)}%
                  </text>
                )}
              </g>
            );
          })}

        {/* Legend */}
        <g transform={`translate(${PADDING.left}, ${chartHeight - 10})`}>
          <rect x={0} y={-6} width={10} height={10} rx={2} fill={DEFAULT_BAR_COLOR} opacity={0.8} />
          <text x={14} y={3} fontSize={10} fill="var(--text-secondary)">
            Value
          </text>
          {showCumulativeLine && (
            <>
              <line x1={60} y1={0} x2={80} y2={0} stroke={LINE_COLOR} strokeWidth={2} />
              <circle
                cx={70}
                cy={0}
                r={3}
                fill="var(--surface-default)"
                stroke={LINE_COLOR}
                strokeWidth={2}
              />
              <text x={84} y={3} fontSize={10} fill="var(--text-secondary)">
                Cumulative %
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};

ParetoChart.displayName = 'ParetoChart';
export default ParetoChart;
