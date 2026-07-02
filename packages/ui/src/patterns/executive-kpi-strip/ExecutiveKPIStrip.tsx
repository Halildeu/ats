import React, { useMemo } from 'react';
import { resolveAccessState, accessStyles } from '../../internal/access-controller';
import type { AccessLevel } from '../../internal/access-controller';
import { formatValue, getTrendColor, getTrendIcon } from '../../utils/format-helpers';
import type { FormatOptions, TrendInfo } from '../../utils/format-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KPIStripSize = 'sm' | 'md' | 'lg';

export interface KPIMetric {
  /** Unique identifier used as React key and passed to onClick */
  id: string;
  label: string;
  value: number;
  format?: FormatOptions;
  trend?: TrendInfo;
  /** If true, trend colors are inverted (down=good, up=bad) */
  invertTrend?: boolean;
  /** Sparkline data points (raw numbers, auto-scaled to SVG viewBox) */
  sparkline?: number[];
  /** Target value for gauge rendering (0-100 percentage fill) */
  target?: { current: number; goal: number };
  /** Override access per metric */
  access?: AccessLevel;
}

/** Props for the ExecutiveKPIStrip component.
 * @example
 * ```tsx
 * <ExecutiveKPIStrip />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/executive-k-p-i-strip)
 */
export interface ExecutiveKPIStripProps {
  metrics: KPIMetric[];
  /** Number of visible columns on desktop (2-6). Mobile=1, tablet=2. Default 4. */
  columns?: 2 | 3 | 4 | 5 | 6;
  size?: KPIStripSize;
  loading?: boolean;
  /** Global access level applied unless overridden per metric */
  access?: AccessLevel;
  accessReason?: string;
  onMetricClick?: (metricId: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Size configuration
// ---------------------------------------------------------------------------

const SIZE_CONFIG: Record<
  KPIStripSize,
  { card: string; label: string; value: string; trend: string; sparkH: number }
> = {
  sm: {
    card: 'px-3 py-2',
    label: 'text-xs',
    value: 'text-lg font-semibold',
    trend: 'text-[10px]',
    sparkH: 20,
  },
  md: {
    card: 'px-4 py-3',
    label: 'text-sm',
    value: 'text-2xl font-bold',
    trend: 'text-xs',
    sparkH: 28,
  },
  lg: {
    card: 'px-5 py-4',
    label: 'text-base',
    value: 'text-3xl font-bold',
    trend: 'text-sm',
    sparkH: 36,
  },
};

// ---------------------------------------------------------------------------
// Sparkline (inline SVG polyline)
// ---------------------------------------------------------------------------

function MiniSparkline({ data, height, color }: { data: number[]; height: number; color: string }) {
  if (data.length < 2) return null;
  const width = height * 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1; // 1px padding
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mini gauge (arc)
// ---------------------------------------------------------------------------

function MiniGauge({ current, goal, size }: { current: number; goal: number; size: number }) {
  const pct = Math.min(Math.max(current / (goal || 1), 0), 1);
  const radius = (size - 4) / 2;
  const circumference = Math.PI * radius; // half-circle
  const filled = circumference * pct;
  const color =
    pct >= 1
      ? 'var(--state-success-text)'
      : pct >= 0.7
        ? 'var(--state-warning-text)'
        : 'var(--state-error-text)';

  return (
    <svg
      width={size}
      height={size / 2 + 2}
      viewBox={`0 0 ${size} ${size / 2 + 2}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={`M 2 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 2} ${size / 2}`}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={3}
      />
      <path
        d={`M 2 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 2} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function KPISkeleton({ size, count }: { size: KPIStripSize; count: number }) {
  const s = SIZE_CONFIG[size];
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`${s.card} rounded-lg border border-border-default bg-surface-default animate-pulse`}
        >
          <div className="h-3 w-20 rounded-xs bg-surface-muted mb-2" />
          <div className="h-6 w-28 rounded-xs bg-surface-muted mb-1" />
          <div className="h-2 w-16 rounded-xs bg-surface-muted" />
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Responsive grid of KPI metric cards with sparklines, trend indicators, and target gauges. */
export function ExecutiveKPIStrip({
  metrics,
  columns = 4,
  size = 'md',
  loading = false,
  access,
  accessReason,
  onMetricClick,
  className = '',
}: ExecutiveKPIStripProps) {
  const globalAccess = resolveAccessState(access);

  // Grid columns: mobile=1, tablet=2, desktop=configured
  const gridClass = useMemo(() => {
    const colMap: Record<number, string> = {
      2: 'md:grid-cols-2',
      3: 'md:grid-cols-2 lg:grid-cols-3',
      4: 'md:grid-cols-2 lg:grid-cols-4',
      5: 'md:grid-cols-2 lg:grid-cols-5',
      6: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
    };
    return `grid grid-cols-1 ${colMap[columns]} gap-3`;
  }, [columns]);

  if (globalAccess.isHidden) return null;

  const s = SIZE_CONFIG[size];

  return (
    <div
      className={`${gridClass} ${accessStyles(globalAccess.state)} ${className}`}
      role="region"
      aria-label="Key performance indicators"
      data-access-state={globalAccess.state}
      {...(globalAccess.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      {loading ? (
        <KPISkeleton size={size} count={columns} />
      ) : (
        metrics.map((metric) => {
          const metricAccess = resolveAccessState(metric.access ?? access);
          if (metricAccess.isHidden) return null;

          const isInteractive =
            onMetricClick &&
            !metricAccess.isDisabled &&
            !metricAccess.isReadonly &&
            !globalAccess.isDisabled;
          const formatted = formatValue(metric.value, metric.format);
          const trendColor = metric.trend
            ? getTrendColor(metric.trend.direction, metric.invertTrend)
            : undefined;

          return (
            <div
              key={metric.id}
              role={isInteractive ? 'button' : 'group'}
              tabIndex={isInteractive ? 0 : undefined}
              aria-label={`${metric.label}: ${formatted}`}
              aria-disabled={metricAccess.isDisabled || globalAccess.isDisabled || undefined}
              onClick={isInteractive ? () => onMetricClick(metric.id) : undefined}
              onKeyDown={
                isInteractive
                  ? (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onMetricClick(metric.id);
                      }
                    }
                  : undefined
              }
              className={[
                s.card,
                'rounded-lg border border-border-default bg-surface-default',
                'transition-shadow duration-(--motion-duration-fast)',
                isInteractive
                  ? 'cursor-pointer hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
                  : '',
                metricAccess.isDisabled ? 'opacity-50 pointer-events-none' : '',
              ].join(' ')}
            >
              {/* Label */}
              <span className={`${s.label} text-text-secondary block mb-1 truncate`}>
                {metric.label}
              </span>

              {/* Value row */}
              <div className="flex items-end gap-2 flex-wrap">
                <span className={`${s.value} text-text-primary leading-none`}>{formatted}</span>

                {/* Trend badge */}
                {metric.trend && (
                  <span
                    className={`${s.trend} inline-flex items-center gap-0.5 leading-none`}
                    style={{ color: trendColor }}
                    aria-label={`Trend: ${metric.trend.direction} ${metric.trend.value}%${metric.trend.label ? `, ${metric.trend.label}` : ''}`}
                  >
                    <span aria-hidden="true">{getTrendIcon(metric.trend.direction)}</span>
                    {formatValue(metric.trend.value, { format: 'number', decimals: 1 })}%
                    {metric.trend.label && (
                      <span className="text-text-secondary ml-0.5">{metric.trend.label}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Sparkline / Gauge row */}
              {(metric.sparkline || metric.target) && (
                <div className="flex items-center gap-2 mt-2">
                  {metric.sparkline && (
                    <MiniSparkline
                      data={metric.sparkline}
                      height={s.sparkH}
                      color={trendColor ?? 'var(--text-secondary)'}
                    />
                  )}
                  {metric.target && (
                    <MiniGauge
                      current={metric.target.current}
                      goal={metric.target.goal}
                      size={s.sparkH * 2}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

ExecutiveKPIStrip.displayName = 'ExecutiveKPIStrip';

export default ExecutiveKPIStrip;
