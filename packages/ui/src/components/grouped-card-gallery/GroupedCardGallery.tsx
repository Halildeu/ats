import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { GallerySearchBar } from './GallerySearchBar';
import { GalleryGroup } from './GalleryGroup';
import { GalleryCard } from './GalleryCard';
import type { GalleryItem, GroupedCardGalleryProps, GalleryColumns } from './types';

/* ------------------------------------------------------------------ */
/*  GroupedCardGallery — Collapse/expand grouped card gallery           */
/* ------------------------------------------------------------------ */

const DEFAULT_COLUMNS: GalleryColumns = { sm: 1, md: 2, lg: 3, xl: 4 };
const DEFAULT_SEARCH_FIELDS = ['title', 'description', 'tags'] as const;
const DEBOUNCE_MS = 300;

/* -- Helpers -------------------------------------------------------- */

function groupItems<T extends GalleryItem>(items: T[], groupBy: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = String((item as Record<string, unknown>)[groupBy] ?? 'Other');
    const list = map.get(key);
    if (list) {
      list.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

function matchItem<T extends GalleryItem>(item: T, query: string, fields: string[]): boolean {
  const lower = query.toLowerCase();
  for (const field of fields) {
    const val = (item as Record<string, unknown>)[field];
    if (typeof val === 'string' && val.toLowerCase().includes(lower)) {
      return true;
    }
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === 'string' && v.toLowerCase().includes(lower)) {
          return true;
        }
      }
    }
  }
  return false;
}

function sortGroups(
  keys: string[],
  order?: string[] | ((a: string, b: string) => number),
): string[] {
  if (!order) return keys.sort();
  if (typeof order === 'function') return keys.sort(order);
  // Array order: listed groups first in given order, rest alphabetical
  const orderMap = new Map(order.map((k, i) => [k, i]));
  return keys.sort((a, b) => {
    const ia = orderMap.get(a) ?? Infinity;
    const ib = orderMap.get(b) ?? Infinity;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

function gridColsClass(columns: GalleryColumns): string {
  const sm = columns.sm ?? 1;
  const md = columns.md ?? 2;
  const lg = columns.lg ?? 3;
  const xl = columns.xl ?? 4;
  // Tailwind safelist: grid-cols-1..4 sm:grid-cols-1..4 lg:grid-cols-1..4 xl:grid-cols-1..4
  return `grid-cols-${sm} sm:grid-cols-${md} lg:grid-cols-${lg} xl:grid-cols-${xl}`;
}

/* -- localStorage helpers ------------------------------------------ */

function loadExpanded(key: string | undefined): Set<string> | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    // corrupt — ignore
  }
  return null;
}

function saveExpanded(key: string | undefined, expanded: Set<string>): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...expanded]));
  } catch {
    // quota exceeded — ignore
  }
}

/* -- Default empty state ------------------------------------------- */

const DefaultEmptyState: React.FC = () => (
  <div className="flex flex-col items-center gap-2 py-12 text-center">
    <svg className="h-10 w-10 text-text-secondary/40" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
    <p className="text-sm text-text-secondary">No results found.</p>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Grouped card gallery with search, collapse/expand, and responsive grid.
 *
 * Items are automatically grouped by the `groupBy` field and rendered
 * in collapsible sections. Supports localStorage-persisted expand state,
 * debounced search, and custom card rendering.
 *
 * @example
 * ```tsx
 * <GroupedCardGallery
 *   items={reports}
 *   groupBy="category"
 *   searchPlaceholder="Search reports..."
 *   defaultExpandedGroups={["HR", "Finance"]}
 *   onItemClick={(item) => navigate(item.route)}
 *   storageKey="reporting-hub-groups"
 * />
 * ```
 */
export const GroupedCardGallery = React.forwardRef<HTMLDivElement, GroupedCardGalleryProps>(
  <T extends GalleryItem>(
    {
      items: rawItems,
      groupBy = 'group' as keyof T & string,
      searchFields,
      searchPlaceholder = 'Search...',
      defaultExpandedGroups,
      groupOrder,
      onItemClick,
      renderCard,
      emptyState,
      summaryFormatter,
      storageKey,
      columns = DEFAULT_COLUMNS,
      className,
    }: GroupedCardGalleryProps<T>,
    ref: React.Ref<HTMLDivElement>,
  ) => {
    const items = Array.isArray(rawItems) ? rawItems : ([] as T[]);

    /* -- Search state (debounced) ---------------------------------- */
    const [inputValue, setInputValue] = useState('');
    const [query, setQuery] = useState('');

    useEffect(() => {
      const timer = setTimeout(() => setQuery(inputValue), DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }, [inputValue]);

    /* -- Grouped data ---------------------------------------------- */
    const grouped = useMemo(() => groupItems(items as GalleryItem[], groupBy), [items, groupBy]);
    const sortedGroupKeys = useMemo(
      () => sortGroups([...grouped.keys()], groupOrder),
      [grouped, groupOrder],
    );

    /* -- Expand/collapse state ------------------------------------- */
    const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
      const stored = loadExpanded(storageKey);
      if (stored) return stored;
      // Default: first 2 groups
      const defaultGroups = defaultExpandedGroups ?? sortedGroupKeys.slice(0, 2);
      return new Set(defaultGroups);
    });

    // Persist to localStorage on change
    useEffect(() => {
      if (!query) saveExpanded(storageKey, expandedSet);
    }, [expandedSet, storageKey, query]);

    const toggleGroup = useCallback((groupName: string) => {
      setExpandedSet((prev) => {
        const next = new Set(prev);
        if (next.has(groupName)) {
          next.delete(groupName);
        } else {
          next.add(groupName);
        }
        return next;
      });
    }, []);

    /* -- Filtered data --------------------------------------------- */
    const resolvedSearchFields = (searchFields ?? DEFAULT_SEARCH_FIELDS) as string[];

    const filteredGrouped = useMemo(() => {
      if (!query) return grouped;
      const result = new Map<string, GalleryItem[]>();
      for (const [group, groupItems] of grouped) {
        const matches = groupItems.filter((item) => matchItem(item, query, resolvedSearchFields));
        if (matches.length > 0) result.set(group, matches);
      }
      return result;
    }, [grouped, query, resolvedSearchFields]);

    const filteredKeys = useMemo(
      () => sortGroups([...filteredGrouped.keys()], groupOrder),
      [filteredGrouped, groupOrder],
    );

    const totalFiltered = useMemo(
      () => [...filteredGrouped.values()].reduce((sum, list) => sum + list.length, 0),
      [filteredGrouped],
    );

    /* -- Summary line ---------------------------------------------- */
    const summary = useMemo(() => {
      if (summaryFormatter) {
        const allFlat = [...grouped.values()].flat();
        const filteredFlat = [...filteredGrouped.values()].flat();
        return summaryFormatter(allFlat as T[], filteredFlat as T[]);
      }
      if (query) {
        return `${totalFiltered} / ${items.length} results`;
      }
      return `${items.length} items`;
    }, [summaryFormatter, grouped, filteredGrouped, query, totalFiltered, items.length]);

    /* -- Grid class ------------------------------------------------ */
    const gridClass = useMemo(() => gridColsClass(columns), [columns]);

    /* -- Render ---------------------------------------------------- */
    const isSearching = query.length > 0;
    const noResults = isSearching && filteredKeys.length === 0;

    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-4', className)}
        data-component="grouped-card-gallery"
      >
        {/* Search bar */}
        <GallerySearchBar
          value={inputValue}
          onChange={setInputValue}
          placeholder={searchPlaceholder}
          summary={summary}
        />

        {/* Empty state */}
        {noResults && (emptyState ?? <DefaultEmptyState />)}

        {/* Groups */}
        {filteredKeys.map((groupName) => {
          const groupItems = filteredGrouped.get(groupName) ?? [];
          const isExpanded = isSearching || expandedSet.has(groupName);

          return (
            <GalleryGroup
              key={groupName}
              name={groupName}
              count={groupItems.length}
              expanded={isExpanded}
              onToggle={() => toggleGroup(groupName)}
            >
              <div className={cn('grid gap-3', gridClass)}>
                {groupItems.map((item) =>
                  renderCard ? (
                    <React.Fragment key={item.id}>{renderCard(item as T)}</React.Fragment>
                  ) : (
                    <GalleryCard
                      key={item.id}
                      item={item}
                      onClick={onItemClick ? () => onItemClick(item as T) : undefined}
                    />
                  ),
                )}
              </div>
            </GalleryGroup>
          );
        })}
      </div>
    );
  },
) as (<T extends GalleryItem>(
  props: GroupedCardGalleryProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement | null) & { displayName?: string };

GroupedCardGallery.displayName = 'GroupedCardGallery';
