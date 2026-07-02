import React from "react";
import { cn } from "../../utils/cn";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  PageHeader — Standard page-level header with title, actions, tabs  */
/* ------------------------------------------------------------------ */

/** Props for the PageHeader component.
 * @example
 * ```tsx
 * <PageHeader />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/page-header)
 */
export interface PageHeaderProps extends AccessControlledProps {
  /** Page title */
  title: React.ReactNode;
  /** Optional subtitle / description */
  subtitle?: React.ReactNode;
  /** Breadcrumb or back navigation slot */
  breadcrumb?: React.ReactNode;
  /** Avatar or icon before the title */
  avatar?: React.ReactNode;
  /** Primary actions (right-aligned) */
  actions?: React.ReactNode;
  /** Extra content below the title row (e.g. Tabs, metadata) */
  footer?: React.ReactNode;
  /** Additional content between title area and footer */
  extra?: React.ReactNode;
  /** Tags next to the title */
  tags?: React.ReactNode;
  /** Sticky header */
  sticky?: boolean;
  /** Remove bottom border */
  noBorder?: boolean;
  className?: string;
}

/** Standard page-level header with title, breadcrumb, avatar, actions, tags, and footer slot. */
export const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(({
  title,
  subtitle,
  breadcrumb,
  avatar,
  actions,
  footer,
  extra,
  tags,
  sticky = false,
  noBorder = false,
  className,
  access,
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  return (
    <header
      data-access-state={accessState.state}
      className={cn(
        "group/header bg-[var(--surface-default)] px-6 pt-4 pb-0",
        !noBorder && "border-b border-border-subtle",
        sticky && "sticky top-0 z-[100]",
        accessState.isDisabled && "pointer-events-none opacity-50",
        className,
      )}
      title={accessReason}
    >
      {/* Breadcrumb row */}
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {avatar && <div className="shrink-0">{avatar}</div>}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-text-primary truncate">
                {title}
              </h1>
              {tags && <div className="flex items-center gap-1.5">{tags}</div>}
            </div>

            {subtitle && (
              <p
                className="mt-0.5 text-sm text-text-secondary line-clamp-1 opacity-0 transition-opacity duration-(--motion-duration-medium) group-hover/header:opacity-100"
                aria-hidden="false"
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {/* Extra row */}
      {extra && <div className="mt-3">{extra}</div>}

      {/* Footer row (tabs, meta) */}
      {footer && <div className="mt-3">{footer}</div>}

      {/* Bottom spacing if no footer */}
      {!footer && !extra && <div className="h-4" />}
    </header>
  );
});

PageHeader.displayName = "PageHeader";

/* ------------------------------------------------------------------ */
/*  Helper types and factory functions                                 */
/* ------------------------------------------------------------------ */

export interface PageHeaderTagItem {
  key?: React.Key;
  label: React.ReactNode;
  tone?: string;
}

export type PageHeaderTagInput = string | PageHeaderTagItem;

export interface PageHeaderStatItem {
  key?: React.Key;
  label: React.ReactNode;
  value: React.ReactNode;
  helper?: React.ReactNode;
}

export type PageHeaderStatInput =
  | PageHeaderStatItem
  | [React.ReactNode, React.ReactNode, React.ReactNode?];

export interface PageHeaderClasses {
  root?: string;
  body?: string;
  content?: string;
  breadcrumb?: string;
  titleRow?: string;
  titleBlock?: string;
  description?: string;
  metaRow?: string;
  statsGrid?: string;
  statItem?: string;
  actions?: string;
  aside?: string;
  footer?: string;
  secondaryNav?: string;
}

export function createPageHeaderTagItems(
  inputs: PageHeaderTagInput[],
): PageHeaderTagItem[] {
  return inputs.map((item, index) => {
    if (typeof item === "string") {
      return { key: `tag-${index}`, label: item, tone: "default" };
    }
    return {
      key: item.key ?? `tag-${index}`,
      label: item.label,
      tone: item.tone ?? "default",
    };
  });
}

export function createPageHeaderStatItems(
  inputs: PageHeaderStatInput[],
): PageHeaderStatItem[] {
  return inputs.map((item, index) => {
    if (Array.isArray(item)) {
      return {
        key: `stat-${index}`,
        label: item[0],
        value: item[1],
        helper: item[2],
      };
    }
    return {
      key: item.key ?? `stat-${index}`,
      label: item.label,
      value: item.value,
      helper: item.helper,
    };
  });
}
