import React from 'react';
import {
  resolveAccessState,
  _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
} from '../../internal/access-controller';
import {
  NotificationItemCard,
  type NotificationItemCardProps,
  type NotificationSurfaceItem,
} from './NotificationItemCard';

/* ------------------------------------------------------------------ */
/*  NotificationPanel                                                   */
/* ------------------------------------------------------------------ */

export type NotificationPanelFilter = 'all' | 'unread' | 'high-priority' | 'pinned';
export type NotificationPanelGrouping = 'none' | 'priority';
export type NotificationPanelDateGrouping = 'none' | 'relative-day';

type NotificationPanelSectionKey = 'pinned' | 'high-priority' | 'other';
type NotificationPanelDateSectionKey = 'today' | 'yesterday' | 'older';

type NotificationPanelSection = {
  key: string;
  label: React.ReactNode;
  items: NotificationSurfaceItem[];
};

/**
 * NotificationPanel renders a filterable, groupable list of notifications
 * with bulk actions and optional multi-select support.
 * @example
 * ```tsx
 * <NotificationPanel />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/notification-panel)

 */
export interface NotificationPanelProps extends AccessControlledProps {
  /** Array of notification items to display. */
  items: NotificationSurfaceItem[];
  /** Panel heading text. */
  title?: React.ReactNode;
  /** Summary line shown below the title (e.g. unread count). */
  summaryLabel?: React.ReactNode;
  /** Title shown when the items array is empty. */
  emptyTitle?: React.ReactNode;
  /** Description shown in the empty state. */
  emptyDescription?: string;
  /** Title shown when no items match the active filter. */
  filteredEmptyTitle?: React.ReactNode;
  /** Additional CSS class name. */
  className?: string;
  /** Label for the "mark all as read" button. */
  markAllReadLabel?: string;
  /** Label for the "clear" button. */
  clearLabel?: string;
  /** Label for the per-item remove action. */
  removeLabel?: string;
  /** Custom element rendered in the header actions area. */
  headerAccessory?: React.ReactNode;
  /**
   * Custom element rendered as its own row directly below the header
   * (e.g. a tab switcher / segmented control). Distinct from
   * {@code headerAccessory} so the tab strip never has to share the
   * single header row with action buttons + close affordance —
   * preventing horizontal overflow on narrow drawer widths where the
   * combined content otherwise pushes the tab strip off-screen.
   */
  tabBar?: React.ReactNode;
  /**
   * Custom element rendered below the notification list, inside the
   * scroll container (e.g. a "load more" button for paginated
   * surfaces). Only shown when {@code items.length > 0}.
   */
  listFooter?: React.ReactNode;
  /** Returns a label for each item's primary action button. */
  getPrimaryActionLabel?: NotificationItemCardProps['getPrimaryActionLabel'];
  /** Callback fired when a notification's primary action is triggered. */
  onPrimaryAction?: NotificationItemCardProps['onPrimaryAction'];
  /** Callback fired when a single notification is removed. */
  onRemoveItem?: (id: string) => void;
  /** Callback fired when "mark all as read" is clicked. */
  onMarkAllRead?: () => void;
  /** Callback fired when "clear" is clicked. */
  onClear?: () => void;
  /** Custom timestamp formatter for notification cards. */
  formatTimestamp?: NotificationItemCardProps['formatTimestamp'];
  /** Whether to show the filter bar. @default false */
  showFilters?: boolean;
  /** Which filter options are available. */
  availableFilters?: NotificationPanelFilter[];
  /** Controlled active filter value. */
  activeFilter?: NotificationPanelFilter;
  /** Initial filter for uncontrolled mode. @default "all" */
  defaultFilter?: NotificationPanelFilter;
  /** Callback fired when the active filter changes. */
  onFilterChange?: (filter: NotificationPanelFilter) => void;
  /** Group items by priority. @default "none" */
  grouping?: NotificationPanelGrouping;
  /** Custom labels for each filter option. */
  filterLabels?: Partial<Record<NotificationPanelFilter, string>>;
  /** Custom labels for priority-based section headers. */
  sectionLabels?: Partial<Record<NotificationPanelSectionKey, React.ReactNode>>;
  /** Group items by relative date. @default "none" */
  dateGrouping?: NotificationPanelDateGrouping;
  /** Custom labels for date-based section headers. */
  dateSectionLabels?: Partial<Record<NotificationPanelDateSectionKey, React.ReactNode>>;
  /** Reference timestamp (epoch ms) used for date bucketing. @default Date.now() */
  dateGroupingReferenceTime?: number;
  /** Enable checkbox selection on notification items. @default false */
  selectable?: boolean;
  /** Controlled set of selected item IDs. */
  selectedIds?: string[];
  /** Initial selected IDs for uncontrolled mode. */
  defaultSelectedIds?: string[];
  /** Callback fired when the selected IDs change. */
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Label for the "select visible" toggle button. */
  selectVisibleLabel?: string;
  /** Label for the "clear selection" button. */
  clearSelectionLabel?: string;
  /** Label for the "mark selected as read" button. */
  markSelectedReadLabel?: string;
  /** Label for the "remove selected" button. */
  removeSelectedLabel?: string;
  /** Render function for the selection count badge. */
  selectionSummaryLabel?: (count: number) => React.ReactNode;
  /** Returns an accessible label for each selectable item's checkbox. */
  getSelectionLabel?: (item: NotificationSurfaceItem) => string;
  /** Callback fired when selected items are marked as read. */
  onMarkSelectedRead?: (ids: string[]) => void;
  /** Callback fired when selected items are removed. */
  onRemoveSelected?: (ids: string[]) => void;
}

const filterOrder: NotificationPanelFilter[] = ['all', 'unread', 'high-priority', 'pinned'];

const defaultFilterLabels: Record<NotificationPanelFilter, string> = {
  all: 'Tumu',
  unread: 'Okunmamis',
  'high-priority': 'Oncelikli',
  pinned: 'Pinlenmis',
};

const defaultSectionLabels: Record<NotificationPanelSectionKey, React.ReactNode> = {
  pinned: 'Pinlenmis',
  'high-priority': 'Yuksek oncelik',
  other: 'Diger bildirimler',
};

const defaultDateSectionLabels: Record<NotificationPanelDateSectionKey, React.ReactNode> = {
  today: 'Bugun',
  yesterday: 'Dun',
  older: 'Daha eski',
};

const notificationPanelSurfaceClassName =
  'relative overflow-hidden rounded-[30px] border border-border-subtle/80 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_34px_70px_-38px_var(--shadow-color)] backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent';

const notificationPanelEmptySurfaceClassName =
  'rounded-[24px] border border-border-subtle/75 bg-[var(--surface-card-alt)] shadow-[0_22px_46px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20';

const notificationPanelSectionLabelClassName =
  'inline-flex items-center rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-secondary shadow-[0_14px_30px_-24px_var(--shadow-color)] backdrop-blur-xs';

const countItems = (items: NotificationSurfaceItem[], filter: NotificationPanelFilter) =>
  items.filter((item) => matchesFilter(item, filter)).length;

function matchesFilter(item: NotificationSurfaceItem, filter: NotificationPanelFilter) {
  switch (filter) {
    case 'unread':
      return !item.read;
    case 'high-priority':
      return item.priority === 'high';
    case 'pinned':
      return item.pinned === true;
    case 'all':
    default:
      return true;
  }
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function resolveDateBucket(
  item: NotificationSurfaceItem,
  referenceTime: number,
): NotificationPanelDateSectionKey {
  if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)) {
    return 'older';
  }
  const diffDays = Math.floor(
    (startOfDay(referenceTime) - startOfDay(item.createdAt)) / 86_400_000,
  );
  if (diffDays <= 0) {
    return 'today';
  }
  if (diffDays === 1) {
    return 'yesterday';
  }
  return 'older';
}

function createBaseSections(
  items: NotificationSurfaceItem[],
  grouping: NotificationPanelGrouping,
  labels: Record<NotificationPanelSectionKey, React.ReactNode>,
): NotificationPanelSection[] {
  if (grouping === 'none') {
    return items.length > 0 ? [{ key: 'all', label: labels.other, items }] : [];
  }

  const pinned = items.filter((item) => item.pinned === true);
  const highPriority = items.filter(
    (item) => item.pinned !== true && (item.priority ?? 'normal') === 'high',
  );
  const other = items.filter(
    (item) => item.pinned !== true && (item.priority ?? 'normal') !== 'high',
  );

  return [
    pinned.length > 0 ? { key: 'pinned', label: labels.pinned, items: pinned } : null,
    highPriority.length > 0
      ? {
          key: 'high-priority',
          label: labels['high-priority'],
          items: highPriority,
        }
      : null,
    other.length > 0 ? { key: 'other', label: labels.other, items: other } : null,
  ].filter(Boolean) as NotificationPanelSection[];
}

function createSections(
  items: NotificationSurfaceItem[],
  grouping: NotificationPanelGrouping,
  dateGrouping: NotificationPanelDateGrouping,
  labels: Record<NotificationPanelSectionKey, React.ReactNode>,
  dateLabels: Record<NotificationPanelDateSectionKey, React.ReactNode>,
  referenceTime: number,
) {
  const baseSections = createBaseSections(items, grouping, labels);
  if (dateGrouping === 'none') {
    return baseSections;
  }

  const bucketOrder: NotificationPanelDateSectionKey[] = ['today', 'yesterday', 'older'];
  const sections: NotificationPanelSection[] = [];

  baseSections.forEach((section) => {
    bucketOrder.forEach((bucket) => {
      const bucketItems = section.items.filter(
        (item) => resolveDateBucket(item, referenceTime) === bucket,
      );
      if (bucketItems.length === 0) {
        return;
      }
      sections.push({
        key: `${section.key}-${bucket}`,
        label:
          grouping === 'none' ? (
            dateLabels[bucket]
          ) : (
            <>
              {section.label} · {dateLabels[bucket]}
            </>
          ),
        items: bucketItems,
      });
    });
  });

  return sections;
}

function normalizeSelectedIds(ids: string[], items: NotificationSurfaceItem[]) {
  const itemIds = new Set(items.map((item) => item.id));
  return ids.filter((id, index) => itemIds.has(id) && ids.indexOf(id) === index);
}

/* Lightweight inline button — avoids circular dependency on primitives */
const PanelButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary';
    btnSize?: 'sm';
  }
> = ({ variant = 'secondary', btnSize: _btnSize, className = '', ...rest }) => (
  <button
    {...rest}
    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
      variant === 'primary'
        ? 'border-action-primary bg-action-primary text-action-primary-text'
        : 'border-border-subtle/70 bg-[var(--surface-card)] text-text-secondary hover:bg-[var(--surface-card)] hover:text-text-primary'
    } ${className}`}
  />
);

export const NotificationPanel = React.forwardRef<HTMLDivElement, NotificationPanelProps>(
  (
    {
      items,
      title = 'Bildirimler',
      summaryLabel,
      emptyTitle = 'Su anda bildirim yok',
      emptyDescription = 'Yeni olaylar geldiginde burada gorunecek.',
      filteredEmptyTitle = 'Bu filtre icin bildirim yok',
      className = '',
      markAllReadLabel = 'Tumunu okundu say',
      clearLabel = 'Temizle',
      removeLabel = 'Bildirimi kapat',
      headerAccessory,
      tabBar,
      listFooter,
      getPrimaryActionLabel,
      onPrimaryAction,
      onRemoveItem,
      onMarkAllRead,
      onClear,
      formatTimestamp,
      showFilters = false,
      availableFilters = filterOrder,
      activeFilter,
      defaultFilter = 'all',
      onFilterChange,
      grouping = 'none',
      filterLabels,
      sectionLabels,
      dateGrouping = 'none',
      dateSectionLabels,
      dateGroupingReferenceTime,
      selectable = false,
      selectedIds,
      defaultSelectedIds = [],
      onSelectedIdsChange,
      selectVisibleLabel = 'Gorunenleri sec',
      clearSelectionLabel = 'Secimi temizle',
      markSelectedReadLabel = 'Secimi okundu say',
      removeSelectedLabel = 'Secilenleri sil',
      selectionSummaryLabel,
      getSelectionLabel,
      onMarkSelectedRead,
      onRemoveSelected,
      access = 'full',
      accessReason,
    },
    _ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) {
      return null;
    }

    const isFilterControlled = activeFilter !== undefined;
    const [internalFilter, setInternalFilter] =
      React.useState<NotificationPanelFilter>(defaultFilter);
    const resolvedFilter = isFilterControlled ? activeFilter : internalFilter;
    const isSelectionControlled = selectedIds !== undefined;
    const [internalSelectedIds, setInternalSelectedIds] =
      React.useState<string[]>(defaultSelectedIds);

    const unreadCount = items.filter((item) => !item.read).length;
    const resolvedSummaryLabel =
      summaryLabel ??
      (unreadCount > 0
        ? `${unreadCount} okunmamis, toplam ${items.length} olay`
        : `Son ${items.length} etkinlik listelenir`);
    const resolvedFilterLabels = {
      ...defaultFilterLabels,
      ...filterLabels,
    };
    const resolvedSectionLabels = {
      ...defaultSectionLabels,
      ...sectionLabels,
    };
    const resolvedDateSectionLabels = {
      ...defaultDateSectionLabels,
      ...dateSectionLabels,
    };
    const visibleFilters = filterOrder.filter((filter) => availableFilters.includes(filter));
    const filteredItems = items.filter((item) => matchesFilter(item, resolvedFilter));
    const resolvedSelectedIds = normalizeSelectedIds(
      isSelectionControlled ? (selectedIds ?? []) : internalSelectedIds,
      items,
    );
    const referenceTime = dateGroupingReferenceTime ?? Date.now();
    const sections = createSections(
      filteredItems,
      grouping,
      dateGrouping,
      resolvedSectionLabels,
      resolvedDateSectionLabels,
      referenceTime,
    );
    const visibleItemIds = filteredItems.map((item) => item.id);
    const selectedVisibleIds = visibleItemIds.filter((id) => resolvedSelectedIds.includes(id));
    const selectedCount = resolvedSelectedIds.length;
    const allVisibleSelected =
      visibleItemIds.length > 0 && selectedVisibleIds.length === visibleItemIds.length;
    const resolvedSelectionSummaryLabel =
      selectionSummaryLabel?.(selectedCount) ?? `${selectedCount} secili`;

    const actionState = accessState.isDisabled
      ? 'disabled'
      : accessState.isReadonly
        ? 'readonly'
        : accessState.state;
    const handleMarkAllRead = withAccessGuard<React.MouseEvent<HTMLButtonElement>>(
      actionState,
      () => onMarkAllRead?.(),
    );
    const handleClear = withAccessGuard<React.MouseEvent<HTMLButtonElement>>(actionState, () =>
      onClear?.(),
    );
    const handleMarkSelectedRead = withAccessGuard<React.MouseEvent<HTMLButtonElement>>(
      actionState,
      () => {
        if (selectedCount === 0) return;
        onMarkSelectedRead?.(resolvedSelectedIds);
        if (!isSelectionControlled) setInternalSelectedIds([]);
        onSelectedIdsChange?.([]);
      },
    );
    const handleRemoveSelected = withAccessGuard<React.MouseEvent<HTMLButtonElement>>(
      actionState,
      () => {
        if (selectedCount === 0) return;
        onRemoveSelected?.(resolvedSelectedIds);
        if (!isSelectionControlled) setInternalSelectedIds([]);
        onSelectedIdsChange?.([]);
      },
    );
    const handleFilterChange = (filter: NotificationPanelFilter) => {
      if (!isFilterControlled) setInternalFilter(filter);
      onFilterChange?.(filter);
    };
    const updateSelectedIds = (next: string[]) => {
      const normalized = normalizeSelectedIds(next, items);
      if (!isSelectionControlled) setInternalSelectedIds(normalized);
      onSelectedIdsChange?.(normalized);
    };
    const handleSelectedChange = (item: NotificationSurfaceItem, nextSelected: boolean) => {
      if (nextSelected) {
        updateSelectedIds([...resolvedSelectedIds, item.id]);
        return;
      }
      updateSelectedIds(resolvedSelectedIds.filter((id) => id !== item.id));
    };
    const toggleVisibleSelection = () => {
      if (allVisibleSelected) {
        updateSelectedIds(resolvedSelectedIds.filter((id) => !visibleItemIds.includes(id)));
        return;
      }
      updateSelectedIds([...resolvedSelectedIds, ...visibleItemIds]);
    };

    React.useEffect(() => {
      if (!isSelectionControlled) {
        setInternalSelectedIds((current) => normalizeSelectedIds(current, items));
      }
    }, [isSelectionControlled, items]);

    return (
      <section
        data-component="notification-panel"
        data-surface-appearance="premium"
        data-access-state={accessState.state}
        title={accessReason}
        className={`flex h-full min-h-[320px] w-full flex-col ${notificationPanelSurfaceClassName} ${className}`.trim()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle/75 bg-[var(--surface-card)] px-6 py-4 backdrop-blur-xs">
          <div className="min-w-0">
            <div className="text-base font-semibold tracking-[0.08em] text-text-primary">
              {title}
            </div>
            <div className="mt-1 text-xs text-text-subtle">{resolvedSummaryLabel}</div>
          </div>
          {onMarkAllRead ||
          onClear ||
          headerAccessory ||
          selectable ||
          onMarkSelectedRead ||
          onRemoveSelected ? (
            <div className="flex shrink-0 items-center gap-2">
              {onMarkAllRead ? (
                <PanelButton
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={items.length === 0 || accessState.isReadonly || accessState.isDisabled}
                >
                  {markAllReadLabel}
                </PanelButton>
              ) : null}
              {onClear ? (
                <PanelButton
                  type="button"
                  onClick={handleClear}
                  disabled={items.length === 0 || accessState.isReadonly || accessState.isDisabled}
                >
                  {clearLabel}
                </PanelButton>
              ) : null}
              {selectable && items.length > 0 ? (
                <PanelButton
                  type="button"
                  onClick={toggleVisibleSelection}
                  disabled={
                    accessState.isReadonly || accessState.isDisabled || visibleItemIds.length === 0
                  }
                >
                  {allVisibleSelected ? clearSelectionLabel : selectVisibleLabel}
                </PanelButton>
              ) : null}
              {onMarkSelectedRead ? (
                <PanelButton
                  type="button"
                  onClick={handleMarkSelectedRead}
                  disabled={selectedCount === 0 || accessState.isReadonly || accessState.isDisabled}
                >
                  {markSelectedReadLabel}
                </PanelButton>
              ) : null}
              {onRemoveSelected ? (
                <PanelButton
                  type="button"
                  onClick={handleRemoveSelected}
                  disabled={selectedCount === 0 || accessState.isReadonly || accessState.isDisabled}
                >
                  {removeSelectedLabel}
                </PanelButton>
              ) : null}
              {selectable && selectedCount > 0 ? (
                <div className="rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-3 py-1 text-[11px] font-medium text-text-subtle shadow-[0_14px_28px_-24px_var(--shadow-color)]">
                  {resolvedSelectionSummaryLabel}
                </div>
              ) : null}
              {headerAccessory}
            </div>
          ) : null}
        </header>

        {tabBar ? (
          <div
            data-component="notification-panel-tabbar"
            className="flex flex-wrap items-center gap-2 border-b border-border-subtle/75 bg-[var(--surface-card)] px-6 py-2 backdrop-blur-xs"
          >
            {tabBar}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {showFilters && visibleFilters.length > 0 && items.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {visibleFilters.map((filter) => {
                const label = `${resolvedFilterLabels[filter]} (${countItems(items, filter)})`;
                return (
                  <PanelButton
                    key={filter}
                    type="button"
                    variant={resolvedFilter === filter ? 'primary' : 'secondary'}
                    onClick={() => handleFilterChange(filter)}
                    disabled={accessState.isReadonly || accessState.isDisabled}
                  >
                    {label}
                  </PanelButton>
                );
              })}
            </div>
          ) : null}

          {items.length === 0 ? (
            <div
              className={`flex h-full flex-col items-center justify-center gap-2 border border-dashed border-border-subtle/80 p-6 text-center ${notificationPanelEmptySurfaceClassName}`}
            >
              <div className="text-sm font-semibold text-text-secondary">{emptyTitle}</div>
              {emptyDescription ? (
                <div className="text-xs text-text-subtle">{emptyDescription}</div>
              ) : null}
            </div>
          ) : filteredItems.length === 0 ? (
            <div
              className={`flex h-full flex-col items-center justify-center gap-2 border border-dashed border-border-subtle/80 p-6 text-center ${notificationPanelEmptySurfaceClassName}`}
            >
              <div className="text-sm font-semibold text-text-secondary">{filteredEmptyTitle}</div>
              {emptyDescription ? (
                <div className="text-xs text-text-subtle">{emptyDescription}</div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((section) => (
                <section key={section.key} className="flex flex-col gap-3">
                  {grouping !== 'none' || dateGrouping !== 'none' ? (
                    <div className={notificationPanelSectionLabelClassName}>{section.label}</div>
                  ) : null}
                  {section.items.map((item) => (
                    <NotificationItemCard
                      key={item.id}
                      item={item}
                      removeLabel={removeLabel}
                      getPrimaryActionLabel={getPrimaryActionLabel}
                      onPrimaryAction={onPrimaryAction}
                      onRemove={onRemoveItem}
                      formatTimestamp={formatTimestamp}
                      selectable={selectable}
                      selected={resolvedSelectedIds.includes(item.id)}
                      selectLabel={getSelectionLabel?.(item)}
                      onSelectedChange={handleSelectedChange}
                      access={access}
                      accessReason={accessReason}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
          {listFooter && items.length > 0 ? <div className="mt-4">{listFooter}</div> : null}
        </div>
      </section>
    );
  },
);

NotificationPanel.displayName = 'NotificationPanel';

export default NotificationPanel;
