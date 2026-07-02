import React from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Breadcrumb — Navigation hierarchy                                  */
/* ------------------------------------------------------------------ */

export interface BreadcrumbItem {
  /** Display text or node for the breadcrumb step. */
  label: React.ReactNode;
  /** URL for the breadcrumb link. */
  href?: string;
  /** Click handler for the breadcrumb step. */
  onClick?: () => void;
  /** Icon displayed before the label. */
  icon?: React.ReactNode;
}

export interface BreadcrumbProps extends AccessControlledProps {
  /** Ordered list of breadcrumb navigation items. */
  items: BreadcrumbItem[];
  /** Separator character */
  separator?: React.ReactNode;
  /** Max items before collapsing */
  maxItems?: number;
  /** Additional CSS class name. */
  className?: string;
}

const DefaultSeparator = () => (
  <svg className="h-3.5 w-3.5 text-[var(--text-disabled)]" viewBox="0 0 16 16" fill="none">
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Navigation hierarchy breadcrumb trail with collapsible overflow and custom separators.
 *
 * @example
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: 'Home', href: '/' },
 *     { label: 'Products', href: '/products' },
 *     { label: 'Widget Pro' },
 *   ]}
 *   maxItems={4}
 * />
 * ```
 */
export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(({
  items,
  separator,
  maxItems,
  className,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  let visibleItems = items;
  let collapsed = false;

  if (maxItems && items.length > maxItems) {
    const first = items[0];
    const last = items.slice(-(maxItems - 1));
    visibleItems = [first, { label: "..." } as BreadcrumbItem, ...last];
    collapsed = true;
  }

  return (
    <nav ref={ref as React.Ref<HTMLElement>} aria-label="Breadcrumb" className={cn(accessState.isDisabled && "pointer-events-none opacity-50", className)} title={accessReason} {...stateAttrs({ component: "breadcrumb" })}>
      data-access-state={accessState.state}
      <ol className="flex items-center gap-1.5">
        {visibleItems.map((item, i) => {
          const isLast = i === visibleItems.length - 1;
          const isCollapsed = collapsed && i === 1;

          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="shrink-0">
                  {separator ?? <DefaultSeparator />}
                </span>
              )}
              {isCollapsed ? (
                <span className="text-xs text-[var(--text-disabled)]">...</span>
              ) : isLast ? (
                <span
                  className="flex items-center gap-1 text-xs font-medium text-text-primary"
                  aria-current="page"
                >
                  {item.icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>}
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    "flex items-center gap-1 text-xs text-text-secondary",
                    "transition hover:text-text-primary",
                    focusRingClass("outline"),
                    "focus-visible:rounded",
                  )}
                >
                  {item.icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{item.icon}</span>}
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

Breadcrumb.displayName = "Breadcrumb";
