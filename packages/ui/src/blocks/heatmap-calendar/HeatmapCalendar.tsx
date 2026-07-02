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

/** A single day entry in the heatmap calendar.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/heatmap-calendar)
 */
export interface HeatmapDay {
  /** Date string in YYYY-MM-DD format */
  date: string;
  /** Numeric value for this day */
  value: number;
  /** Optional tooltip label */
  label?: string;
}

/**
 * Props for the HeatmapCalendar component.
 *
 * @example
 * ```tsx
 * <HeatmapCalendar
 *   data={[
 *     { date: '2025-01-15', value: 5 },
 *     { date: '2025-01-16', value: 12 },
 *   ]}
 *   showMonthLabels
 *   showDayLabels
 * />
 * ```
 */
export interface HeatmapCalendarProps extends AccessControlledProps {
  /** Array of day entries with dates and values */
  data: HeatmapDay[];
  /** Start date (YYYY-MM-DD). Defaults to 52 weeks before endDate */
  startDate?: string;
  /** End date (YYYY-MM-DD). Defaults to today */
  endDate?: string;
  /** Five-color scale from light to dark. Defaults to green shades */
  colorScale?: [string, string, string, string, string];
  /** Color for days with no data */
  emptyColor?: string;
  /** Callback when a day cell is clicked */
  onDayClick?: (day: HeatmapDay) => void;
  /** Show month abbreviation labels along the top */
  showMonthLabels?: boolean;
  /** Show day-of-week labels on the left (Mon, Wed, Fri) */
  showDayLabels?: boolean;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Custom tooltip formatter */
  tooltipFormat?: (day: HeatmapDay) => string;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COLOR_SCALE: [string, string, string, string, string] = [
  'var(--heatmap-l1)',
  'var(--heatmap-l2)',
  'var(--heatmap-l3)',
  'var(--heatmap-l4)',
  'var(--heatmap-l5)',
];

const DEFAULT_EMPTY_COLOR = 'var(--heatmap-empty)';

const CELL_SIZE = 12;
const CELL_GAP = 2;
const DAY_LABEL_WIDTH = 30;
const MONTH_LABEL_HEIGHT = 16;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAY_LABELS: Array<{ index: number; label: string }> = [
  { index: 1, label: 'Mon' },
  { index: 3, label: 'Wed' },
  { index: 5, label: 'Fri' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function defaultTooltipFormat(day: HeatmapDay): string {
  return day.label ?? `${day.value} on ${day.date}`;
}

/**
 * Assign values into quantile buckets (0-4) for the 5-color scale.
 * Bucket 0 = lowest values, Bucket 4 = highest.
 */
function computeQuantileBuckets(values: number[]): Map<number, number> {
  if (values.length === 0) return new Map();

  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const n = sorted.length;
  const bucketMap = new Map<number, number>();

  for (let i = 0; i < n; i++) {
    const bucket = Math.min(4, Math.floor((i / n) * 5));
    bucketMap.set(sorted[i], bucket);
  }

  return bucketMap;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GitHub contribution-style heatmap calendar rendered as pure SVG.
 *
 * Displays a 52-week x 7-day grid where each cell's color intensity
 * represents the value for that day. Uses quantile-based bucketing for
 * the 5-level color scale.
 *
 * @example
 * ```tsx
 * <HeatmapCalendar
 *   data={activityData}
 *   showMonthLabels
 *   showDayLabels
 *   showTooltip
 * />
 * ```
 */
export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({
  data,
  startDate: startDateProp,
  endDate: endDateProp,
  colorScale = DEFAULT_COLOR_SCALE,
  emptyColor = DEFAULT_EMPTY_COLOR,
  onDayClick,
  showMonthLabels = true,
  showDayLabels = true,
  showTooltip = true,
  tooltipFormat = defaultTooltipFormat,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const canInteract = !accessState.isDisabled && !accessState.isReadonly;

  // Build data map
  const dataMap = useMemo(() => {
    const map = new Map<string, HeatmapDay>();
    for (const d of data) {
      map.set(d.date, d);
    }
    return map;
  }, [data]);

  // Compute date range
  const { weeks, monthLabels, quantileBuckets } = useMemo(() => {
    const end = endDateProp ? parseDate(endDateProp) : new Date();
    const start = startDateProp ? parseDate(startDateProp) : addDays(end, -364);

    // Adjust start to Sunday (week start)
    const startDow = start.getDay();
    const adjustedStart = startDow === 0 ? start : addDays(start, -startDow);

    // Build weeks (arrays of 7 days)
    const weeksArr: Array<Array<{ date: Date; key: string } | null>> = [];
    let current = new Date(adjustedStart);

    while (current <= end || weeksArr.length === 0) {
      const week: Array<{ date: Date; key: string } | null> = [];
      for (let d = 0; d < 7; d++) {
        if (current > end || current < start) {
          week.push(null);
        } else {
          week.push({ date: new Date(current), key: formatDateKey(current) });
        }
        current = addDays(current, 1);
      }
      weeksArr.push(week);
    }

    // Month labels: find weeks where a new month starts
    const labels: Array<{ weekIndex: number; label: string }> = [];
    let lastMonth = -1;
    for (let w = 0; w < weeksArr.length; w++) {
      for (const day of weeksArr[w]) {
        if (day) {
          const m = day.date.getMonth();
          if (m !== lastMonth) {
            labels.push({ weekIndex: w, label: MONTH_NAMES[m] });
            lastMonth = m;
          }
          break;
        }
      }
    }

    // Quantile buckets
    const nonZeroValues = data.filter((d) => d.value > 0).map((d) => d.value);
    const buckets = computeQuantileBuckets(nonZeroValues);

    return { weeks: weeksArr, monthLabels: labels, quantileBuckets: buckets };
  }, [data, startDateProp, endDateProp]);

  const handleDayEnter = useCallback(
    (e: React.MouseEvent, day: HeatmapDay) => {
      if (!showTooltip) return;
      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: tooltipFormat(day),
      });
    },
    [showTooltip, tooltipFormat],
  );

  const handleDayLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleDayClick = useCallback(
    (day: HeatmapDay) => {
      if (canInteract && onDayClick) {
        onDayClick(day);
      }
    },
    [canInteract, onDayClick],
  );

  // SVG dimensions
  const offsetX = showDayLabels ? DAY_LABEL_WIDTH : 0;
  const offsetY = showMonthLabels ? MONTH_LABEL_HEIGHT : 0;
  const gridWidth = weeks.length * (CELL_SIZE + CELL_GAP);
  const gridHeight = 7 * (CELL_SIZE + CELL_GAP);
  const svgWidth = offsetX + gridWidth + 10;
  const svgHeight = offsetY + gridHeight + 10;

  return (
    <div
      className={cn(
        'inline-block border border-[var(--border-default)] rounded-lg bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="heatmap-calendar"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Heatmap calendar"
      >
        {/* Month labels */}
        {showMonthLabels &&
          monthLabels.map((ml, i) => (
            <text
              key={`ml-${i}`}
              x={offsetX + ml.weekIndex * (CELL_SIZE + CELL_GAP)}
              y={offsetY - 4}
              fontSize={10}
              fill="var(--text-tertiary)"
            >
              {ml.label}
            </text>
          ))}

        {/* Day labels */}
        {showDayLabels &&
          DAY_LABELS.map((dl) => (
            <text
              key={`dl-${dl.index}`}
              x={offsetX - 6}
              y={offsetY + dl.index * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1}
              textAnchor="end"
              fontSize={9}
              fill="var(--text-tertiary)"
            >
              {dl.label}
            </text>
          ))}

        {/* Grid cells */}
        {weeks.map((week, wi) =>
          week.map((daySlot, di) => {
            if (!daySlot) return null;

            const dayData = dataMap.get(daySlot.key);
            const x = offsetX + wi * (CELL_SIZE + CELL_GAP);
            const y = offsetY + di * (CELL_SIZE + CELL_GAP);
            const isClickable = canInteract && !!onDayClick && !!dayData;

            let fill = emptyColor;
            if (dayData && dayData.value > 0) {
              const bucket = quantileBuckets.get(dayData.value) ?? 0;
              fill = colorScale[bucket];
            }

            return (
              <rect
                key={daySlot.key}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={fill}
                role="img"
                className={cn(
                  'transition-opacity duration-(--motion-duration-fast)',
                  isClickable && 'cursor-pointer',
                )}
                onClick={dayData ? () => handleDayClick(dayData) : undefined}
                onMouseEnter={dayData ? (e) => handleDayEnter(e, dayData) : undefined}
                onMouseLeave={dayData ? handleDayLeave : undefined}
                aria-label={
                  dayData ? `${daySlot.key}: ${dayData.value}` : `${daySlot.key}: no data`
                }
              />
            );
          }),
        )}
      </svg>

      {/* Tooltip (fixed, portal-free) */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 rounded-xs text-xs shadow-md pointer-events-none bg-[var(--surface-elevated)] text-[var(--text-on-elevated)]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
          role="tooltip"
        >
          {tooltip.text}
        </div>
      )}

      {/* Color scale legend */}
      <div className="flex items-center gap-1.5 mt-3">
        <span className="text-[10px] text-[var(--text-tertiary)]">Less</span>
        <span
          className="inline-block rounded-xs"
          style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: emptyColor }}
          aria-hidden="true"
        />
        {colorScale.map((color, i) => (
          <span
            key={`legend-${i}`}
            className="inline-block rounded-xs"
            style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: color }}
            aria-hidden="true"
          />
        ))}
        <span className="text-[10px] text-[var(--text-tertiary)]">More</span>
      </div>
    </div>
  );
};

HeatmapCalendar.displayName = 'HeatmapCalendar';
export default HeatmapCalendar;
