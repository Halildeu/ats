import React, { useMemo, useState, useCallback } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single activity entry in the feed.
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/activity-feed)
 */
export interface ActivityItem {
  /** Unique identifier */
  id: string;
  /** Activity type determines icon and color */
  type: 'create' | 'update' | 'delete' | 'comment' | 'approve' | 'assign' | 'complete' | 'alert';
  /** Actor who performed the activity */
  actor: { name: string; avatar?: string };
  /** Target of the activity (e.g., document name) */
  target?: string;
  /** Human-readable description */
  description: string;
  /** ISO timestamp string */
  timestamp: string;
  /** Arbitrary extra data */
  metadata?: Record<string, unknown>;
}

/**
 * Props for the ActivityFeed component.
 *
 * @example
 * ```tsx
 * <ActivityFeed
 *   items={[
 *     { id: '1', type: 'create', actor: { name: 'Ali' }, description: 'Created document', timestamp: '2025-03-20T10:00:00Z' },
 *   ]}
 *   groupByDate
 * />
 * ```
 *
 * @since 1.0.0
 * @see ActivityItem
 */
export interface ActivityFeedProps extends AccessControlledProps {
  /** Activity items to display */
  items: ActivityItem[];
  /** Callback when an item is clicked */
  onItemClick?: (item: ActivityItem) => void;
  /** Maximum number of items initially visible (default: all) */
  maxVisible?: number;
  /** Show "Load More" button when items exceed maxVisible */
  showLoadMore?: boolean;
  /** Callback for loading more items */
  onLoadMore?: () => void;
  /** Group items by date (default: false) */
  groupByDate?: boolean;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<ActivityItem['type'], { icon: string; color: string; bgColor: string }> =
  {
    create: { icon: '+', color: 'var(--state-success-text)', bgColor: 'var(--state-success-bg)' },
    update: { icon: '~', color: 'var(--state-info-text)', bgColor: 'var(--state-info-bg)' },
    delete: { icon: '-', color: 'var(--state-error-text)', bgColor: 'var(--state-error-bg)' },
    comment: { icon: '\u2709', color: 'var(--text-secondary)', bgColor: 'var(--surface-muted)' },
    approve: {
      icon: '\u2713',
      color: 'var(--state-success-text)',
      bgColor: 'var(--state-success-bg)',
    },
    assign: {
      icon: '\u2192',
      color: 'var(--state-warning-text)',
      bgColor: 'var(--state-warning-bg)',
    },
    complete: {
      icon: '\u2714',
      color: 'var(--state-success-text)',
      bgColor: 'var(--state-success-bg)',
    },
    alert: { icon: '!', color: 'var(--state-error-text)', bgColor: 'var(--state-error-bg)' },
  };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return 'az once';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk once`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat once`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} gun once`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} ay once`;
}

function formatDateGroup(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Bugun';
  if (diffDays === 1) return 'Dun';
  if (diffDays < 7) return `${diffDays} gun once`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupItemsByDate(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const map = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const key = formatDateGroup(item.timestamp);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ActivityAvatarProps {
  name: string;
  avatar?: string;
}

const ActivityAvatar: React.FC<ActivityAvatarProps> = ({ name, avatar }) => {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: 32, height: 32 }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-semibold"
      style={{
        width: 32,
        height: 32,
        backgroundColor: 'var(--surface-muted)',
        color: 'var(--text-secondary)',
      }}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
};

interface ActivityRowProps {
  item: ActivityItem;
  isLast: boolean;
  canInteract: boolean;
  onItemClick?: (item: ActivityItem) => void;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ item, isLast, canInteract, onItemClick }) => {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.update;
  const isClickable = canInteract && !!onItemClick;

  const handleClick = useCallback(() => {
    if (isClickable) onItemClick!(item);
  }, [isClickable, onItemClick, item]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onItemClick!(item);
      }
    },
    [isClickable, onItemClick, item],
  );

  return (
    <div
      className={cn(
        'relative flex gap-3 py-3 px-2 rounded-md',
        isClickable && 'cursor-pointer hover:bg-[var(--surface-hover)]',
        'transition-colors',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isClickable ? 0 : undefined}
      role={isClickable ? 'button' : 'listitem'}
      aria-label={`${item.actor.name}: ${item.description}`}
      data-activity-id={item.id}
      data-activity-type={item.type}
    >
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-[17px] top-[44px] bottom-0 w-0.5"
          style={{ backgroundColor: 'var(--border-subtle)' }}
          aria-hidden="true"
        />
      )}

      {/* Type icon badge */}
      <div className="relative shrink-0">
        <ActivityAvatar name={item.actor.name} avatar={item.actor.avatar} />
        <div
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold border-2 border-[var(--surface-default)]"
          style={{ backgroundColor: config.bgColor, color: config.color }}
          aria-hidden="true"
        >
          {config.icon}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {item.actor.name}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">{item.description}</span>
          {item.target && (
            <span className="text-sm font-medium text-[var(--text-accent)]">{item.target}</span>
          )}
        </div>
        <span className="text-xs text-[var(--text-tertiary)] mt-0.5 block">
          {relativeTime(item.timestamp)}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Social-style activity stream displaying chronological events with
 * type-based icons, actor avatars, relative timestamps, and optional
 * date grouping. Supports pagination via "Load More" button.
 *
 * @example
 * ```tsx
 * <ActivityFeed
 *   items={activityData}
 *   groupByDate
 *   maxVisible={10}
 *   showLoadMore
 *   onLoadMore={() => fetchMore()}
 *   onItemClick={(item) => navigate(`/activity/${item.id}`)}
 * />
 * ```
 *
 * @since 1.0.0
 * @see ActivityItem
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  items,
  onItemClick,
  maxVisible,
  showLoadMore = false,
  onLoadMore,
  groupByDate = false,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const canInteract = !accessState.isDisabled && !accessState.isReadonly;
  const [expanded, setExpanded] = useState(false);

  const visibleItems = useMemo(() => {
    if (!maxVisible || expanded) return items;
    return items.slice(0, maxVisible);
  }, [items, maxVisible, expanded]);

  const hasMore = maxVisible ? items.length > maxVisible && !expanded : false;

  const handleLoadMore = useCallback(() => {
    if (onLoadMore) {
      onLoadMore();
    } else {
      setExpanded(true);
    }
  }, [onLoadMore]);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'p-6 text-center text-sm text-[var(--text-tertiary)]',
          'border border-[var(--border-default)] rounded-lg',
          className,
        )}
        data-component="activity-feed"
      >
        Henuz aktivite yok
      </div>
    );
  }

  const renderItems = (list: ActivityItem[]) =>
    list.map((item, idx) => (
      <ActivityRow
        key={item.id}
        item={item}
        isLast={idx === list.length - 1}
        canInteract={canInteract}
        onItemClick={onItemClick}
      />
    ));

  const dateGroups = useMemo(() => {
    if (!groupByDate) return null;
    return groupItemsByDate(visibleItems);
  }, [groupByDate, visibleItems]);

  return (
    <div
      className={cn(
        'border border-[var(--border-default)] rounded-lg',
        'bg-[var(--surface-default)] p-4',
        accessStyles(accessState.state),
        className,
      )}
      data-component="activity-feed"
      data-access-state={accessState.state}
      {...(accessState.isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
      role="feed"
      aria-label={`Activity feed (${items.length} items)`}
    >
      {groupByDate && dateGroups ? (
        Array.from(dateGroups.entries()).map(([dateLabel, groupItems]) => (
          <div key={dateLabel} className="mb-4 last:mb-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {dateLabel}
              </span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </div>
            {renderItems(groupItems)}
          </div>
        ))
      ) : (
        <div>{renderItems(visibleItems)}</div>
      )}

      {/* Load more */}
      {(hasMore || (showLoadMore && onLoadMore)) && canInteract && (
        <div className="mt-3 pt-3 border-t border-[var(--border-subtle)] text-center">
          <button
            type="button"
            className={cn(
              'px-4 py-1.5 text-xs font-medium rounded-md',
              'text-[var(--text-accent)]',
              'hover:bg-[var(--surface-hover)] transition-colors',
            )}
            onClick={handleLoadMore}
            aria-label="Load more activities"
          >
            Daha fazla goster
          </button>
        </div>
      )}
    </div>
  );
};

ActivityFeed.displayName = 'ActivityFeed';
export default ActivityFeed;
