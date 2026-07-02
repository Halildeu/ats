import React from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import {
  StatusIndicator,
  type StatusIndicatorStatus,
} from '../../primitives/status-indicator';

/* ------------------------------------------------------------------ */
/*  AppSidebarFooterStatus — Status indicator adapted for sidebar      */
/* ------------------------------------------------------------------ */

export interface AppSidebarFooterStatusProps {
  /** Current status. @default "online" */
  status?: StatusIndicatorStatus;
  /** Custom label. When omitted, uses status name. */
  label?: string;
  /** Animate pulse ring on online status. @default false */
  pulse?: boolean;
  /** Additional CSS class. */
  className?: string;
}

/**
 * Status indicator wrapper for the AppSidebar footer. Shows a full
 * label + dot when expanded and dot-only with tooltip when collapsed.
 *
 * @example
 * ```tsx
 * <AppSidebar.Footer>
 *   <AppSidebar.FooterStatus status="online" />
 * </AppSidebar.Footer>
 * ```
 *
 * @since 1.1.0
 * @see StatusIndicator
 * @see AppSidebar.Footer
 */
export const AppSidebarFooterStatus = React.forwardRef<
  HTMLDivElement,
  AppSidebarFooterStatusProps
>(({ status = 'online', label, pulse = false, className }, ref) => {
  const { isCollapsed } = useSidebar();

  const resolvedLabel = label ?? (status.charAt(0).toUpperCase() + status.slice(1));

  return (
    <div
      ref={ref}
      className={cn(
        'group relative flex items-center rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-xs font-semibold text-text-secondary',
        isCollapsed && 'justify-center px-2',
        className,
      )}
    >
      <StatusIndicator
        status={status}
        label={resolvedLabel}
        showLabel={!isCollapsed}
        pulse={pulse}
      />
      {isCollapsed && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute left-full ml-2 z-50',
            'whitespace-nowrap rounded-md px-2 py-1 text-xs',
            'bg-[var(--text-primary)] text-[var(--surface-default)]',
            'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            'transition-opacity duration-(--motion-duration-fast)',
          )}
        >
          {resolvedLabel}
        </span>
      )}
    </div>
  );
});

AppSidebarFooterStatus.displayName = 'AppSidebar.FooterStatus';
