import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarSectionProps as AppSidebarSectionPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Lightweight grouping section for the AppSidebar navigation. Renders
 * an optional uppercase section title with collapsible content via
 * `aria-expanded`. Title is hidden when the sidebar is collapsed.
 *
 * @example
 * ```tsx
 * <AppSidebar.Section title="General" collapsible>
 *   <AppSidebar.NavItem label="Overview" />
 * </AppSidebar.Section>
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarSection = React.forwardRef<HTMLDivElement, AppSidebarSectionPropsBase & AccessControlledProps>(({
  title,
  collapsible = false,
  defaultOpen = true,
  children,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed: sidebarCollapsed } = useSidebar();
  const [open, setOpen] = useState(defaultOpen);

  const showHeader = title && !sidebarCollapsed;
  const isOpen = !collapsible || open;

  return (
    <div ref={ref} className={cn('py-1 text-text-primary', className)} role="group" aria-label={title}>
      {showHeader && (
        <div className="flex items-center px-3 py-1.5">
          {collapsible ? (
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
                'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                'transition-colors duration-(--motion-duration-medium) outline-hidden',
                'focus-visible:ring-2 focus-visible:ring-[var(--action-primary)] rounded',
              )}
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
            >
              <svg
                className={cn(
                  'h-3 w-3 shrink-0 transition-transform duration-(--motion-duration-medium)',
                  !open && '-rotate-90',
                )}
                viewBox="0 0 12 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2 4l4 4 4-4" />
              </svg>
              <span className="truncate">{title}</span>
            </button>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              {title}
            </span>
          )}
        </div>
      )}

      {isOpen && <div className="space-y-0.5">{children}</div>}
    </div>
  );
});

AppSidebarSection.displayName = 'AppSidebar.Section';

/** Props for the AppSidebarSection component. */
export interface AppSidebarSectionProps extends AppSidebarSectionPropsBase {}

/** Ref type for AppSidebarSection. */
export type AppSidebarSectionRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarSection. */
export type AppSidebarSectionElement = HTMLDivElement;
/** CSS properties type for AppSidebarSection. */
export type AppSidebarSectionCSSProperties = React.CSSProperties;
