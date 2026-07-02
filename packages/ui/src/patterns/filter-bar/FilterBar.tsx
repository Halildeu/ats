import React, { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  FilterBar — Horizontal filter strip with collapsible "More" area   */
/* ------------------------------------------------------------------ */

/** Props for the FilterBar component.
 * @example
 * ```tsx
 * <FilterBar />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/filter-bar)
 */
export interface FilterBarProps extends AccessControlledProps {
  /** Primary filter controls (always visible) */
  children: React.ReactNode;
  /** Secondary/advanced filters (collapsible) */
  moreFilters?: React.ReactNode;
  /** Right-side actions (e.g. Reset, Apply) */
  actions?: React.ReactNode;
  /** Search slot (leftmost) */
  search?: React.ReactNode;
  /** Active filter count for badge */
  activeCount?: number;
  /** Toggle label for more filters */
  moreLabel?: string;
  /** Compact mode — less padding */
  compact?: boolean;
  className?: string;
}

/** Horizontal filter strip with primary controls, collapsible advanced filters, and action buttons. */
export const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(({
  children,
  moreFilters,
  actions,
  search,
  activeCount,
  moreLabel = "More filters",
  compact = false,
  className,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const [showMore, setShowMore] = useState(false);

  return (
    <div
      ref={ref}
      data-access-state={accessState.state}
      className={cn(
        "border-b border-border-subtle bg-[var(--surface-default)]",
        accessState.isDisabled && "pointer-events-none opacity-50",
        className,
      )}
      title={accessReason}
      {...stateAttrs({ component: "filter-bar" })}
    >
      {/* Primary row */}
      <div
        className={cn(
          "flex items-center gap-3 flex-wrap",
          compact ? "px-4 py-2" : "px-6 py-3",
        )}
      >
        {/* Search */}
        {search && <div className="shrink-0">{search}</div>}

        {/* Filter controls */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {children}
        </div>

        {/* More filters toggle */}
        {moreFilters && (
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
              "text-text-secondary hover:text-text-primary",
              "hover:bg-[var(--surface-hover)] transition-colors",
              focusRingClass("ring"),
            )}
          >
            {moreLabel}
            {activeCount != null && activeCount > 0 && (
              <span className="ms-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-action-primary px-1.5 text-xs font-medium text-text-inverse">
                {activeCount}
              </span>
            )}
            <svg
              className={cn(
                "h-4 w-4 transition-[rotate]",
                showMore && "rotate-180",
              )}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {actions}
          </div>
        )}
      </div>

      {/* More filters panel */}
      {moreFilters && showMore && (
        <div
          className={cn(
            "border-t border-border-subtle",
            compact ? "px-4 py-2" : "px-6 py-3",
            "animate-in slide-in-from-top-1 fade-in-0",
          )}
        >
          <div className="flex items-center gap-3 flex-wrap">
            {moreFilters}
          </div>
        </div>
      )}
    </div>
  );
});

FilterBar.displayName = "FilterBar";

/** Type alias for FilterBar ref. */
export type FilterBarRef = React.Ref<HTMLElement>;
/** Type alias for FilterBar element. */
export type FilterBarElement = HTMLElement;
/** Type alias for FilterBar cssproperties. */
export type FilterBarCSSProperties = React.CSSProperties;
