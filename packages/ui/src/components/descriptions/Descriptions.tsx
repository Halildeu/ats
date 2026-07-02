import React from "react";
import { cn } from "../../utils/cn";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Descriptions — Key-value grid for displaying structured metadata  */
/* ------------------------------------------------------------------ */

/** A single key-value item rendered inside the Descriptions grid.
 * @example
 * ```tsx
 * <Descriptions />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/descriptions)
 */
export interface DescriptionsItem {
  /** Unique identifier for the item. */
  key: string;
  /** Label displayed above the value. */
  label: React.ReactNode;
  /** Primary value content. */
  value?: React.ReactNode;
  /** Secondary helper text shown below the value. */
  helper?: React.ReactNode;
  /** Semantic tone applied as a left border accent. */
  tone?: "default" | "info" | "success" | "warning" | "danger";
  /** Number of grid columns this item spans. */
  span?: 1 | 2 | 3;
}

/**
 * Descriptions displays structured key-value metadata in a responsive grid layout.
 */
export interface DescriptionsProps extends AccessControlledProps {
  /** Array of key-value items to render. */
  items: DescriptionsItem[];
  /** Optional heading above the grid. */
  title?: React.ReactNode;
  /** Optional subtitle below the heading. */
  description?: React.ReactNode;
  /** Number of grid columns. @default 2 */
  columns?: 1 | 2 | 3;
  /** Vertical density of the grid cells. @default "comfortable" */
  density?: "comfortable" | "compact";
  /** Whether to render cell borders. @default false */
  bordered?: boolean;
  /** Custom label shown when items array is empty. */
  emptyStateLabel?: React.ReactNode;
  /** Locale-specific text overrides. */
  localeText?: { emptyFallbackDescription?: React.ReactNode };
  /** Stretch grid to full container width. @default false */
  fullWidth?: boolean;
  /** Additional CSS class name. */
  className?: string;
}

const TONE_BORDER: Record<string, string> = {
  info: "border-s-[var(--state-info-border)]",
  success: "border-s-[var(--state-success-border)]",
  warning: "border-s-[var(--state-warning-border)]",
  danger: "border-s-[var(--state-danger-border)]",
};

export const Descriptions = React.forwardRef<HTMLDivElement, DescriptionsProps>(({
  items,
  title,
  description,
  columns = 2,
  density = "comfortable",
  bordered = false,
  emptyStateLabel,
  localeText,
  fullWidth = false,
  className,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const isCompact = density === "compact";
  const cellPadding = isCompact ? "py-2 px-3" : "py-4 px-4";

  if (items.length === 0) {
    const emptyMsg =
      emptyStateLabel ??
      localeText?.emptyFallbackDescription ??
      "No data available";

    return (
      <div ref={ref} className={cn("w-full", accessState.isDisabled && "pointer-events-none opacity-50", className)} title={accessReason} data-access-state={accessState.state}>
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
        <div className="flex items-center justify-center py-12 text-sm text-text-secondary">
          {emptyMsg}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn(fullWidth ? "w-full" : "max-w-4xl", accessState.isDisabled && "pointer-events-none opacity-50", className)} title={accessReason}>
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

      <dl
        className={cn(
          "grid",
          bordered &&
            "border border-border-subtle rounded-lg overflow-hidden",
        )}
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
        }}
      >
        {items.map((item) => {
          const tone = item.tone ?? "default";
          const hasToneBorder = tone !== "default";

          return (
            <div
              key={item.key}
              className={cn(
                cellPadding,
                bordered &&
                  "border-b border-r border-border-subtle last:border-b-0 [&:nth-last-child(-n+1)]:border-b-0",
                hasToneBorder && "border-s-2",
                hasToneBorder && TONE_BORDER[tone],
              )}
              style={
                item.span && item.span > 1
                  ? { gridColumn: `span ${item.span}` }
                  : undefined
              }
            >
              <dt className="text-xs font-medium text-text-secondary mb-1">
                {item.label}
              </dt>
              <dd className="text-sm text-text-primary">
                {item.value ?? "\u2014"}
              </dd>
              {item.helper && (
                <dd className="mt-0.5 text-xs text-text-secondary">
                  {item.helper}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </div>
  );
});

Descriptions.displayName = "Descriptions";
