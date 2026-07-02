import React, { useCallback, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  shouldBlockInteraction,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Transfer — Dual-list selector for moving items between panels     */
/* ------------------------------------------------------------------ */

export type TransferItem = {
  key: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type TransferDirection = "left" | "right";

export type TransferLocaleText = {
  searchPlaceholder?: string;
  notFound?: string;
  selectAll?: string;
  deselectAll?: string;
  itemUnit?: string;
  itemsUnit?: string;
};

export type TransferSize = "sm" | "md" | "lg";

export interface TransferProps extends AccessControlledProps {
  /** All available items */
  dataSource: TransferItem[];
  /** Keys of items in the right (target) list */
  targetKeys?: string[];
  /** Default target keys (uncontrolled) */
  defaultTargetKeys?: string[];
  /** Filter/search enabled */
  searchable?: boolean;
  /** Custom filter function */
  filterOption?: (inputValue: string, item: TransferItem) => boolean;
  /** Titles for left/right panels */
  titles?: [string, string];
  /** Size variant */
  size?: TransferSize;
  /** Show select all checkbox */
  showSelectAll?: boolean;
  /** Custom item render */
  renderItem?: (item: TransferItem) => React.ReactNode;
  /** Locale text */
  localeText?: TransferLocaleText;
  /** Called when items are moved */
  onChange?: (
    targetKeys: string[],
    direction: TransferDirection,
    moveKeys: string[],
  ) => void;
  /** Called when search input changes */
  onSearch?: (direction: TransferDirection, value: string) => void;
  className?: string;
}

/* ---- Defaults ----
   */

const DEFAULT_TITLES: [string, string] = ["Kaynak", "Hedef"];

const DEFAULT_LOCALE: Required<TransferLocaleText> = {
  searchPlaceholder: "Ara...",
  notFound: "Sonuc bulunamadi",
  selectAll: "Tumunu sec",
  deselectAll: "Secimi kaldir",
  itemUnit: "oge",
  itemsUnit: "oge",
};

const defaultFilterOption = (inputValue: string, item: TransferItem) => {
  const query = inputValue.toLowerCase();
  return (
    item.label.toLowerCase().includes(query) ||
    (item.description?.toLowerCase().includes(query) ?? false)
  );
};

/* ---- Size maps ---- */

const panelSizeClass: Record<TransferSize, string> = {
  sm: "min-w-[200px] flex-1 min-h-[240px] max-h-[320px]",
  md: "min-w-[240px] flex-1 min-h-[300px] max-h-[420px]",
  lg: "min-w-[260px] flex-1 min-h-[360px] max-h-[520px]",
};

const headerSizeClass: Record<TransferSize, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-4 py-3 text-sm",
};

const itemSizeClass: Record<TransferSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2.5 text-sm",
};

const searchSizeClass: Record<TransferSize, string> = {
  sm: "h-7 text-xs px-2.5",
  md: "h-8 text-sm px-3",
  lg: "h-9 text-sm px-3.5",
};

/* ---- Styling constants ---- */

const panelSurface =
  "flex flex-col overflow-hidden rounded-2xl bg-[var(--surface-card)] shadow-[0_22px_48px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20 border border-border-subtle/80 backdrop-blur-xs";

/* ---- Icons ---- */

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M6 3l5 5-5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M10 3l-5 5 5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M11.5 11.5L14 14M1 7a6 6 0 1012 0A6 6 0 001 7z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  TransferPanel                                                      */
/* ------------------------------------------------------------------ */

interface TransferPanelProps {
  direction: TransferDirection;
  title: string;
  items: TransferItem[];
  selectedKeys: Set<string>;
  onSelectChange: (keys: Set<string>) => void;
  searchable: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterOption: (inputValue: string, item: TransferItem) => boolean;
  size: TransferSize;
  showSelectAll: boolean;
  renderItem?: (item: TransferItem) => React.ReactNode;
  locale: Required<TransferLocaleText>;
  blocked: boolean;
}

const TransferPanel: React.FC<TransferPanelProps> = ({
  direction,
  title,
  items,
  selectedKeys,
  onSelectChange,
  searchable,
  searchValue,
  onSearchChange,
  filterOption,
  size,
  showSelectAll,
  renderItem,
  locale,
  blocked,
}) => {
  const filteredItems = useMemo(() => {
    if (!searchValue) return items;
    return items.filter((item) => filterOption(searchValue, item));
  }, [items, searchValue, filterOption]);

  const enabledItems = useMemo(
    () => filteredItems.filter((i) => !i.disabled),
    [filteredItems],
  );

  const checkedCount = useMemo(
    () => enabledItems.filter((i) => selectedKeys.has(i.key)).length,
    [enabledItems, selectedKeys],
  );

  const allChecked = enabledItems.length > 0 && checkedCount === enabledItems.length;
  const indeterminate = checkedCount > 0 && checkedCount < enabledItems.length;

  const handleSelectAll = useCallback(() => {
    if (blocked) return;
    if (allChecked) {
      // Deselect all filtered enabled items
      const next = new Set(selectedKeys);
      for (const item of enabledItems) {
        next.delete(item.key);
      }
      onSelectChange(next);
    } else {
      // Select all filtered enabled items
      const next = new Set(selectedKeys);
      for (const item of enabledItems) {
        next.add(item.key);
      }
      onSelectChange(next);
    }
  }, [blocked, allChecked, selectedKeys, enabledItems, onSelectChange]);

  const handleItemToggle = useCallback(
    (key: string) => {
      if (blocked) return;
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectChange(next);
    },
    [blocked, selectedKeys, onSelectChange],
  );

  const unitLabel = items.length === 1 ? locale.itemUnit : locale.itemsUnit;

  return (
    <div
      className={cn(panelSurface, panelSizeClass[size])}
      data-testid={`transfer-panel-${direction}`}
      role="group"
      aria-label={title}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-border-subtle/60",
          "bg-surface-default",
          headerSizeClass[size],
        )}
      >
        <div className="flex items-center gap-2">
          {showSelectAll && (
            <label className="flex items-center" data-testid={`transfer-select-all-${direction}`}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = indeterminate;
                }}
                onChange={handleSelectAll}
                disabled={blocked || enabledItems.length === 0}
                className={cn(
                  "h-3.5 w-3.5 rounded-xs border-border-subtle text-action-primary",
                  "focus:ring-2 focus:ring-action-primary/20 focus:ring-offset-0",
                  "accent-action-primary",
                )}
                aria-label={allChecked ? locale.deselectAll : locale.selectAll}
              />
            </label>
          )}
          <span className="font-semibold text-text-primary tracking-[-0.01em]">
            {title}
          </span>
        </div>
        <span
          className="rounded-full border border-border-subtle/60 bg-[var(--surface-card)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-text-secondary shadow-[0_4px_8px_-6px_var(--shadow-color)]"
          data-testid={`transfer-count-${direction}`}
        >
          {checkedCount > 0
            ? `${checkedCount}/${items.length}`
            : `${items.length} ${unitLabel}`}
        </span>
      </div>

      {/* Search */}
      {searchable && (
        <div className="border-b border-border-subtle/40 px-2 py-1.5">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={locale.searchPlaceholder}
              disabled={blocked}
              className={cn(
                "w-full rounded-lg border border-border-subtle/60 ps-7",
                "bg-[var(--surface-canvas)] text-text-primary",
                "placeholder:text-[var(--text-disabled)]",
                "focus:border-action-primary focus:outline-hidden focus:ring-2 focus:ring-action-primary/20",
                "[&::-webkit-search-cancel-button]:hidden",
                searchSizeClass[size],
              )}
              data-testid={`transfer-search-${direction}`}
              aria-label={`${title} ${locale.searchPlaceholder}`}
            />
          </div>
        </div>
      )}

      {/* Item list */}
      <ul
        className="flex-1 overflow-y-auto"
        role="listbox"
        aria-multiselectable="true"
        aria-label={title}
        data-testid={`transfer-list-${direction}`}
      >
        {filteredItems.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled="true" className="flex items-center justify-center py-8 text-text-secondary">
            <span className={size === "sm" ? "text-xs" : "text-sm"}>
              {locale.notFound}
            </span>
          </li>
        ) : (
          filteredItems.map((item) => {
            const checked = selectedKeys.has(item.key);
            const itemBlocked = blocked || item.disabled;

            return (
              <li
                key={item.key}
                role="option"
                aria-selected={checked}
                aria-disabled={itemBlocked || undefined}
                data-testid={`transfer-item-${item.key}`}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 border-b border-border-subtle/20 transition-colors duration-(--motion-duration-fast) last:border-b-0",
                  itemSizeClass[size],
                  itemBlocked
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-[var(--action-primary-soft)]",
                  checked && !itemBlocked
                    ? "bg-[var(--action-primary-soft)]"
                    : "",
                )}
                onClick={() => {
                  if (!itemBlocked) handleItemToggle(item.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    if (!itemBlocked) handleItemToggle(item.key);
                  }
                }}
              >
                <span
                  role="presentation"
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border",
                    checked
                      ? "border-action-primary bg-action-primary text-text-inverse"
                      : "border-border-subtle bg-[var(--surface-canvas)]",
                    itemBlocked && "opacity-50",
                  )}
                >
                  {checked && (
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  {renderItem ? (
                    renderItem(item)
                  ) : (
                    <>
                      <div className="truncate font-medium text-text-primary">
                        {item.label}
                      </div>
                      {item.description && (
                        <div className="truncate text-text-secondary text-[0.8em] leading-snug">
                          {item.description}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Transfer                                                           */
/* ------------------------------------------------------------------ 
 * @example
 * ```tsx
 * <Transfer />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/transfer)
 */
export const Transfer = React.forwardRef<HTMLDivElement, TransferProps>(({
  dataSource,
  targetKeys: controlledTargetKeys,
  defaultTargetKeys,
  searchable = false,
  filterOption = defaultFilterOption,
  titles,
  size = "md",
  showSelectAll = true,
  renderItem,
  localeText,
  onChange,
  onSearch,
  className,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const blocked = shouldBlockInteraction(accessState.state);

  const locale: Required<TransferLocaleText> = {
    ...DEFAULT_LOCALE,
    ...localeText,
  };

  const resolvedTitles = titles ?? DEFAULT_TITLES;

  /* ---- Target keys (controlled / uncontrolled) ---- */

  const [internalTargetKeys, setInternalTargetKeys] = useState<string[]>(
    defaultTargetKeys ?? [],
  );

  const isControlled = controlledTargetKeys !== undefined;
  const targetKeySet = useMemo(
    () => new Set(isControlled ? controlledTargetKeys : internalTargetKeys),
    [isControlled, controlledTargetKeys, internalTargetKeys],
  );

  /* ---- Selection state ---- */

  const [leftSelected, setLeftSelected] = useState<Set<string>>(new Set());
  const [rightSelected, setRightSelected] = useState<Set<string>>(new Set());

  /* ---- Search state ---- */

  const [leftSearch, setLeftSearch] = useState("");
  const [rightSearch, setRightSearch] = useState("");

  const handleLeftSearch = useCallback(
    (value: string) => {
      setLeftSearch(value);
      onSearch?.("left", value);
    },
    [onSearch],
  );

  const handleRightSearch = useCallback(
    (value: string) => {
      setRightSearch(value);
      onSearch?.("right", value);
    },
    [onSearch],
  );

  /* ---- Derive left / right items ---- */

  const leftItems = useMemo(
    () => dataSource.filter((item) => !targetKeySet.has(item.key)),
    [dataSource, targetKeySet],
  );

  const rightItems = useMemo(
    () => dataSource.filter((item) => targetKeySet.has(item.key)),
    [dataSource, targetKeySet],
  );

  /* ---- Move handlers ---- */

  const moveToRight = useCallback(() => {
    if (blocked) return;
    const moveKeys = Array.from(leftSelected).filter((key) => {
      const item = dataSource.find((i) => i.key === key);
      return item && !item.disabled && !targetKeySet.has(key);
    });
    if (moveKeys.length === 0) return;

    const nextTargetKeys = [...Array.from(targetKeySet), ...moveKeys];
    if (!isControlled) {
      setInternalTargetKeys(nextTargetKeys);
    }
    setLeftSelected(new Set());
    onChange?.(nextTargetKeys, "right", moveKeys);
  }, [blocked, leftSelected, dataSource, targetKeySet, isControlled, onChange]);

  const moveToLeft = useCallback(() => {
    if (blocked) return;
    const moveKeys = Array.from(rightSelected).filter((key) => {
      const item = dataSource.find((i) => i.key === key);
      return item && !item.disabled && targetKeySet.has(key);
    });
    if (moveKeys.length === 0) return;

    const nextTargetKeys = Array.from(targetKeySet).filter(
      (k) => !moveKeys.includes(k),
    );
    if (!isControlled) {
      setInternalTargetKeys(nextTargetKeys);
    }
    setRightSelected(new Set());
    onChange?.(nextTargetKeys, "left", moveKeys);
  }, [blocked, rightSelected, dataSource, targetKeySet, isControlled, onChange]);

  /* ---- Enabled selected counts (for button disabled state) ---- */

  const leftSelectedCount = useMemo(
    () =>
      Array.from(leftSelected).filter((key) => {
        const item = dataSource.find((i) => i.key === key);
        return item && !item.disabled && !targetKeySet.has(key);
      }).length,
    [leftSelected, dataSource, targetKeySet],
  );

  const rightSelectedCount = useMemo(
    () =>
      Array.from(rightSelected).filter((key) => {
        const item = dataSource.find((i) => i.key === key);
        return item && !item.disabled && targetKeySet.has(key);
      }).length,
    [rightSelected, dataSource, targetKeySet],
  );

  /* ---- Render ---- */

  if (accessState.isHidden) return null;

  return (
    <div
      ref={ref}
      className={cn("flex flex-wrap items-center justify-center gap-3", className)}
      data-component="transfer"
      data-access-state={accessState.state}
      data-testid="transfer"
      title={accessReason}
    >
      {/* Left panel */}
      <TransferPanel
        direction="left"
        title={resolvedTitles[0]}
        items={leftItems}
        selectedKeys={leftSelected}
        onSelectChange={setLeftSelected}
        searchable={searchable}
        searchValue={leftSearch}
        onSearchChange={handleLeftSearch}
        filterOption={filterOption}
        size={size}
        showSelectAll={showSelectAll}
        renderItem={renderItem}
        locale={locale}
        blocked={blocked}
      />

      {/* Transfer buttons */}
      <div
        className="flex flex-row gap-2"
        data-testid="transfer-actions"
      >
        <button
          type="button"
          disabled={blocked || leftSelectedCount === 0}
          onClick={moveToRight}
          onKeyDown={(e) => {
            if (e.key === "Enter") moveToRight();
          }}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-(--motion-duration-fast)",
            leftSelectedCount > 0 && !blocked
              ? "border-action-primary/40 bg-action-primary text-text-inverse shadow-[0_8px_16px_-8px_var(--action-primary)] hover:shadow-[0_12px_20px_-8px_var(--action-primary)] active:translate-y-px"
              : "border-border-subtle/60 bg-surface-default text-[var(--text-disabled)] cursor-not-allowed",
          )}
          aria-label="Move selected items to right"
          data-testid="transfer-move-right"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={blocked || rightSelectedCount === 0}
          onClick={moveToLeft}
          onKeyDown={(e) => {
            if (e.key === "Enter") moveToLeft();
          }}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-(--motion-duration-fast)",
            rightSelectedCount > 0 && !blocked
              ? "border-action-primary/40 bg-action-primary text-text-inverse shadow-[0_8px_16px_-8px_var(--action-primary)] hover:shadow-[0_12px_20px_-8px_var(--action-primary)] active:translate-y-px"
              : "border-border-subtle/60 bg-surface-default text-[var(--text-disabled)] cursor-not-allowed",
          )}
          aria-label="Move selected items to left"
          data-testid="transfer-move-left"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Right panel */}
      <TransferPanel
        direction="right"
        title={resolvedTitles[1]}
        items={rightItems}
        selectedKeys={rightSelected}
        onSelectChange={setRightSelected}
        searchable={searchable}
        searchValue={rightSearch}
        onSearchChange={handleRightSearch}
        filterOption={filterOption}
        size={size}
        showSelectAll={showSelectAll}
        renderItem={renderItem}
        locale={locale}
        blocked={blocked}
      />
    </div>
  );
});

Transfer.displayName = "Transfer";

export default Transfer;
