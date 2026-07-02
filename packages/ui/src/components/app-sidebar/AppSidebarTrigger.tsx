import React from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarTriggerProps as AppSidebarTriggerPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Toggle button that collapses or expands the AppSidebar. Renders a
 * panel-left-open or panel-left-close icon depending on current state,
 * with dynamic `aria-label` for screen readers.
 *
 * @example
 * ```tsx
 * <AppSidebar.Header action={<AppSidebar.Trigger />} />
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarTrigger = React.forwardRef<HTMLButtonElement, AppSidebarTriggerPropsBase & AccessControlledProps>(({
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed, toggle } = useSidebar();

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl cursor-pointer',
        'text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]',
        'transition-colors duration-(--motion-duration-medium) outline-hidden',
        'focus-visible:ring-2 focus-visible:ring-[var(--action-primary)]',
        className,
      )}
    >
      {isCollapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
    </button>
  );
});

AppSidebarTrigger.displayName = 'AppSidebar.Trigger';

/* ------------------------------------------------------------------ */
/*  Inline icons (avoid external icon dependency)                      */
/* ------------------------------------------------------------------ */

function PanelLeftCloseIcon() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <path d="m16 15-3-3 3-3" />
    </svg>
  );
}

function PanelLeftOpenIcon() {
  return (
    <svg
      className="h-[18px] w-[18px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}

/** Props for the AppSidebarTrigger component. */
export interface AppSidebarTriggerProps extends AppSidebarTriggerPropsBase {}

/** Ref type for AppSidebarTrigger. */
export type AppSidebarTriggerRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarTrigger. */
export type AppSidebarTriggerElement = HTMLDivElement;
/** CSS properties type for AppSidebarTrigger. */
export type AppSidebarTriggerCSSProperties = React.CSSProperties;
