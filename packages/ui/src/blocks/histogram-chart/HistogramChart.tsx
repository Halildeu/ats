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
 * A computed histogram bin with start/end range and count.
 * @since 1.0.0
 */
export interface HistogramBin {
  /** Start of the bin range (inclusive) */
  start: number;
  /** End of the bin range (exclusive for all bins except last) */
  end: number;
  /** Number of data points in this bin */
  count: number;
}

/**
 * Props for the HistogramChart component.
 *
 * @example
 * ```tsx
 * <HistogramChart
 *   data={[12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38, 40]}
 *   bins={8}
 *   showNormalCurve
 *   showMean
 *   xLabel="Duration (min)"
 *   yLabel="Frequency"
 * />
 * ```
 *
 * @since 1.0.0
 * @see HistogramBin
 */
export interface HistogramChartProps extends AccessControlledProps {
  /** Raw numeric data to compute histogram from */
  data: number[];
  /** Number of bins (auto-calculated via Sturges if omitted) */
  bins?: number;
  /** Fixed bin width (overrides bins if provided) */
  binWidth?: number;
  /** Show a normal distribution overlay curve (default: false) */
  showNormalCurve?: boolean;
  /** Show a vertical mean line (default: false) */
  showMean?: boolean;
  /** Show a vertical median line (default: false) */
  showMedian?: boolean;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Bar fill color */
  color?: string;
  /** Chart width (number for px, string for CSS) */
  width?: number | string;
  /** Chart height (number for px, string for CSS) */
  height?: number | string;
  /** Callback when a bin bar is clicked */
  onBinClick?: (bin: HistogramBin) => void;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = 'var(--histogram-bar)';
const CURVE_COLOR = 'var(--histogram-curve)';
const MEAN_COLOR = 'var(--histogram-mean)';
const MEDIAN_COLOR = 'var(--histogram-median)';
const GRID_COLOR = 'var(--border-subtle)';
const TEXT_COLOR = 'var(--text-secondary)';
const AXIS_COLOR = 'var(--text-tertiary)';

const PADDING = { top: 30, right: 30, bottom: 60, left: 55 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBins(data: number[], numBins?: number, binWidthArg?: number): HistogramBin[] {
  if (data.length === 0) return [];

  const sorted = [...data].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min || 1;

  let actualBinWidth: number;
  let actualBins: number;

  if (binWidthArg && binWidthArg > 0) {
    actualBinWidth = binWidthArg;
    actualBins = Math.ceil(range / actualBinWidth);
  } else if (numBins && numBins > 0) {
    actualBins = numBins;
    actualBinWidth = range / actualBins;
  } else {
    // Sturges' formula
    actualBins = Math.max(1, Math.ceil(Math.log2(data.length) + 1));
    actualBinWidth = range / actualBins;
  }

  // Ensure at least a small bin width
  if (actualBinWidth <= 0) actualBinWidth = 1;

  const bins: HistogramBin[] = [];
  for (let i = 0; i < actualBins; i++) {
    bins.push({
      start: min + i * actualBinWidth,
      end: min + (i + 1) * actualBinWidth,
      count: 0,
    });
  }

  for (const val of sorted) {
    let idx = Math.floor((val - min) / actualBinWidth);
    if (idx >= actualBins) idx = actualBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }

  return bins;
}

function computeStats(data: number[]): { mean: number; median: number; stddev: number } {
  if (data.length === 0) return { mean: 0, median: 0, stddev: 0 };
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { mean, median, stddev };
}

function normalPDF(x: number, mean: number, stddev: number): number {
  if (stddev === 0) return 0;
  const exp = -0.5 * ((x - mean) / stddev) ** 2;
  return (1 / (stddev * Math.sqrt(2 * Math.PI))) * Math.exp(exp);
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Frequency distribution histogram rendered as pure SVG.
 *
 * Automatically computes bins from raw data, renders vertical bars for
 * each frequency bin, and optionally overlays a normal distribution
 * curve and mean/median reference lines. Uses Sturges' formula for
 * automatic bin count when not specified.
 *
 * @example
 * ```tsx
 * <HistogramChart
 *   data={measurementData}
 *   bins={10}
 *   showNormalCurve
 *   showMean
 *   showMedian
 *   xLabel="Response Time (ms)"
 *   yLabel="Count"
 * />
 * ```
 *
 * @since 1.0.0
 * @see HistogramBin
 */
export const HistogramChart: React.FC<HistogramChartProps> = ({
  data,
  bins: binsCount,
  binWidth,
  showNormalCurve = false,
  showMean = false,
  showMedian = false,
  xLabel,
  yLabel,
  color = DEFAULT_COLOR,
  width,
  height = 400,
  onBinClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  const handleBinClick = useCallback(
    (bin: HistogramBin) => {
      if (canInteract && onBinClick) onBinClick(bin);
    },
    [canInteract, onBinClick],
  );

  const histBins = useMemo(
    () => computeBins(data, binsCount, binWidth),
    [data, binsCount, binWidth],
  );
  const stats = useMemo(() => computeStats(data), [data]);

  if (data.length === 0 || histBins.length === 0) {
    return (
      <div
        className={cn('p-8 text-center text-sm text-[var(--text-tertiary)]', className)}
        data-component="histogram-chart"
      >
        No data
      </div>
    );
  }

  const chartHeight = typeof height === 'number' ? height : 400;
  const maxCount = Math.max(...histBins.map((b) => b.count));
  const dataMin = histBins[0].start;
  const dataMax = histBins[histBins.length - 1].end;

  const barGap = 1;
  const barWidth = Math.max(16, Math.min(60, 500 / histBins.length));
  const plotWidth = histBins.length * (barWidth + barGap) - barGap;
  const plotHeight = chartHeight - PADDING.top - PADDING.bottom;
  const svgWidth = PADDING.left + plotWidth + PADDING.right;

  const yTicks = niceScale(0, maxCount, 5);
  const yMax = yTicks[yTicks.length - 1] || maxCount;

  const yScale = (v: number): number => PADDING.top + plotHeight - (v / (yMax || 1)) * plotHeight;
  const xScale = (v: number): number =>
    PADDING.left + ((v - dataMin) / (dataMax - dataMin || 1)) * plotWidth;

  const baseY = PADDING.top + plotHeight;

  // Normal curve path
  const normalPath = useMemo(() => {
    if (!showNormalCurve || stats.stddev === 0) return null;
    const totalArea = data.length * ((dataMax - dataMin) / histBins.length);
    const points: string[] = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const xVal = dataMin + (i / steps) * (dataMax - dataMin);
      const yVal = normalPDF(xVal, stats.mean, stats.stddev) * totalArea;
      const px = xScale(xVal);
      const py = yScale(yVal);
      points.push(`${i === 0 ? 'M' : 'L'} ${px} ${py}`);
    }
    return points.join(' ');
  }, [showNormalCurve, stats, data.length, dataMin, dataMax, histBins.length]);

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="histogram-chart"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      <svg
        width={width || '100%'}
        viewBox={`0 0 ${svgWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Histogram chart"
      >
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

        {/* Bars */}
        {histBins.map((bin, idx) => {
          const x = PADDING.left + idx * (barWidth + barGap);
          const barH = Math.max((bin.count / (yMax || 1)) * plotHeight, bin.count > 0 ? 2 : 0);
          const barY = baseY - barH;
          const isHovered = hoveredIdx === idx;
          const isClickable = canInteract && !!onBinClick;

          return (
            <g key={`bin-${idx}`}>
              <rect
                x={x}
                y={barY}
                width={barWidth}
                height={barH}
                fill={color}
                rx={1}
                opacity={isHovered ? 1 : 0.75}
                className={cn(
                  'transition-opacity duration-(--motion-duration-fast)',
                  isClickable && 'cursor-pointer',
                )}
                onClick={() => handleBinClick(bin)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
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
                  rx={2}
                  pointerEvents="none"
                />
              )}
              {/* Bin count label on hover */}
              {isHovered && (
                <text
                  x={x + barWidth / 2}
                  y={barY - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--text-primary)"
                >
                  {bin.count}
                </text>
              )}

              {/* X-axis bin label */}
              <text
                x={x + barWidth / 2}
                y={baseY + 14}
                textAnchor="middle"
                fontSize={8}
                fill={AXIS_COLOR}
              >
                {bin.start.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Last bin end label */}
        <text
          x={PADDING.left + histBins.length * (barWidth + barGap) - barGap}
          y={baseY + 14}
          textAnchor="middle"
          fontSize={8}
          fill={AXIS_COLOR}
        >
          {histBins[histBins.length - 1].end.toFixed(1)}
        </text>

        {/* Normal curve */}
        {normalPath && (
          <path
            d={normalPath}
            fill="none"
            stroke={CURVE_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* Mean line */}
        {showMean && (
          <g>
            <line
              x1={xScale(stats.mean)}
              y1={PADDING.top}
              x2={xScale(stats.mean)}
              y2={baseY}
              stroke={MEAN_COLOR}
              strokeWidth={2}
              strokeDasharray="6 3"
            />
            <text
              x={xScale(stats.mean)}
              y={PADDING.top - 6}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={MEAN_COLOR}
            >
              Ort: {stats.mean.toFixed(1)}
            </text>
          </g>
        )}

        {/* Median line */}
        {showMedian && (
          <g>
            <line
              x1={xScale(stats.median)}
              y1={PADDING.top}
              x2={xScale(stats.median)}
              y2={baseY}
              stroke={MEDIAN_COLOR}
              strokeWidth={2}
              strokeDasharray="6 3"
            />
            <text
              x={xScale(stats.median)}
              y={PADDING.top - 6}
              textAnchor="middle"
              fontSize={9}
              fontWeight={600}
              fill={MEDIAN_COLOR}
            >
              Med: {stats.median.toFixed(1)}
            </text>
          </g>
        )}

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
            x={12}
            y={PADDING.top + plotHeight / 2}
            textAnchor="middle"
            fontSize={11}
            fill={TEXT_COLOR}
            transform={`rotate(-90, 12, ${PADDING.top + plotHeight / 2})`}
          >
            {yLabel}
          </text>
        )}

        {/* Legend */}
        <g transform={`translate(${PADDING.left + plotWidth - 180}, ${PADDING.top + 4})`}>
          {showNormalCurve && (
            <>
              <line x1={0} y1={0} x2={16} y2={0} stroke={CURVE_COLOR} strokeWidth={2} />
              <text x={20} y={4} fontSize={9} fill={TEXT_COLOR}>
                Normal Curve
              </text>
            </>
          )}
          {showMean && (
            <>
              <line
                x1={90}
                y1={0}
                x2={106}
                y2={0}
                stroke={MEAN_COLOR}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <text x={110} y={4} fontSize={9} fill={TEXT_COLOR}>
                Mean
              </text>
            </>
          )}
          {showMedian && (
            <>
              <line
                x1={140}
                y1={0}
                x2={156}
                y2={0}
                stroke={MEDIAN_COLOR}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <text x={160} y={4} fontSize={9} fill={TEXT_COLOR}>
                Median
              </text>
            </>
          )}
        </g>
      </svg>
    </div>
  );
};

HistogramChart.displayName = 'HistogramChart';
export default HistogramChart;
