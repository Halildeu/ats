import React from "react";
import { cn } from "../../utils/cn";
import type { AccessLevel } from "../../internal/access-controller";
import { resolveAccessState, accessStyles } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  EmptyState — Placeholder for empty data views                      */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  /** Illustration or icon displayed above the title. */
  icon?: React.ReactNode;
  /** Heading text for the empty state. */
  title?: React.ReactNode;
  /** Descriptive text shown below the title. */
  description?: React.ReactNode;
  /** Primary action element (e.g. Button). */
  action?: React.ReactNode;
  /** Secondary action element displayed beside the primary action. */
  secondaryAction?: React.ReactNode;
  /** Compact variant with reduced padding for inline use. */
  compact?: boolean;
  /** Additional CSS class name for the root element. */
  className?: string;
  /** Access level — controls visibility */
  access?: AccessLevel;
  /** Tooltip/title text explaining access restriction */
  accessReason?: string;
}

/**
 * Placeholder for empty data views with icon, title, description, and action buttons.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={<SearchIcon />}
 *   title="No results found"
 *   description="Try adjusting your search or filter criteria."
 *   action={<Button onClick={resetFilters}>Reset Filters</Button>}
 * />
 * ```
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  access = "full",
  accessReason: _accessReason,
  className,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  return (
  <div
    ref={ref}
    data-access-state={accessState.state}
    className={cn(
      "flex flex-col items-center text-center",
      compact ? "py-6 px-4" : "py-12 px-6",
      accessStyles(accessState.state),
      className,
    )}
  >
    {icon && (
      <div className={cn(
        "flex items-center justify-center rounded-2xl bg-surface-muted",
        compact ? "mb-3 h-10 w-10" : "mb-4 h-14 w-14",
        "[&>svg]:h-6 [&>svg]:w-6 text-text-secondary",
      )}>
        {icon}
      </div>
    )}
    <div className={cn(
      "font-semibold text-text-primary",
      compact ? "text-sm" : "text-base",
    )}>
      {title}
    </div>
    {description && (
      <div className={cn(
        "mt-1 max-w-sm text-text-secondary",
        compact ? "text-xs" : "text-sm",
      )}>
        {description}
      </div>
    )}
    {(action || secondaryAction) && (
      <div className="mt-4 flex items-center gap-2">
        {action}
        {secondaryAction}
      </div>
    )}
  </div>
  );
});

EmptyState.displayName = "EmptyState";

/** Type alias for EmptyState ref. */
export type EmptyStateRef = React.Ref<HTMLElement>;
/** Type alias for EmptyState element. */
export type EmptyStateElement = HTMLElement;
/** Type alias for EmptyState cssproperties. */
export type EmptyStateCSSProperties = React.CSSProperties;
