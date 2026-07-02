import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  StatusIndicator — Online / offline / busy status dot with label    */
/* ------------------------------------------------------------------ */

export type StatusIndicatorStatus = 'online' | 'offline' | 'busy' | 'away' | 'unknown';

export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Status value controlling dot color. @default "online" */
  status?: StatusIndicatorStatus;
  /** Dot size. @default "md" */
  size?: StatusIndicatorSize;
  /** Optional text label beside the dot. */
  label?: string;
  /** Show text label. When false, only the dot renders. @default true */
  showLabel?: boolean;
  /** Animate a pulse ring on the dot. @default false */
  pulse?: boolean;
}

const statusStyles: Record<StatusIndicatorStatus, string> = {
  online: 'bg-state-success-text',
  offline: 'bg-border-subtle',
  busy: 'bg-state-danger-text',
  away: 'bg-state-warning-text',
  unknown: 'bg-text-secondary',
};

const sizeStyles: Record<StatusIndicatorSize, string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

const labelSizeStyles: Record<StatusIndicatorSize, string> = {
  sm: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
};

/**
 * StatusIndicator renders a colored dot representing connection or
 * availability status, with an optional text label.
 *
 * @example
 * ```tsx
 * <StatusIndicator status="online" label="Online" />
 * <StatusIndicator status="offline" showLabel={false} />
 * ```
 */
export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  function StatusIndicator(
    { status = 'online', size = 'md', label, showLabel = true, pulse = false, className, ...rest },
    ref,
  ) {
    const dotClass = cn(
      'inline-block shrink-0 rounded-full',
      statusStyles[status],
      sizeStyles[size],
    );

    const resolvedLabel = label ?? status;

    return (
      <span
        ref={ref}
        {...stateAttrs({ component: 'status-indicator' })}
        data-status={status}
        className={cn(
          'inline-flex items-center gap-2 font-semibold text-text-secondary',
          labelSizeStyles[size],
          className,
        )}
        {...rest}
      >
        <span className="relative inline-flex">
          <span className={dotClass} aria-hidden />
          {pulse && status === 'online' && (
            <span
              className={cn(
                'absolute inset-0 animate-ping rounded-full opacity-75',
                statusStyles[status],
              )}
              aria-hidden
            />
          )}
        </span>
        {showLabel && <span>{resolvedLabel}</span>}
        {!showLabel && <span className="sr-only">{resolvedLabel}</span>}
      </span>
    );
  },
);

StatusIndicator.displayName = 'StatusIndicator';
