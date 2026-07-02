import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  SummaryStrip — Horizontal KPI / metric strip                      */
/* ------------------------------------------------------------------ */

export interface SummaryStripItem {
  key: React.Key;
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  trend?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "info" | "success" | "warning";
}

/** Props for the SummaryStrip component.
 * @example
 * ```tsx
 * <SummaryStrip />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/summary-strip)
 */
export interface SummaryStripProps extends AccessControlledProps {
  /** KPI / metric items to display in the strip. */
  items: SummaryStripItem[];
  /** Heading text above the strip. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Number of grid columns for the metric cards. */
  columns?: 2 | 3 | 4;
  /** Additional CSS class name. */
  className?: string;
}

const TONE_BORDER: Record<string, string> = {
  info: "border-s-[var(--state-info-border)]",
  success: "border-s-[var(--state-success-border)]",
  warning: "border-s-[var(--state-warning-border)]",
};

/**
 * Horizontal KPI / metric strip that displays key summary values in a
 * responsive grid with optional icons, trend indicators and tone accents.
 */
export const SummaryStrip = React.forwardRef<HTMLDivElement, SummaryStripProps>(({
  items,
  title,
  description,
  columns = 4,
  className,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
  <div ref={ref} aria-label="Summary metrics" className={cn("w-full", className)} data-access-state={accessState.state} title={accessReason}>
    {(title || description) && (
      <div className="mb-4">
        {title && (
          <h3 className="text-base font-semibold text-text-primary">
            {title}
          </h3>
        )}
        {description && (
          <p className="mt-1 text-sm text-text-secondary">
            {description}
          </p>
        )}
      </div>
    )}

    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {items.map((item) => {
        const tone = item.tone ?? "default";
        const hasToneBorder = tone !== "default";

        return (
          <article
            key={item.key}
            className={cn(
              "relative rounded-lg border border-border-subtle bg-[var(--surface-card))] px-4 py-4",
              hasToneBorder && "border-s-2",
              hasToneBorder && TONE_BORDER[tone],
            )}
          >
            {/* Trend badge — top-right */}
            {item.trend && (
              <div className="absolute top-3 right-3 text-xs font-medium">
                {item.trend}
              </div>
            )}

            {/* Icon */}
            {item.icon && (
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-surface-muted text-text-secondary [&>svg]:h-4 [&>svg]:w-4">
                {item.icon}
              </div>
            )}

            {/* Label */}
            <div className="text-xs font-medium text-text-secondary">
              {item.label}
            </div>

            {/* Value */}
            <div className="mt-1 text-2xl font-bold text-text-primary">
              {item.value}
            </div>

            {/* Note */}
            {item.note && (
              <div className="mt-1 text-xs text-text-secondary">
                {item.note}
              </div>
            )}
          </article>
        );
      })}
    </div>
  </div>
  );
});

SummaryStrip.displayName = "SummaryStrip";
