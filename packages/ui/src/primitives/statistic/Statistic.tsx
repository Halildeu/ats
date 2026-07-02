import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Statistic — Numeric value display with trend & countdown           */
/* ------------------------------------------------------------------ */

export type StatisticSize = 'sm' | 'md' | 'lg';
export type StatisticTrend = 'up' | 'down' | 'neutral';

export interface StatisticProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'prefix'> {
  /** Label above the value. */
  title?: React.ReactNode;
  /** The numeric or string value. */
  value?: number | string;
  /** Content before the value (e.g. "$", icon). */
  prefix?: React.ReactNode;
  /** Content after the value (e.g. "%", "users"). */
  suffix?: React.ReactNode;
  /** Decimal precision for number values. */
  precision?: number;
  /** Trend direction — renders arrow icon with semantic color. */
  trend?: StatisticTrend;
  /** Trend delta text (e.g. "+12.5%"). */
  trendValue?: string;
  /** Custom value formatter. */
  formatter?: (value: number | string) => React.ReactNode;
  /** Show skeleton loading state. @default false */
  loading?: boolean;
  /** Size preset. @default 'md' */
  size?: StatisticSize;
  /** Custom class for the value element. */
  valueClassName?: string;
}

export interface StatisticCountdownProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Label above the countdown. */
  title?: React.ReactNode;
  /** Target timestamp (Date or ms). */
  value: Date | number;
  /** Display format. @default "HH:mm:ss" */
  format?: string;
  /** Called when countdown reaches zero. */
  onFinish?: () => void;
  /** Size preset. @default 'md' */
  size?: StatisticSize;
}

/* ---- Style maps ---- */

const sizeMap: Record<StatisticSize, { value: string; title: string; trend: string }> = {
  sm: { value: 'text-xl font-bold', title: 'text-xs', trend: 'text-xs' },
  md: { value: 'text-3xl font-bold', title: 'text-sm', trend: 'text-sm' },
  lg: { value: 'text-4xl font-bold', title: 'text-base', trend: 'text-base' },
};

const trendColors: Record<StatisticTrend, string> = {
  up: 'text-state-success-text',
  down: 'text-state-danger-text',
  neutral: 'text-text-secondary',
};

/* ---- Icons ---- */

const TrendUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const TrendDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <polyline points="16 17 22 17 22 11" />
  </svg>
);

/* ---- Skeleton ---- */

const StatisticSkeleton: React.FC<{ size: StatisticSize }> = ({ size }) => {
  const widths = { sm: 'w-16', md: 'w-24', lg: 'w-32' };
  const heights = { sm: 'h-6', md: 'h-8', lg: 'h-10' };
  return (
    <div className="flex flex-col gap-1">
      <div className="h-4 w-20 animate-pulse rounded bg-surface-muted" />
      <div className={cn(heights[size], widths[size], 'animate-pulse rounded bg-surface-muted')} />
    </div>
  );
};

/* ---- Formatter ---- */

function formatNumber(value: number | string, precision?: number): string {
  if (typeof value === 'string') return value;
  if (precision !== undefined) return value.toFixed(precision);
  return value.toLocaleString();
}

/* ---- Main Component ---- */

/**
 * Statistic displays a numeric value with optional title, prefix/suffix,
 * trend indicator, and loading state. Use for KPI cards, dashboards,
 * and metric displays.
 *
 * @example
 * ```tsx
 * <Statistic title="Revenue" value={93.12} prefix="$" suffix="M" precision={2} />
 * <Statistic title="Growth" value={1128} trend="up" trendValue="+12%" />
 * ```
 *
 * @since 1.1.0
 */
const StatisticRoot = forwardRef<HTMLDivElement, StatisticProps>(
  function Statistic(
    {
      title,
      value,
      prefix,
      suffix,
      precision,
      trend,
      trendValue,
      formatter,
      loading = false,
      size = 'md',
      valueClassName,
      className,
      ...rest
    },
    ref,
  ) {
    if (loading) {
      return (
        <div ref={ref} className={className} {...rest}>
          <StatisticSkeleton size={size} />
        </div>
      );
    }

    const styles = sizeMap[size];
    const formattedValue = useMemo(() => {
      if (value === undefined || value === null) return '-';
      if (formatter) return formatter(value);
      return formatNumber(value, precision);
    }, [value, precision, formatter]);

    return (
      <div
        ref={ref}
        {...stateAttrs({ component: 'statistic' })}
        className={cn('flex flex-col', className)}
        {...rest}
      >
        {title && (
          <span className={cn(styles.title, 'font-medium text-text-secondary')}>{title}</span>
        )}
        <div className="flex items-baseline gap-1">
          {prefix && <span className={cn(styles.value, 'text-text-primary', valueClassName)}>{prefix}</span>}
          <span className={cn(styles.value, 'tabular-nums text-text-primary', valueClassName)}>{formattedValue}</span>
          {suffix && <span className={cn(styles.title, 'font-medium text-text-secondary')}>{suffix}</span>}
        </div>
        {(trend || trendValue) && (
          <div className={cn('mt-0.5 flex items-center gap-1', styles.trend, trendColors[trend ?? 'neutral'])}>
            {trend === 'up' && <TrendUpIcon className="h-4 w-4" />}
            {trend === 'down' && <TrendDownIcon className="h-4 w-4" />}
            {trendValue && <span className="font-medium">{trendValue}</span>}
          </div>
        )}
      </div>
    );
  },
);

StatisticRoot.displayName = 'Statistic';

/* ---- Countdown ---- */

function formatCountdown(ms: number, format: string): string {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const days = Math.floor(hours / 24);

  return format
    .replace('DD', String(days).padStart(2, '0'))
    .replace('HH', String(hours).padStart(2, '0'))
    .replace('mm', String(minutes).padStart(2, '0'))
    .replace('ss', String(seconds).padStart(2, '0'));
}

/**
 * Countdown timer that counts down to a target timestamp.
 * Uses requestAnimationFrame for smooth 1-second updates.
 *
 * @example
 * ```tsx
 * <Statistic.Countdown
 *   title="Deadline"
 *   value={new Date('2026-12-31')}
 *   onFinish={() => alert('Done!')}
 * />
 * ```
 */
const CountdownComponent = forwardRef<HTMLDivElement, StatisticCountdownProps>(
  function Countdown({ title, value, format = 'HH:mm:ss', onFinish, size = 'md', className, ...rest }, ref) {
    const target = typeof value === 'number' ? value : value.getTime();
    const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));
    const onFinishRef = useRef(onFinish);
    onFinishRef.current = onFinish;
    const finishedRef = useRef(false);

    useEffect(() => {
      if (remaining <= 0) return;
      const interval = setInterval(() => {
        const next = Math.max(0, target - Date.now());
        setRemaining(next);
        if (next <= 0 && !finishedRef.current) {
          finishedRef.current = true;
          onFinishRef.current?.();
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }, [target]);

    const styles = sizeMap[size];
    const display = formatCountdown(remaining, format);

    return (
      <div
        ref={ref}
        {...stateAttrs({ component: 'statistic-countdown' })}
        className={cn('flex flex-col', className)}
        {...rest}
      >
        {title && <span className={cn(styles.title, 'font-medium text-text-secondary')}>{title}</span>}
        <span className={cn(styles.value, 'tabular-nums text-text-primary')}>{display}</span>
      </div>
    );
  },
);

CountdownComponent.displayName = 'Statistic.Countdown';

/* ---- Compound assembly ---- */

type CompoundStatistic = typeof StatisticRoot & {
  Countdown: typeof CountdownComponent;
};

export const Statistic = StatisticRoot as CompoundStatistic;
Statistic.Countdown = CountdownComponent;
