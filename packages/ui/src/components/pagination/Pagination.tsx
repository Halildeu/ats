import React, { useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Pagination — Page navigation with smart ellipsis                   */
/* ------------------------------------------------------------------ */

export type PaginationSize = "sm" | "md";

export interface PaginationProps extends AccessControlledProps {
  /** Total number of items across all pages. */
  total?: number;
  /** Controlled current page number. */
  current?: number;
  /** Initial page for uncontrolled mode. Ignored when `current` is provided. */
  defaultCurrent?: number;
  /** Number of items per page. */
  pageSize?: number;
  /** Callback fired when the page changes. */
  onChange?: (page: number) => void;
  /** Max page buttons visible (excluding prev/next) */
  siblingCount?: number;
  /** Size variant for the pagination buttons. */
  size?: PaginationSize;
  /** Show total count */
  showTotal?: boolean;
  /** Additional CSS class name. */
  className?: string;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function usePaginationRange(
  totalPages: number,
  current: number,
  siblings: number,
): (number | "ellipsis")[] {
  return useMemo(() => {
    const totalNumbers = siblings * 2 + 5; // first + last + current + 2 siblings + 2 ellipsis

    if (totalPages <= totalNumbers) {
      return range(1, totalPages);
    }

    const leftSibling = Math.max(current - siblings, 1);
    const rightSibling = Math.min(current + siblings, totalPages);

    const showLeftEllipsis = leftSibling > 2;
    const showRightEllipsis = rightSibling < totalPages - 1;

    if (!showLeftEllipsis && showRightEllipsis) {
      const leftRange = range(1, siblings * 2 + 3);
      return [...leftRange, "ellipsis" as const, totalPages];
    }

    if (showLeftEllipsis && !showRightEllipsis) {
      const rightRange = range(totalPages - siblings * 2 - 2, totalPages);
      return [1, "ellipsis" as const, ...rightRange];
    }

    return [
      1,
      "ellipsis" as const,
      ...range(leftSibling, rightSibling),
      "ellipsis" as const,
      totalPages,
    ];
  }, [totalPages, current, siblings]);
}

const sizeMap: Record<PaginationSize, string> = {
  sm: "h-7 min-w-7 px-2 text-xs",
  md: "h-8 min-w-8 px-2.5 text-sm",
};

/**
 * Page navigation control with smart ellipsis, controlled/uncontrolled modes, and keyboard support.
 *
 * @example
 * ```tsx
 * <Pagination
 *   total={150}
 *   pageSize={10}
 *   current={currentPage}
 *   onChange={setCurrentPage}
 * />
 * ```
 */
export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(({
  total: totalProp,
  current: currentProp,
  defaultCurrent,
  pageSize = 10,
  onChange: onChangeProp,
  siblingCount = 1,
  size = "md",
  showTotal = false,
  access = "full",
  accessReason,
  className,
}, ref) => {
  const accessState = resolveAccessState(access);

  if (accessState.isHidden) return null;

  const isAccessDisabled = accessState.isDisabled || accessState.isReadonly;

  const total = totalProp ?? 0;

  // Uncontrolled mode: track internal page when `current` prop is not provided
  const [internalCurrent, setInternalCurrent] = useState(defaultCurrent ?? 1);
  const isControlled = currentProp !== undefined;
  const current = isControlled ? currentProp : internalCurrent;

  const onChange = (p: number) => {
    if (!isControlled) {
      setInternalCurrent(p);
    }
    onChangeProp?.(p);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = usePaginationRange(totalPages, current, siblingCount);

  const btnBase = cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition",
    focusRingClass("ring"),
    "disabled:pointer-events-none disabled:opacity-40",
    sizeMap[size],
  );

  return (
    <nav ref={ref as React.Ref<HTMLElement>} aria-label="Pagination" title={accessReason} className={cn("flex items-center gap-1.5", isAccessDisabled && "opacity-50 pointer-events-none", className)} data-access-state={accessState.state} {...stateAttrs({ component: "pagination", disabled: isAccessDisabled, access })}>
      {showTotal && (
        <span className="me-2 text-xs text-text-secondary">
          {total} items
        </span>
      )}

      {/* Prev */}
      <button
        type="button"
        disabled={current <= 1 || isAccessDisabled}
        onClick={() => onChange?.(current - 1)}
        className={cn(btnBase, "text-text-secondary hover:bg-surface-muted")}
        aria-label="Previous page"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Pages */}
      {pages.map((page, i) => {
        if (page === "ellipsis") {
          return (
            <span key={`e-${i}`} className={cn(btnBase, "pointer-events-none text-[var(--text-disabled)]")}>
              ...
            </span>
          );
        }
        const isActive = page === current;
        return (
          <button
            key={page}
            type="button"
            onClick={() => onChange?.(page)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              btnBase,
              isActive
                ? "bg-action-primary text-text-inverse shadow-xs"
                : "text-text-secondary hover:bg-surface-muted",
            )}
          >
            {page}
          </button>
        );
      })}

      {/* Next */}
      <button
        type="button"
        disabled={current >= totalPages || isAccessDisabled}
        onClick={() => onChange?.(current + 1)}
        className={cn(btnBase, "text-text-secondary hover:bg-surface-muted")}
        aria-label="Next page"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  );
});

Pagination.displayName = "Pagination";
