import React, { useCallback, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  SmartDashboard — Intelligent auto-organizing dashboard             */
/*                                                                     */
/*  Auto-sorts widgets by pin state and tone priority. KPI cards with  */
/*  trend indicators, per-widget refresh, time-range selector,         */
/*  greeting banner, and responsive grid layout.                       */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

export type TrendDirection = "up" | "down" | "stable";

export type WidgetTrend = {
  direction: TrendDirection;
  percentage: number;
};

export type WidgetType =
  | "kpi"
  | "chart"
  | "table"
  | "list"
  | "timeline"
  | "progress"
  | "custom";

export type WidgetTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export type DashboardWidget = {
  key: string;
  title: string;
  type: WidgetType;
  value?: string | number;
  trend?: WidgetTrend;
  size?: WidgetSize;
  tone?: WidgetTone;
  content?: React.ReactNode;
  pinned?: boolean;
  refreshInterval?: number;
  onRefresh?: () => void;
  lastUpdated?: string;
};

export type DashboardDensity = "comfortable" | "compact";

/** Props for the SmartDashboard component.
 * @example
 * ```tsx
 * <SmartDashboard />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/smart-dashboard)
 */
export interface SmartDashboardProps extends AccessControlledProps {
  /** Widget definitions to display in the dashboard grid. */
  widgets: DashboardWidget[];
  /** Heading text for the dashboard. */
  title?: string;
  /** Descriptive text below the heading. */
  description?: string;
  /** Personalized greeting message shown in a banner. */
  greeting?: string;
  /** Callback fired when widget order changes. */
  onWidgetReorder?: (keys: string[]) => void;
  /** Callback fired when a widget is pinned or unpinned. */
  onWidgetPin?: (key: string, pinned: boolean) => void;
  /** Callback to refresh all widgets at once. */
  refreshAll?: () => void;
  /** Currently selected time range value. */
  timeRange?: string;
  /** Callback fired when the time range selector changes. */
  onTimeRangeChange?: (range: string) => void;
  /** Number of grid columns for the widget layout. */
  columns?: 2 | 3 | 4;
  /** Spacing density variant. */
  density?: DashboardDensity;
  /** Additional CSS class name. */
  className?: string;
}

/* ---- Constants ---- */

const TONE_PRIORITY: Record<WidgetTone, number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
  default: 4,
};

const TONE_BORDER: Record<WidgetTone, string> = {
  danger:
    "border-s-4 border-s-[var(--state-danger-text)]",
  warning:
    "border-s-4 border-s-[var(--state-warning-text)]",
  info: "border-s-4 border-s-[var(--state-info-text)]",
  success:
    "border-s-4 border-s-[var(--state-success-text)]",
  default: "",
};

const SIZE_SPAN: Record<WidgetSize, string> = {
  sm: "col-span-1",
  md: "col-span-1",
  lg: "col-span-1",
  xl: "col-span-1",
};

const TREND_COLORS: Record<TrendDirection, string> = {
  up: "text-[var(--state-success-text)]",
  down: "text-[var(--state-danger-text)]",
  stable: "text-text-secondary",
};

const _SKELETON_PULSE =
  "animate-pulse rounded-lg bg-surface-muted";

const TIME_RANGE_OPTIONS = [
  { label: "Son 24 saat", value: "24h" },
  { label: "Son 7 gun", value: "7d" },
  { label: "Son 30 gun", value: "30d" },
  { label: "Son 90 gun", value: "90d" },
];

/* ---- Helpers ---- */

const sortWidgets = (widgets: DashboardWidget[]): DashboardWidget[] => {
  return [...widgets].sort((a, b) => {
    /* Pinned first */
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    /* Then by tone priority */
    const ta = TONE_PRIORITY[a.tone ?? "default"];
    const tb = TONE_PRIORITY[b.tone ?? "default"];
    return ta - tb;
  });
};

/* ---- Sub-components ---- */

const TrendIndicator: React.FC<{ trend: WidgetTrend }> = ({ trend }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        TREND_COLORS[trend.direction],
      )}
      aria-label={`Trend: ${trend.direction === "up" ? "yukselis" : trend.direction === "down" ? "dusus" : "sabit"} %${trend.percentage}`}
    >
      {trend.direction === "up" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 9V3M6 3L3 6M6 3L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {trend.direction === "down" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 3V9M6 9L3 6M6 9L9 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {trend.direction === "stable" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      %{trend.percentage}
    </span>
  );
};

const WidgetCard: React.FC<{
  widget: DashboardWidget;
  density: DashboardDensity;
  onPin?: (key: string, pinned: boolean) => void;
  refreshingKey: string | null;
  onRefreshClick: (key: string) => void;
}> = ({ widget, density, onPin, refreshingKey, onRefreshClick }) => {
  const isCompact = density === "compact";
  const isRefreshing = refreshingKey === widget.key;
  const tone = widget.tone ?? "default";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-subtle/80 bg-[var(--surface-card))] shadow-xs transition-all duration-(--motion-duration-medium)",
        TONE_BORDER[tone],
        isCompact ? "p-3" : "p-5",
      )}
      data-widget-key={widget.key}
      data-widget-type={widget.type}
      data-widget-tone={tone}
      role="region"
      aria-label={widget.title}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-medium text-text-secondary",
              isCompact ? "text-xs" : "text-sm",
            )}
          >
            {widget.title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Pin button */}
          {onPin && (
            <button
              type="button"
              onClick={() => onPin(widget.key, !widget.pinned)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-surface-muted",
                widget.pinned
                  ? "text-[var(--action-primary-bg)]"
                  : "text-text-secondary",
              )}
              aria-label={widget.pinned ? `${widget.title} sabitlemeyi kaldir` : `${widget.title} sabitle`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M6 1V7M6 1L3.5 3.5M6 1L8.5 3.5M2 11H10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {/* Refresh button */}
          {widget.onRefresh && (
            <button
              type="button"
              onClick={() => onRefreshClick(widget.key)}
              disabled={isRefreshing}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted disabled:opacity-50"
              aria-label={`${widget.title} yenile`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className={cn(isRefreshing && "animate-spin")}
              >
                <path
                  d="M1.5 6C1.5 3.51472 3.51472 1.5 6 1.5C7.79493 1.5 9.34835 2.53003 10.125 4M10.5 6C10.5 8.48528 8.48528 10.5 6 10.5C4.20507 10.5 2.65165 9.46997 1.875 8M10.125 1.5V4H7.125M1.875 10.5V8H4.875"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* KPI value + trend */}
      {widget.type === "kpi" && widget.value !== undefined && (
        <div className="mb-2 flex items-end gap-2">
          <span className={cn("font-bold tabular-nums text-text-primary", isCompact ? "text-xl" : "text-2xl")}>
            {widget.value}
          </span>
          {widget.trend && <TrendIndicator trend={widget.trend} />}
        </div>
      )}

      {/* Custom content */}
      {widget.content && (
        <div className="mt-1">{widget.content}</div>
      )}

      {/* Last updated */}
      {widget.lastUpdated && (
        <div className="mt-2 text-[10px] text-text-secondary">
          Son guncelleme: {widget.lastUpdated}
        </div>
      )}
    </div>
  );
};

/* ---- Main Component ---- */

/** Auto-organizing dashboard with KPI cards, trend indicators, pin/tone priority sorting, and responsive grid layout. */
export const SmartDashboard = React.forwardRef<HTMLElement, SmartDashboardProps>(({
  widgets,
  title,
  description,
  greeting,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onWidgetReorder,
  onWidgetPin,
  refreshAll,
  timeRange,
  onTimeRangeChange,
  columns = 3,
  density = "comfortable",
  className,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const isCompact = density === "compact";

  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);

  const handleRefreshClick = useCallback(
    (key: string) => {
      const widget = widgets.find((w) => w.key === key);
      if (!widget?.onRefresh) return;
      setRefreshingKey(key);
      widget.onRefresh();
      /* Clear after a short delay for UX */
      setTimeout(() => setRefreshingKey(null), 800);
    },
    [widgets],
  );

  const sortedWidgets = useMemo(() => sortWidgets(widgets), [widgets]);

  /** Map desired column count to a minmax breakpoint for auto-fit. */
  const gridMinWidth: Record<number, number> = {
    2: 280,
    3: 220,
    4: 200,
  };

  return (
    <section
      ref={ref}
      className={cn("flex flex-col gap-4", className)}
      data-access-state={accessState.state}
      data-component="smart-dashboard"
      title={accessReason}
    >
      {/* Greeting banner */}
      {greeting && (
        <div
          className="rounded-2xl bg-linear-to-r from-[var(--action-primary-bg)]/10 to-transparent px-5 py-4"
          data-testid="greeting-banner"
        >
          <p className="text-lg font-semibold text-text-primary">
            {greeting}
          </p>
        </div>
      )}

      {/* Header row */}
      {(title || description || refreshAll || onTimeRangeChange) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-text-secondary">
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Time range selector */}
            {onTimeRangeChange && (
              <select
                value={timeRange ?? ""}
                onChange={(e) => onTimeRangeChange(e.target.value)}
                className="rounded-lg border border-border-subtle bg-transparent px-2 py-1.5 text-xs text-text-secondary outline-hidden focus:border-selection-outline"
                aria-label="Zaman araligi"
              >
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            {/* Refresh all */}
            {refreshAll && (
              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
                aria-label="Tumunu yenile"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M1.5 7C1.5 3.96243 3.96243 1.5 7 1.5C9.07107 1.5 10.8763 2.65625 11.8125 4.375M12.5 7C12.5 10.0376 10.0376 12.5 7 12.5C4.92893 12.5 3.12372 11.3438 2.1875 9.625M11.8125 1.5V4.375H8.9375M2.1875 12.5V9.625H5.0625"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Widget grid */}
      <div
        className={cn(
          "grid",
          isCompact ? "gap-3" : "gap-5",
        )}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${gridMinWidth[columns]}px, 100%), 1fr))` }}
        role="list"
        aria-label={title ?? "Kontrol paneli"}
      >
        {sortedWidgets.map((widget) => (
          <div
            key={widget.key}
            className={SIZE_SPAN[widget.size ?? "md"]}
            role="listitem"
          >
            <WidgetCard
              widget={widget}
              density={density}
              onPin={onWidgetPin}
              refreshingKey={refreshingKey}
              onRefreshClick={handleRefreshClick}
            />
          </div>
        ))}
      </div>
    </section>
  );
});

SmartDashboard.displayName = "SmartDashboard";

export default SmartDashboard;
