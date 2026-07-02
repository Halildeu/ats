import React, { useRef, useState, Children } from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarGroupProps as AppSidebarGroupPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Collapsible group container for the AppSidebar. Renders a labeled section
 * with an animated expand/collapse toggle, child count badge, and chevron
 * indicator. Shows only the icon when the sidebar is collapsed.
 *
 * @example
 * ```tsx
 * <AppSidebar.Group label="Resources" icon={<FolderIcon />} collapsible>
 *   <AppSidebar.NavItem label="Docs" />
 * </AppSidebar.Group>
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarGroup = React.forwardRef<HTMLDivElement, AppSidebarGroupPropsBase & AccessControlledProps>(({
  label,
  icon,
  collapsible = true,
  defaultOpen = true,
  action,
  children,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed: sidebarCollapsed } = useSidebar();
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);

  const isOpen = !collapsible || open;
  const childCount = Children.count(children);

  /* When the sidebar is collapsed, show only the icon */
  if (sidebarCollapsed) {
    return (
      <div ref={ref} className={cn('bg-surface-default border-b border-border-subtle py-1 text-text-primary', className)} role="group" aria-label={label}>
        {icon && (
          <div className="group relative flex justify-center px-2 py-1.5">
            <span className="text-[var(--text-secondary)] text-lg">{icon}</span>
            <span
              role="tooltip"
              className={cn(
                'pointer-events-none absolute left-full ml-2 z-50',
                'whitespace-nowrap rounded-md px-2 py-1 text-xs',
                'bg-[var(--text-primary)] text-[var(--surface-default)]',
                'opacity-0 group-hover:opacity-100',
                'transition-opacity duration-(--motion-duration-fast)',
              )}
            >
              {label}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('bg-surface-default border-b border-border-subtle py-1 text-text-primary', className)} role="group" aria-label={label}>
      {/* Header */}
      <div className="flex items-center px-3 py-1.5">
        {collapsible ? (
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 text-xs font-semibold',
              'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              'transition-colors duration-(--motion-duration-medium) outline-hidden',
              'focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] rounded',
            )}
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
          >
            {icon && <span className="shrink-0 text-base">{icon}</span>}
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>

            {/* Child count badge */}
            {childCount > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  'bg-[var(--surface-canvas)] text-[var(--text-secondary)]',
                )}
              >
                {childCount}
              </span>
            )}

            {/* Chevron */}
            <svg
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform duration-(--motion-duration-medium)',
                !open && '-rotate-90',
              )}
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
        ) : (
          <div className="flex w-full items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
            {icon && <span className="shrink-0 text-base">{icon}</span>}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {childCount > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                  'bg-[var(--surface-canvas)] text-[var(--text-secondary)]',
                )}
              >
                {childCount}
              </span>
            )}
          </div>
        )}

        {/* Action slot */}
        {action && <span className="ml-1 shrink-0">{action}</span>}
      </div>

      {/* Animated content */}
      <div
        ref={contentRef}
        className={cn(
          'overflow-hidden transition-[max-height,opacity] duration-(--motion-duration-medium) ease-in-out',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-0.5">{children}</div>
      </div>
    </div>
  );
});

AppSidebarGroup.displayName = 'AppSidebar.Group';

/** Props for the AppSidebarGroup component. */
export interface AppSidebarGroupProps extends AppSidebarGroupPropsBase {}

/** Ref type for AppSidebarGroup. */
export type AppSidebarGroupRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarGroup. */
export type AppSidebarGroupElement = HTMLDivElement;
/** CSS properties type for AppSidebarGroup. */
export type AppSidebarGroupCSSProperties = React.CSSProperties;
