import React, { useMemo } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusTimelineEvent {
  id: string;
  status: string;
  timestamp: string; // ISO date string
  actor?: string;
  description?: string;
}

/** Chronological timeline of status change events with duration indicators.
 * @example
 * ```tsx
 * <StatusTimeline />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/status-timeline)
 */
export interface StatusTimelineProps extends AccessControlledProps {
  /** Ordered list of status events to display */
  events: StatusTimelineEvent[];
  /** Layout direction of the timeline */
  orientation?: 'horizontal' | 'vertical';
  /** Hide actor names, descriptions, and duration labels */
  compact?: boolean;
  /** Custom color mapping from status string to hex color */
  statusColors?: Record<string, string>;
  /** Called when a timeline event card is clicked */
  onEventClick?: (eventId: string) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS: Record<string, string> = {
  created: 'var(--action-primary)',
  pending: 'var(--state-warning-text)',
  'in-progress': 'var(--state-info-text)',
  'in-review': 'var(--chart-purple)',
  approved: 'var(--state-success-text)',
  rejected: 'var(--state-error-text)',
  completed: 'var(--state-success-text)',
  cancelled: 'var(--text-secondary)',
  error: 'var(--state-error-text)',
};

function resolveColor(status: string, custom?: Record<string, string>): string {
  if (custom?.[status]) return custom[status];
  const lower = status.toLowerCase();
  return DEFAULT_COLORS[lower] ?? 'var(--border-strong)';
}

// ---------------------------------------------------------------------------
// Duration helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  if (hours < 24) return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return remainHours > 0 ? `${days}d ${remainHours}h` : `${days}d`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EventDot({
  color,
  compact,
  active,
}: {
  color: string;
  compact: boolean;
  active: boolean;
}) {
  const size = compact ? 10 : 14;
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded-full border-2 border-surface-default shadow-xs',
        active && 'ring-2 ring-offset-1',
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        ['--tw-ring-color' as string]: color,
      }}
    />
  );
}

function ConnectorLine({
  orientation,
  duration,
  compact,
}: {
  orientation: 'horizontal' | 'vertical';
  duration: number | null;
  compact: boolean;
}) {
  const isH = orientation === 'horizontal';
  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        isH ? 'mx-1 h-0.5 min-w-[40px] flex-1' : 'my-1 w-0.5 min-h-[24px]',
      )}
      style={{ backgroundColor: 'var(--border-default)' }}
    >
      {duration !== null && !compact && (
        <span
          className={cn(
            'absolute whitespace-nowrap rounded-xs bg-surface-muted px-1 py-0.5 text-[10px] text-text-secondary',
            isH ? '-top-4' : '-left-12',
          )}
        >
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function EventCard({
  event,
  color,
  compact,
  orientation,
  disabled,
  onClick,
}: {
  event: StatusTimelineEvent;
  color: string;
  compact: boolean;
  orientation: 'horizontal' | 'vertical';
  disabled: boolean;
  onClick?: () => void;
}) {
  const isH = orientation === 'horizontal';

  return (
    <div
      className={cn(
        'flex items-start gap-2',
        isH ? 'flex-col items-center text-center' : 'flex-row',
        !disabled && onClick && 'cursor-pointer',
      )}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled) onClick();
      }}
    >
      <EventDot color={color} compact={compact} active={false} />

      <div className={cn('flex flex-col', isH && 'items-center')}>
        {/* Status badge */}
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-text-inverse"
          style={{ backgroundColor: color }}
        >
          {event.status}
        </span>

        {/* Timestamp */}
        <span className="mt-0.5 text-[10px] text-text-secondary">
          {formatTimestamp(event.timestamp)}
        </span>

        {!compact && (
          <>
            {/* Actor */}
            {event.actor && (
              <span className="mt-0.5 text-xs font-medium text-text-primary">{event.actor}</span>
            )}

            {/* Description */}
            {event.description && (
              <span className="mt-0.5 max-w-[160px] text-[11px] leading-snug text-text-secondary">
                {event.description}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusTimeline component
// ---------------------------------------------------------------------------

/** Chronological timeline of status change events with duration indicators. */
export function StatusTimeline({
  events,
  orientation = 'vertical',
  compact = false,
  statusColors,
  onEventClick,
  access,
  accessReason,
  className,
}: StatusTimelineProps) {
  const { state, isHidden, isDisabled } = resolveAccessState(access);

  const durations = useMemo(() => {
    const result: (number | null)[] = [];
    for (let i = 0; i < events.length - 1; i++) {
      try {
        const a = new Date(events[i].timestamp).getTime();
        const b = new Date(events[i + 1].timestamp).getTime();
        result.push(Math.abs(b - a));
      } catch {
        result.push(null);
      }
    }
    return result;
  }, [events]);

  if (isHidden) return null;

  const isH = orientation === 'horizontal';

  return (
    <div
      className={cn(
        'rounded-lg border border-border-default bg-[var(--surface-primary)] p-4',
        accessStyles(state),
        className,
      )}
      data-access-state={state}
      role="group"
      aria-label="Status timeline"
      title={accessReason}
    >
      <div className={cn('flex', isH ? 'flex-row items-start overflow-x-auto' : 'flex-col')}>
        {events.map((event, i) => (
          <React.Fragment key={event.id}>
            <EventCard
              event={event}
              color={resolveColor(event.status, statusColors)}
              compact={compact}
              orientation={orientation}
              disabled={isDisabled}
              onClick={onEventClick ? () => onEventClick(event.id) : undefined}
            />
            {i < events.length - 1 && (
              <ConnectorLine orientation={orientation} duration={durations[i]} compact={compact} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

StatusTimeline.displayName = 'StatusTimeline';
