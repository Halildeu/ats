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

/**
 * A single data point in the control chart.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/control-chart)
 */
export interface ControlChartPoint {
  /** X-axis value (index, timestamp, or label) */
  x: string | number;
  /** Y-axis measured value */
  y: number;
  /** Violation type if this point is out of control */
  violation?: string;
}

/**
 * Props for the ControlChart component.
 *
 * @example
 * ```tsx
 * <ControlChart
 *   data={[
 *     { x: 1, y: 50 }, { x: 2, y: 52 }, { x: 3, y: 48 },
 *     { x: 4, y: 55 }, { x: 5, y: 60 },
 *   ]}
 *   showZones
 *   showViolations
 * />
 * ```
 *
 * @since 1.0.0
 * @see ControlChartPoint
 */
export interface ControlChartProps extends AccessControlledProps {
  /** Array of data points */
  data: Array<{ x: string | number; y: number }>;
  /** Upper Control Limit (auto-calculated as mean + 3 sigma if not provided) */
  ucl?: number;
  /** Lower Control Limit (auto-calculated as mean - 3 sigma if not provided) */
  lcl?: number;
  /** Center/target line (auto-calculated as mean if not provided) */
  target?: number;
  /** Show A/B/C zones (1, 2, 3 sigma bands) */
  showZones?: boolean;
  /** Highlight out-of-control points (default: true) */
  showViolations?: boolean;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Chart width (number for px, string for CSS) */
  width?: number | string;
  /** Chart height (number for px, string for CSS) */
  height?: number | string;
  /** Callback when a data point is clicked */
  onPointClick?: (point: ControlChartPoint) => void;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_COLOR = 'var(--control-data)';
const UCL_COLOR = 'var(--control-ucl)';
const LCL_COLOR = 'var(--control-lcl)';
const TARGET_COLOR = 'var(--control-target)';
const VIOLATION_COLOR = 'var(--control-violation)';
const ZONE_A_COLOR = 'var(--control-zone-a)';
const ZONE_B_COLOR = 'var(--control-zone-b)';
const ZONE_C_COLOR = 'var(--control-zone-c)';
const GRID_COLOR = 'var(--border-subtle)';
const TEXT_COLOR = 'var(--text-secondary)';
const AXIS_COLOR = 'var(--text-tertiary)';

const PADDING = { top: 30, right: 40, bottom: 60, left: 60 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ChartStats {
  mean: number;
  stddev: number;
  ucl: number;
  lcl: number;
  target: number;
}

function computeStats(
  data: Array<{ y: number }>,
  uclProp?: number,
  lclProp?: number,
  targetProp?: number,
): ChartStats {
  const n = data.length;
  if (n === 0) return { mean: 0, stddev: 0, ucl: 0, lcl: 0, target: 0 };

  const values = data.map((d) => d.y);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    mean,
    stddev,
    ucl: uclProp ?? mean + 3 * stddev,
    lcl: lclProp ?? mean - 3 * stddev,
    target: targetProp ?? mean,
  };
}

function detectViolations(
  data: Array<{ x: string | number; y: number }>,
  stats: ChartStats,
): ControlChartPoint[] {
  return data.map((point) => {
    let violation: string | undefined;
    if (point.y > stats.ucl) violation = 'above-ucl';
    else if (point.y < stats.lcl) violation = 'below-lcl';
    return { ...point, violation };
  });
}

function niceScale(minVal: number, maxVal: number, tickCount = 6): number[] {
  const range = maxVal - minVal || 1;
  const rawStep = range / (tickCount - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / mag;
  let step: number;
  if (normalized <= 1.5) step = 1 * mag;
  else if (normalized <= 3.5) step = 2 * mag;
  else if (normalized <= 7.5) step = 5 * mag;
  else step = 10 * mag;

  const niceMin = Math.floor(minVal / step) * step;
  const niceMax = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.01; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Statistical Process Control (SPC) chart rendered as pure SVG.
 *
 * Plots data points connected by a line, with UCL/LCL dashed control
 * limit lines (red), center/target line (green), optional A/B/C zone
 * shading (1/2/3 sigma), and violation highlighting for out-of-control
 * points. Control limits are auto-calculated from data mean and standard
 * deviation when not explicitly provided.
 *
 * @example
 * ```tsx
 * <ControlChart
 *   data={processData}
 *   showZones
 *   showViolations
 *   xLabel="Sample #"
 *   yLabel="Measurement"
 *   onPointClick={(pt) => inspectSample(pt.x)}
 * />
 * ```
 *
 * @since 1.0.0
 * @see ControlChartPoint
 */
export const ControlChart: React.FC<ControlChartProps> = ({
  data,
  ucl: uclProp,
  lcl: lclProp,
  target: targetProp,
  showZones = false,
  showViolations = true,
  xLabel,
  yLabel,
  width,
  height = 400,
  onPointClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  const stats = useMemo(
    () => computeStats(data, uclProp, lclProp, targetProp),
    [data, uclProp, lclProp, targetProp],
  );

  const points = useMemo(
    () =>
      showViolations
        ? detectViolations(data, stats)
        : data.map((d) => ({ ...d, violation: undefined })),
    [data, stats, showViolations],
  );

  const handlePointClick = useCallback(
    (pt: ControlChartPoint) => {
      if (canInteract && onPointClick) onPointClick(pt);
    },
    [canInteract, onPointClick],
  );

  if (data.length === 0) {
    return (
      <div
        className={cn('p-8 text-center text-sm text-[var(--text-tertiary)]', className)}
        data-component="control-chart"
      >
        No data
      </div>
    );
  }

  const chartHeight = typeof height === 'number' ? height : 400;

  // Determine Y range
  const allYValues = data.map((d) => d.y);
  const rawMin = Math.min(...allYValues, stats.lcl);
  const rawMax = Math.max(...allYValues, stats.ucl);
  const yPadding = (rawMax - rawMin) * 0.12 || 5;
  const yMin = rawMin - yPadding;
  const yMax = rawMax + yPadding;
  const yTicks = niceScale(yMin, yMax, 7);
  const yScaleMin = yTicks[0];
  const yScaleMax = yTicks[yTicks.length - 1];

  // SVG dimensions
  const plotWidth = Math.max(400, data.length * 40);
  const plotHeight = chartHeight - PADDING.top - PADDING.bottom;
  const svgWidth = PADDING.left + plotWidth + PADDING.right;

  const xScale = (idx: number): number =>
    PADDING.left + (idx / Math.max(data.length - 1, 1)) * plotWidth;

  const yScale = (v: number): number => {
    const ratio = (v - yScaleMin) / (yScaleMax - yScaleMin || 1);
    return PADDING.top + plotHeight - ratio * plotHeight;
  };

  const baseY = PADDING.top + plotHeight;

  // Data line path
  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(pt.y)}`)
    .join(' ');

  // Zone boundaries
  const sigma1Up = stats.target + stats.stddev;
  const sigma1Down = stats.target - stats.stddev;
  const sigma2Up = stats.target + 2 * stats.stddev;
  const sigma2Down = stats.target - 2 * stats.stddev;

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="control-chart"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      <svg
        width={width || '100%'}
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Control chart"
      >
        {/* Zone shading */}
        {showZones && stats.stddev > 0 && (
          <>
            {/* Zone A: 2sigma - 3sigma (outer) */}
            <rect
              x={PADDING.left}
              y={yScale(stats.ucl)}
              width={plotWidth}
              height={Math.max(yScale(sigma2Up) - yScale(stats.ucl), 0)}
              fill={ZONE_A_COLOR}
            />
            <rect
              x={PADDING.left}
              y={yScale(sigma2Down)}
              width={plotWidth}
              height={Math.max(yScale(stats.lcl) - yScale(sigma2Down), 0)}
              fill={ZONE_A_COLOR}
            />
            {/* Zone B: 1sigma - 2sigma */}
            <rect
              x={PADDING.left}
              y={yScale(sigma2Up)}
              width={plotWidth}
              height={Math.max(yScale(sigma1Up) - yScale(sigma2Up), 0)}
              fill={ZONE_B_COLOR}
            />
            <rect
              x={PADDING.left}
              y={yScale(sigma1Down)}
              width={plotWidth}
              height={Math.max(yScale(sigma2Down) - yScale(sigma1Down), 0)}
              fill={ZONE_B_COLOR}
            />
            {/* Zone C: center - 1sigma */}
            <rect
              x={PADDING.left}
              y={yScale(sigma1Up)}
              width={plotWidth}
              height={Math.max(yScale(sigma1Down) - yScale(sigma1Up), 0)}
              fill={ZONE_C_COLOR}
            />

            {/* Zone labels */}
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((stats.ucl + sigma2Up) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              A
            </text>
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((sigma2Up + sigma1Up) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              B
            </text>
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((sigma1Up + stats.target) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              C
            </text>
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((stats.target + sigma1Down) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              C
            </text>
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((sigma1Down + sigma2Down) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              B
            </text>
            <text
              x={PADDING.left + plotWidth + 4}
              y={yScale((sigma2Down + stats.lcl) / 2) + 4}
              fontSize={8}
              fill={AXIS_COLOR}
            >
              A
            </text>
          </>
        )}

        {/* Y-axis grid */}
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`yt-${tick}`}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={PADDING.left + plotWidth}
                y2={y}
                stroke={GRID_COLOR}
                strokeWidth={0.5}
              />
              <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill={AXIS_COLOR}>
                {tick}
              </text>
            </g>
          );
        })}

        {/* UCL line */}
        <line
          x1={PADDING.left}
          y1={yScale(stats.ucl)}
          x2={PADDING.left + plotWidth}
          y2={yScale(stats.ucl)}
          stroke={UCL_COLOR}
          strokeWidth={1.5}
          strokeDasharray="8 4"
        />
        <text
          x={PADDING.left - 8}
          y={yScale(stats.ucl) + 4}
          textAnchor="end"
          fontSize={9}
          fontWeight={600}
          fill={UCL_COLOR}
        >
          UCL
        </text>

        {/* LCL line */}
        <line
          x1={PADDING.left}
          y1={yScale(stats.lcl)}
          x2={PADDING.left + plotWidth}
          y2={yScale(stats.lcl)}
          stroke={LCL_COLOR}
          strokeWidth={1.5}
          strokeDasharray="8 4"
        />
        <text
          x={PADDING.left - 8}
          y={yScale(stats.lcl) + 4}
          textAnchor="end"
          fontSize={9}
          fontWeight={600}
          fill={LCL_COLOR}
        >
          LCL
        </text>

        {/* Target / center line */}
        <line
          x1={PADDING.left}
          y1={yScale(stats.target)}
          x2={PADDING.left + plotWidth}
          y2={yScale(stats.target)}
          stroke={TARGET_COLOR}
          strokeWidth={1.5}
        />
        <text
          x={PADDING.left - 8}
          y={yScale(stats.target) + 4}
          textAnchor="end"
          fontSize={9}
          fontWeight={600}
          fill={TARGET_COLOR}
        >
          CL
        </text>

        {/* Data line */}
        <path
          d={linePath}
          fill="none"
          stroke={DATA_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((pt, idx) => {
          const px = xScale(idx);
          const py = yScale(pt.y);
          const isViolation = !!pt.violation;
          const isHovered = hoveredIdx === idx;
          const isClickable = canInteract && !!onPointClick;
          const pointColor = isViolation && showViolations ? VIOLATION_COLOR : DATA_COLOR;

          return (
            <g
              key={`pt-${idx}`}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              className={cn(isClickable && 'cursor-pointer')}
              onClick={() => handlePointClick(pt as ControlChartPoint)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePointClick(pt as ControlChartPoint);
                }
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Violation ring */}
              {isViolation && showViolations && (
                <circle
                  cx={px}
                  cy={py}
                  r={8}
                  fill="none"
                  stroke={VIOLATION_COLOR}
                  strokeWidth={2}
                  opacity={0.5}
                />
              )}
              <circle
                cx={px}
                cy={py}
                r={isHovered ? 5 : 3.5}
                fill="var(--surface-default)"
                stroke={pointColor}
                strokeWidth={2}
              />
              {isHovered && (
                <g>
                  <rect
                    x={px - 45}
                    y={py - 36}
                    width={90}
                    height={28}
                    rx={4}
                    fill="var(--surface-elevated)"
                    opacity={0.92}
                  />
                  <text
                    x={px}
                    y={py - 18}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--text-inverse)"
                  >
                    x: {pt.x} | y: {pt.y.toFixed(2)}
                  </text>
                  {isViolation && (
                    <text x={px} y={py - 8} textAnchor="middle" fontSize={8} fill={VIOLATION_COLOR}>
                      {pt.violation}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* X-axis labels (show subset to avoid crowding) */}
        {points.map((pt, idx) => {
          const step = Math.max(1, Math.floor(data.length / 15));
          if (idx % step !== 0 && idx !== data.length - 1) return null;
          return (
            <text
              key={`xl-${idx}`}
              x={xScale(idx)}
              y={baseY + 16}
              textAnchor="middle"
              fontSize={9}
              fill={AXIS_COLOR}
            >
              {pt.x}
            </text>
          );
        })}

        {/* Axes */}
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={baseY}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />
        <line
          x1={PADDING.left}
          y1={baseY}
          x2={PADDING.left + plotWidth}
          y2={baseY}
          stroke={AXIS_COLOR}
          strokeWidth={1}
        />

        {/* Axis labels */}
        {xLabel && (
          <text
            x={PADDING.left + plotWidth / 2}
            y={chartHeight - 6}
            textAnchor="middle"
            fontSize={11}
            fill={TEXT_COLOR}
          >
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={14}
            y={PADDING.top + plotHeight / 2}
            textAnchor="middle"
            fontSize={11}
            fill={TEXT_COLOR}
            transform={`rotate(-90, 14, ${PADDING.top + plotHeight / 2})`}
          >
            {yLabel}
          </text>
        )}

        {/* Legend */}
        <g transform={`translate(${PADDING.left}, ${chartHeight - 10})`}>
          <line x1={0} y1={0} x2={14} y2={0} stroke={DATA_COLOR} strokeWidth={2} />
          <circle
            cx={7}
            cy={0}
            r={2.5}
            fill="var(--surface-default)"
            stroke={DATA_COLOR}
            strokeWidth={1.5}
          />
          <text x={18} y={3} fontSize={9} fill={TEXT_COLOR}>
            Data
          </text>

          <line
            x1={50}
            y1={0}
            x2={68}
            y2={0}
            stroke={UCL_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
          <text x={72} y={3} fontSize={9} fill={TEXT_COLOR}>
            UCL/LCL
          </text>

          <line x1={115} y1={0} x2={133} y2={0} stroke={TARGET_COLOR} strokeWidth={1.5} />
          <text x={137} y={3} fontSize={9} fill={TEXT_COLOR}>
            CL
          </text>

          {showViolations && (
            <>
              <circle cx={172} cy={0} r={3} fill="none" stroke={VIOLATION_COLOR} strokeWidth={2} />
              <text x={180} y={3} fontSize={9} fill={TEXT_COLOR}>
                Violation
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};

ControlChart.displayName = 'ControlChart';
export default ControlChart;
