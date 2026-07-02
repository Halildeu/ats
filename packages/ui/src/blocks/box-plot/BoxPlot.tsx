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
 * Data for a single box in the box plot.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/box-plot)
 */
export interface BoxPlotData {
  /** Display label for this box */
  label: string;
  /** Minimum value (lower whisker) */
  min: number;
  /** First quartile */
  q1: number;
  /** Median value */
  median: number;
  /** Third quartile */
  q3: number;
  /** Maximum value (upper whisker) */
  max: number;
  /** Outlier data points beyond whiskers */
  outliers?: number[];
  /** Optional custom color for this box */
  color?: string;
}

/**
 * Props for the BoxPlot component.
 *
 * @example
 * ```tsx
 * <BoxPlot
 *   data={[
 *     { label: 'Q1', min: 5, q1: 15, median: 25, q3: 35, max: 50 },
 *     { label: 'Q2', min: 10, q1: 20, median: 30, q3: 40, max: 55, outliers: [65, 70] },
 *   ]}
 *   showOutliers
 *   showMean
 * />
 * ```
 *
 * @since 1.0.0
 * @see BoxPlotData
 */
export interface BoxPlotProps extends AccessControlledProps {
  /** Array of box plot data entries */
  data: BoxPlotData[];
  /** Chart orientation (default: 'vertical') */
  orientation?: 'horizontal' | 'vertical';
  /** Show outlier dots (default: true) */
  showOutliers?: boolean;
  /** Show mean marker as a diamond (default: false) */
  showMean?: boolean;
  /** Chart width (number for px, string for CSS) */
  width?: number | string;
  /** Chart height (number for px, string for CSS) */
  height?: number | string;
  /** Callback when a box is clicked */
  onBoxClick?: (item: BoxPlotData) => void;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = 'var(--box-plot-fill)';
const MEDIAN_COLOR = 'var(--box-plot-median)';
const WHISKER_COLOR = 'var(--box-plot-whisker)';
const OUTLIER_COLOR = 'var(--box-plot-outlier)';
const MEAN_COLOR = 'var(--box-plot-mean)';
const GRID_COLOR = 'var(--border-subtle)';
const TEXT_COLOR = 'var(--text-secondary)';
const AXIS_COLOR = 'var(--text-tertiary)';

const PADDING = { top: 30, right: 30, bottom: 50, left: 55 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function niceScale(minVal: number, maxVal: number, tickCount = 5): number[] {
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

function computeMean(item: BoxPlotData): number {
  // Approximate mean from quartiles
  return (item.min + item.q1 + item.median + item.q3 + item.max) / 5;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Statistical box-and-whisker chart rendered as pure SVG.
 *
 * Displays distribution data with whiskers (min-Q1, Q3-max), a box
 * (Q1-Q3), median line, optional outlier dots, and optional mean
 * diamond marker. Supports both vertical and horizontal orientation.
 *
 * @example
 * ```tsx
 * <BoxPlot
 *   data={distributionData}
 *   showOutliers
 *   showMean
 *   orientation="vertical"
 * />
 * ```
 *
 * @since 1.0.0
 * @see BoxPlotData
 */
export const BoxPlot: React.FC<BoxPlotProps> = ({
  data,
  orientation = 'vertical',
  showOutliers = true,
  showMean = false,
  width,
  height = 400,
  onBoxClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  const handleBoxClick = useCallback(
    (item: BoxPlotData) => {
      if (canInteract && onBoxClick) onBoxClick(item);
    },
    [canInteract, onBoxClick],
  );

  // Compute global min/max for scale
  const { globalMin, globalMax, ticks } = useMemo(() => {
    let gMin = Infinity;
    let gMax = -Infinity;
    for (const item of data) {
      gMin = Math.min(gMin, item.min);
      gMax = Math.max(gMax, item.max);
      if (showOutliers && item.outliers) {
        for (const o of item.outliers) {
          gMin = Math.min(gMin, o);
          gMax = Math.max(gMax, o);
        }
      }
    }
    if (!isFinite(gMin)) {
      gMin = 0;
      gMax = 100;
    }
    const padding = (gMax - gMin) * 0.1 || 5;
    const scaledMin = gMin - padding;
    const scaledMax = gMax + padding;
    return {
      globalMin: scaledMin,
      globalMax: scaledMax,
      ticks: niceScale(scaledMin, scaledMax, 6),
    };
  }, [data, showOutliers]);

  if (data.length === 0) {
    return (
      <div
        className={cn('p-8 text-center text-sm text-[var(--text-tertiary)]', className)}
        data-component="box-plot"
      >
        No data
      </div>
    );
  }

  const isVertical = orientation === 'vertical';
  const chartHeight = typeof height === 'number' ? height : 400;
  const boxSpacing = 16;
  const boxWidth = Math.max(30, Math.min(60, 400 / data.length));
  const plotWidth = data.length * (boxWidth + boxSpacing) - boxSpacing;
  const plotHeight = chartHeight - PADDING.top - PADDING.bottom;
  const svgWidth = PADDING.left + plotWidth + PADDING.right;

  // Value-to-Y (vertical mode: higher values at top)
  const valueToY = (v: number): number => {
    const ratio = (v - globalMin) / (globalMax - globalMin || 1);
    return PADDING.top + plotHeight - ratio * plotHeight;
  };

  // Value-to-X (horizontal mode)
  const valueToX = (v: number): number => {
    const ratio = (v - globalMin) / (globalMax - globalMin || 1);
    return PADDING.left + ratio * plotWidth;
  };

  const baseY = PADDING.top + plotHeight;

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="box-plot"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      <svg
        width={width || '100%'}
        viewBox={isVertical ? `0 0 ${svgWidth} ${chartHeight}` : `0 0 ${chartHeight} ${svgWidth}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Box plot chart"
      >
        {isVertical ? (
          <>
            {/* Y-axis ticks and grid */}
            {ticks.map((tick) => {
              const y = valueToY(tick);
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={PADDING.left + plotWidth}
                    y2={y}
                    stroke={GRID_COLOR}
                    strokeWidth={0.5}
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize={10}
                    fill={AXIS_COLOR}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Box plots */}
            {data.map((item, idx) => {
              const cx = PADDING.left + idx * (boxWidth + boxSpacing) + boxWidth / 2;
              const x = cx - boxWidth / 2;
              const yMin = valueToY(item.min);
              const yQ1 = valueToY(item.q1);
              const yMedian = valueToY(item.median);
              const yQ3 = valueToY(item.q3);
              const yMax = valueToY(item.max);
              const color = item.color || DEFAULT_COLOR;
              const isHovered = hoveredIdx === idx;
              const isClickable = canInteract && !!onBoxClick;

              return (
                <g
                  key={`box-${idx}`}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  className={cn(isClickable && 'cursor-pointer')}
                  onClick={() => handleBoxClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleBoxClick(item);
                    }
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  opacity={isHovered ? 1 : 0.85}
                >
                  {/* Lower whisker: min to Q1 */}
                  <line
                    x1={cx}
                    y1={yMin}
                    x2={cx}
                    y2={yQ1}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  {/* Min cap */}
                  <line
                    x1={cx - boxWidth * 0.3}
                    y1={yMin}
                    x2={cx + boxWidth * 0.3}
                    y2={yMin}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                  />

                  {/* Upper whisker: Q3 to max */}
                  <line
                    x1={cx}
                    y1={yQ3}
                    x2={cx}
                    y2={yMax}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  {/* Max cap */}
                  <line
                    x1={cx - boxWidth * 0.3}
                    y1={yMax}
                    x2={cx + boxWidth * 0.3}
                    y2={yMax}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                  />

                  {/* Box: Q1 to Q3 */}
                  <rect
                    x={x}
                    y={yQ3}
                    width={boxWidth}
                    height={Math.max(yQ1 - yQ3, 1)}
                    fill={color}
                    stroke={isHovered ? WHISKER_COLOR : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                    rx={3}
                    opacity={0.7}
                  />

                  {/* Median line */}
                  <line
                    x1={x + 2}
                    y1={yMedian}
                    x2={x + boxWidth - 2}
                    y2={yMedian}
                    stroke={MEDIAN_COLOR}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />

                  {/* Mean diamond */}
                  {showMean && (
                    <polygon
                      points={`${cx},${valueToY(computeMean(item)) - 5} ${cx + 5},${valueToY(computeMean(item))} ${cx},${valueToY(computeMean(item)) + 5} ${cx - 5},${valueToY(computeMean(item))}`}
                      fill={MEAN_COLOR}
                      stroke="var(--text-inverse)"
                      strokeWidth={1}
                    />
                  )}

                  {/* Outliers */}
                  {showOutliers &&
                    item.outliers?.map((val, oIdx) => (
                      <circle
                        key={`outlier-${idx}-${oIdx}`}
                        cx={cx}
                        cy={valueToY(val)}
                        r={3}
                        fill={OUTLIER_COLOR}
                        opacity={0.8}
                      />
                    ))}

                  {/* X-axis label */}
                  <text x={cx} y={baseY + 16} textAnchor="middle" fontSize={10} fill={TEXT_COLOR}>
                    {item.label}
                  </text>

                  {/* Hover tooltip */}
                  {isHovered && (
                    <g>
                      <rect
                        x={cx - 50}
                        y={yMax - 60}
                        width={100}
                        height={50}
                        rx={4}
                        fill="var(--surface-elevated)"
                        opacity={0.92}
                      />
                      <text
                        x={cx}
                        y={yMax - 44}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--text-inverse)"
                      >
                        Min: {item.min} | Q1: {item.q1}
                      </text>
                      <text
                        x={cx}
                        y={yMax - 32}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--text-inverse)"
                      >
                        Med: {item.median}
                      </text>
                      <text
                        x={cx}
                        y={yMax - 20}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--text-inverse)"
                      >
                        Q3: {item.q3} | Max: {item.max}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Y-axis line */}
            <line
              x1={PADDING.left}
              y1={PADDING.top}
              x2={PADDING.left}
              y2={baseY}
              stroke={AXIS_COLOR}
              strokeWidth={1}
            />
            {/* X-axis line */}
            <line
              x1={PADDING.left}
              y1={baseY}
              x2={PADDING.left + plotWidth}
              y2={baseY}
              stroke={AXIS_COLOR}
              strokeWidth={1}
            />
          </>
        ) : (
          /* Horizontal orientation - swap x/y */
          <>
            {ticks.map((tick) => {
              const xPos = valueToX(tick);
              return (
                <g key={`htick-${tick}`}>
                  <line
                    x1={xPos}
                    y1={PADDING.top}
                    x2={xPos}
                    y2={PADDING.top + data.length * (boxWidth + boxSpacing) - boxSpacing}
                    stroke={GRID_COLOR}
                    strokeWidth={0.5}
                  />
                  <text
                    x={xPos}
                    y={PADDING.top + data.length * (boxWidth + boxSpacing) + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill={AXIS_COLOR}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {data.map((item, idx) => {
              const cy = PADDING.top + idx * (boxWidth + boxSpacing) + boxWidth / 2;
              const y = cy - boxWidth / 2;
              const xMin = valueToX(item.min);
              const xQ1 = valueToX(item.q1);
              const xMedian = valueToX(item.median);
              const xQ3 = valueToX(item.q3);
              const xMax = valueToX(item.max);
              const color = item.color || DEFAULT_COLOR;
              const isHovered = hoveredIdx === idx;
              const isClickable = canInteract && !!onBoxClick;

              return (
                <g
                  key={`hbox-${idx}`}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  className={cn(isClickable && 'cursor-pointer')}
                  onClick={() => handleBoxClick(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleBoxClick(item);
                    }
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  opacity={isHovered ? 1 : 0.85}
                >
                  {/* Left whisker */}
                  <line
                    x1={xMin}
                    y1={cy}
                    x2={xQ1}
                    y2={cy}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  <line
                    x1={xMin}
                    y1={cy - boxWidth * 0.3}
                    x2={xMin}
                    y2={cy + boxWidth * 0.3}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                  />

                  {/* Right whisker */}
                  <line
                    x1={xQ3}
                    y1={cy}
                    x2={xMax}
                    y2={cy}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                  />
                  <line
                    x1={xMax}
                    y1={cy - boxWidth * 0.3}
                    x2={xMax}
                    y2={cy + boxWidth * 0.3}
                    stroke={WHISKER_COLOR}
                    strokeWidth={1.5}
                  />

                  {/* Box */}
                  <rect
                    x={xQ1}
                    y={y}
                    width={Math.max(xQ3 - xQ1, 1)}
                    height={boxWidth}
                    fill={color}
                    stroke={isHovered ? WHISKER_COLOR : 'none'}
                    strokeWidth={isHovered ? 2 : 0}
                    rx={3}
                    opacity={0.7}
                  />

                  {/* Median */}
                  <line
                    x1={xMedian}
                    y1={y + 2}
                    x2={xMedian}
                    y2={y + boxWidth - 2}
                    stroke={MEDIAN_COLOR}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />

                  {/* Mean diamond */}
                  {showMean && (
                    <polygon
                      points={`${valueToX(computeMean(item))},${cy - 5} ${valueToX(computeMean(item)) + 5},${cy} ${valueToX(computeMean(item))},${cy + 5} ${valueToX(computeMean(item)) - 5},${cy}`}
                      fill={MEAN_COLOR}
                      stroke="var(--text-inverse)"
                      strokeWidth={1}
                    />
                  )}

                  {/* Outliers */}
                  {showOutliers &&
                    item.outliers?.map((val, oIdx) => (
                      <circle
                        key={`ho-${idx}-${oIdx}`}
                        cx={valueToX(val)}
                        cy={cy}
                        r={3}
                        fill={OUTLIER_COLOR}
                        opacity={0.8}
                      />
                    ))}

                  {/* Y-axis label */}
                  <text
                    x={PADDING.left - 8}
                    y={cy + 4}
                    textAnchor="end"
                    fontSize={10}
                    fill={TEXT_COLOR}
                  >
                    {item.label}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {/* Legend */}
        <g
          transform={`translate(${PADDING.left}, ${isVertical ? chartHeight - 10 : PADDING.top + data.length * (boxWidth + boxSpacing) + 30})`}
        >
          <rect x={0} y={-6} width={10} height={10} rx={2} fill={DEFAULT_COLOR} opacity={0.7} />
          <text x={14} y={3} fontSize={10} fill={TEXT_COLOR}>
            IQR
          </text>
          <line
            x1={50}
            y1={0}
            x2={62}
            y2={0}
            stroke={WHISKER_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
          <text x={66} y={3} fontSize={10} fill={TEXT_COLOR}>
            Whisker
          </text>
          {showOutliers && (
            <>
              <circle cx={120} cy={0} r={3} fill={OUTLIER_COLOR} opacity={0.8} />
              <text x={126} y={3} fontSize={10} fill={TEXT_COLOR}>
                Outlier
              </text>
            </>
          )}
          {showMean && (
            <>
              <polygon points="172,-4 176,0 172,4 168,0" fill={MEAN_COLOR} />
              <text x={180} y={3} fontSize={10} fill={TEXT_COLOR}>
                Mean
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};

BoxPlot.displayName = 'BoxPlot';
export default BoxPlot;
