import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'action';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: string; // ISO date
  read?: boolean;
  actionLabel?: string;
  actionPayload?: unknown;
}

export interface NotificationCenterLocaleText {
  title?: string;
  markAllRead?: string;
  noNotifications?: string;
  showMore?: (count: number) => string;
  showLess?: string;
  groupInfo?: string;
  groupSuccess?: string;
  groupWarning?: string;
  groupError?: string;
  groupAction?: string;
  justNow?: string;
  minutesAgo?: (n: number) => string;
  hoursAgo?: (n: number) => string;
  daysAgo?: (n: number) => string;
  weeksAgo?: (n: number) => string;
  monthsAgo?: (n: number) => string;
}

/** Notification feed with unread badges, grouping, dismissal, and action support. */
export interface NotificationCenterProps extends AccessControlledProps {
  /** List of notification items to display */
  notifications: NotificationItem[];
  /** Header title for the notification panel */
  title?: string;
  /** Group notifications by their type (action, error, warning, etc.) */
  groupByType?: boolean;
  /** Maximum number of notifications shown before "show more" appears */
  maxVisible?: number;
  /** Called when the "mark all read" button is clicked */
  onMarkAllRead?: () => void;
  /** Called when an individual notification is dismissed */
  onDismiss?: (id: string) => void;
  /** Called when an action-type notification's action button is clicked */
  onAction?: (id: string, payload: unknown) => void;
  /** Called when a notification row is clicked */
  onNotificationClick?: (id: string) => void;
  /** Localized labels — Turkish defaults are used when omitted */
  localeText?: NotificationCenterLocaleText;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<NotificationType, { path: string; color: string }> = {
  info: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    color: 'var(--state-info-text)',
  },
  success: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.5L6 12l1.4-1.4 3.1 3.1 6.1-6.1L18 9l-7.5 7.5z',
    color: 'var(--state-success-text)',
  },
  warning: {
    path: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
    color: 'var(--state-warning-text)',
  },
  error: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    color: 'var(--state-error-text)',
  },
  action: {
    path: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    color: 'var(--action-primary)',
  },
};

function TypeIcon({ type }: { type: NotificationType }) {
  const { path, color } = TYPE_ICONS[type];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color} className="shrink-0 mt-0.5">
      <path d={path} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relativeTime(iso: string, lt?: NotificationCenterLocaleText): string {
  try {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return lt?.justNow ?? 'az \u00f6nce';
    const minutes = Math.floor(diffSec / 60);
    if (minutes < 60) return lt?.minutesAgo?.(minutes) ?? `${minutes} dakika \u00f6nce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return lt?.hoursAgo?.(hours) ?? `${hours} saat \u00f6nce`;
    const days = Math.floor(hours / 24);
    if (days < 7) return lt?.daysAgo?.(days) ?? `${days} g\u00fcn \u00f6nce`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return lt?.weeksAgo?.(weeks) ?? `${weeks} hafta \u00f6nce`;
    const months = Math.floor(days / 30);
    return lt?.monthsAgo?.(months) ?? `${months} ay \u00f6nce`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Group labels
// ---------------------------------------------------------------------------

const DEFAULT_GROUP_LABELS: Record<NotificationType, string> = {
  info: 'Bilgilendirme',
  success: 'Başarılı',
  warning: 'Uyarı',
  error: 'Hata',
  action: 'Eylem Gerekli',
};

const GROUP_ORDER: NotificationType[] = ['action', 'error', 'warning', 'success', 'info'];

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------

function NotificationRow({
  item,
  disabled,
  onDismiss,
  onAction,
  onClick,
  localeText,
}: {
  item: NotificationItem;
  disabled: boolean;
  onDismiss?: (id: string) => void;
  onAction?: (id: string, payload: unknown) => void;
  onClick?: (id: string) => void;
  localeText?: NotificationCenterLocaleText;
}) {
  const isUnread = !item.read;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors',
        isUnread && 'border-l-[3px] bg-surface-muted',
        !isUnread && 'border-l-[3px] border-l-transparent',
        !disabled && onClick && 'cursor-pointer hover:bg-surface-muted',
      )}
      style={isUnread ? { borderLeftColor: TYPE_ICONS[item.type].color } : undefined}
      onClick={disabled ? undefined : () => onClick?.(item.id)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled) onClick(item.id);
      }}
    >
      <TypeIcon type={item.type} />

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm leading-snug',
            isUnread ? 'font-semibold text-text-primary' : 'text-text-primary',
          )}
        >
          {item.title}
        </p>
        {item.message && (
          <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">{item.message}</p>
        )}
        <span className="mt-1 block text-[10px] text-text-secondary">
          {relativeTime(item.timestamp, localeText)}
        </span>

        {item.type === 'action' && item.actionLabel && onAction && (
          <button
            type="button"
            className="mt-1.5 inline-flex items-center rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-text-primary hover:bg-border-default transition-colors disabled:opacity-50"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onAction(item.id, item.actionPayload);
            }}
          >
            {item.actionLabel}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          type="button"
          className="invisible group-hover:visible absolute top-2 right-2 rounded-xs p-0.5 text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors disabled:opacity-50"
          disabled={disabled}
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(item.id);
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationCenter component
// ---------------------------------------------------------------------------

/**
 * Notification feed with unread badges, grouping, dismissal, and action support.
 *
 * @example
 * ```tsx
 * <NotificationCenter
 *   notifications={[
 *     { id: '1', type: 'info', title: 'New update', timestamp: new Date().toISOString() },
 *   ]}
 *   onMarkAllRead={handleMarkAllRead}
 *   onDismiss={(id) => removeNotification(id)}
 * />
 * ```
 */
export function NotificationCenter({
  notifications,
  title,
  groupByType = false,
  maxVisible = 10,
  onMarkAllRead,
  onDismiss,
  onAction,
  onNotificationClick,
  localeText,
  access,
  accessReason,
  className,
}: NotificationCenterProps) {
  const { state, isHidden, isDisabled } = resolveAccessState(access);
  const [expanded, setExpanded] = useState(false);

  // Resolve locale labels with Turkish defaults
  const resolvedTitle = title ?? localeText?.title ?? 'Bildirimler';
  const groupLabels: Record<NotificationType, string> = {
    info: localeText?.groupInfo ?? DEFAULT_GROUP_LABELS.info,
    success: localeText?.groupSuccess ?? DEFAULT_GROUP_LABELS.success,
    warning: localeText?.groupWarning ?? DEFAULT_GROUP_LABELS.warning,
    error: localeText?.groupError ?? DEFAULT_GROUP_LABELS.error,
    action: localeText?.groupAction ?? DEFAULT_GROUP_LABELS.action,
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const visibleItems = expanded ? notifications : notifications.slice(0, maxVisible);
  const hiddenCount = notifications.length - maxVisible;

  const grouped = useMemo(() => {
    if (!groupByType) return null;
    const map = new Map<NotificationType, NotificationItem[]>();
    for (const item of visibleItems) {
      if (!map.has(item.type)) map.set(item.type, []);
      map.get(item.type)!.push(item);
    }
    return map;
  }, [groupByType, visibleItems]);

  const handleToggleExpand = useCallback(() => setExpanded((p) => !p), []);

  if (isHidden) return null;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border-default bg-[var(--surface-primary)] shadow-xs',
        accessStyles(state),
        className,
      )}
      data-access-state={state}
      role="region"
      aria-label={resolvedTitle}
      title={accessReason}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{resolvedTitle}</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-state-danger-text px-1.5 py-0.5 text-[10px] font-bold text-text-inverse min-w-[20px]">
              {unreadCount}
            </span>
          )}
        </div>
        {onMarkAllRead && unreadCount > 0 && (
          <button
            type="button"
            className="text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            disabled={isDisabled}
            onClick={onMarkAllRead}
          >
            {localeText?.markAllRead ?? 'Tümünü okundu işaretle'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-secondary">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mb-2 opacity-40"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-sm">{localeText?.noNotifications ?? 'Bildirim yok'}</span>
          </div>
        ) : grouped ? (
          /* Grouped view */
          GROUP_ORDER.filter((t) => grouped.has(t)).map((type) => (
            <div key={type}>
              <div className="sticky top-0 bg-[var(--surface-primary)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {groupLabels[type]}
              </div>
              {grouped.get(type)!.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  disabled={isDisabled}
                  onDismiss={onDismiss}
                  onAction={onAction}
                  onClick={onNotificationClick}
                  localeText={localeText}
                />
              ))}
            </div>
          ))
        ) : (
          /* Flat view */
          visibleItems.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              disabled={isDisabled}
              onDismiss={onDismiss}
              onAction={onAction}
              onClick={onNotificationClick}
              localeText={localeText}
            />
          ))
        )}
      </div>

      {/* Show more */}
      {!expanded && hiddenCount > 0 && (
        <div className="border-t border-border-default px-4 py-2 text-center">
          <button
            type="button"
            className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            onClick={handleToggleExpand}
          >
            {localeText?.showMore?.(hiddenCount) ?? `+${hiddenCount} daha göster`}
          </button>
        </div>
      )}
      {expanded && hiddenCount > 0 && (
        <div className="border-t border-border-default px-4 py-2 text-center">
          <button
            type="button"
            className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            onClick={handleToggleExpand}
          >
            {localeText?.showLess ?? 'Daha az göster'}
          </button>
        </div>
      )}
    </div>
  );
}

NotificationCenter.displayName = 'NotificationCenter';
