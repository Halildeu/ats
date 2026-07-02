import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CascaderOption = {
  value: string;
  label: string;
  children?: CascaderOption[];
  disabled?: boolean;
};

/** Props for the Cascader component.
 * @example
 * ```tsx
 * <Cascader />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/cascader)
 */
export interface CascaderProps extends AccessControlledProps {
  /** Hierarchical option data for the cascade panels. */
  options: CascaderOption[];
  /** Controlled selected value path. */
  value?: string[];
  /** Initial value path for uncontrolled mode. */
  defaultValue?: string[];
  /** Placeholder text shown when no value is selected. */
  placeholder?: string;
  /** Size variant of the trigger control. */
  size?: "sm" | "md" | "lg";
  /** Whether multiple leaf values can be selected. */
  multiple?: boolean;
  /** Whether inline search filtering is enabled. */
  searchable?: boolean;
  /** How child panels are revealed on parent options. */
  expandTrigger?: "click" | "hover";
  /** Custom renderer for the displayed selected value. */
  displayRender?: (labels: string[]) => string;
  /** Callback fired when the selected path changes. */
  onValueChange?: (value: string[], selectedOptions: CascaderOption[]) => void;
  /** Field label displayed above the trigger. */
  label?: string;
  /** Whether to show the error state. */
  error?: boolean;
  /** Descriptive text below the label. */
  description?: string;
  /** Additional CSS class name. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------ */

const SIZE_CLASS: Record<string, string> = {
  sm: "h-8 text-xs px-2",
  md: "h-10 text-sm px-3",
  lg: "h-12 text-base px-4",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findOptionPath(
  options: CascaderOption[],
  targetValues: string[],
): { path: CascaderOption[]; labels: string[] } {
  const path: CascaderOption[] = [];
  const labels: string[] = [];
  let current = options;

  for (const val of targetValues) {
    const found = current.find((o) => o.value === val);
    if (!found) break;
    path.push(found);
    labels.push(found.label);
    current = found.children ?? [];
  }
  return { path, labels };
}

function flattenOptions(
  options: CascaderOption[],
  parentLabels: string[] = [],
  parentValues: string[] = [],
): Array<{ labels: string[]; values: string[]; option: CascaderOption }> {
  const result: Array<{ labels: string[]; values: string[]; option: CascaderOption }> = [];
  for (const opt of options) {
    const currentLabels = [...parentLabels, opt.label];
    const currentValues = [...parentValues, opt.value];
    if (opt.children && opt.children.length > 0) {
      result.push(...flattenOptions(opt.children, currentLabels, currentValues));
    } else {
      result.push({ labels: currentLabels, values: currentValues, option: opt });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/** Multi-level cascading selection input for hierarchical option trees. */
export const Cascader = React.forwardRef<HTMLDivElement, CascaderProps>(function Cascader(
  {
    options,
    value,
    defaultValue,
    placeholder = "Select...",
    size = "md",
    multiple = false,
    searchable = false,
    expandTrigger = "click",
    displayRender,
    onValueChange,
    label,
    error = false,
    description,
    className,
    access = "full",
    accessReason,
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState<string[]>(defaultValue ?? []);
  const currentValue = isControlled ? value : internalValue;

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeColumns, setActiveColumns] = React.useState<CascaderOption[][]>([options]);
  const [focusedIndices, setFocusedIndices] = React.useState<number[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");

  const generatedId = React.useId();
  const rootId = `cascader-${generatedId}`;
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

  // Rebuild columns from current value
  React.useEffect(() => {
    if (currentValue.length === 0) {
      setActiveColumns([options]);
      return;
    }
    const columns: CascaderOption[][] = [options];
    let current = options;
    for (const val of currentValue) {
      const found = current.find((o) => o.value === val);
      if (found?.children?.length) {
        columns.push(found.children);
        current = found.children;
      }
    }
    setActiveColumns(columns);
  }, [options, currentValue]);

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Focus search input when opened
  React.useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const commitValue = React.useCallback(
    (newValue: string[], selectedOptions: CascaderOption[]) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue, selectedOptions);
    },
    [isControlled, onValueChange],
  );

  const handleOptionSelect = React.useCallback(
    (option: CascaderOption, columnIndex: number) => {
      if (option.disabled || !isInteractive) return;

      const newValue = currentValue.slice(0, columnIndex);
      newValue.push(option.value);

      if (option.children && option.children.length > 0) {
        // Expand next column
        const newColumns = activeColumns.slice(0, columnIndex + 1);
        newColumns.push(option.children);
        setActiveColumns(newColumns);

        const newFocused = focusedIndices.slice(0, columnIndex);
        const idx = activeColumns[columnIndex]?.indexOf(option) ?? 0;
        newFocused.push(idx);
        setFocusedIndices(newFocused);

        if (!isControlled) {
          setInternalValue(newValue);
        }
      } else {
        // Leaf node — commit selection
        const { path } = findOptionPath(options, newValue);
        commitValue(newValue, path);
        if (!multiple) {
          setIsOpen(false);
          setSearchQuery("");
        }
      }
    },
    [activeColumns, commitValue, currentValue, focusedIndices, isControlled, isInteractive, multiple, options],
  );

  const handleOptionHover = React.useCallback(
    (option: CascaderOption, columnIndex: number) => {
      if (expandTrigger !== "hover" || option.disabled || !isInteractive) return;
      if (option.children && option.children.length > 0) {
        const newColumns = activeColumns.slice(0, columnIndex + 1);
        newColumns.push(option.children);
        setActiveColumns(newColumns);
      }
    },
    [activeColumns, expandTrigger, isInteractive],
  );

  const handleSearchSelect = React.useCallback(
    (values: string[]) => {
      const { path } = findOptionPath(options, values);
      commitValue(values, path);
      if (!multiple) {
        setIsOpen(false);
        setSearchQuery("");
      }
    },
    [commitValue, multiple, options],
  );

  // Keyboard navigation
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isInteractive) return;

      if (!isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setSearchQuery("");
          triggerRef.current?.focus();
          break;
        case "ArrowDown": {
          e.preventDefault();
          const colIdx = focusedIndices.length > 0 ? focusedIndices.length - 1 : 0;
          const col = activeColumns[colIdx];
          if (!col) break;
          const currentIdx = focusedIndices[colIdx] ?? -1;
          const nextIdx = Math.min(currentIdx + 1, col.length - 1);
          const newFocused = [...focusedIndices];
          newFocused[colIdx] = nextIdx;
          setFocusedIndices(newFocused);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const colIdx = focusedIndices.length > 0 ? focusedIndices.length - 1 : 0;
          const currentIdx = focusedIndices[colIdx] ?? 0;
          const nextIdx = Math.max(currentIdx - 1, 0);
          const newFocused = [...focusedIndices];
          newFocused[colIdx] = nextIdx;
          setFocusedIndices(newFocused);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const colIdx = focusedIndices.length > 0 ? focusedIndices.length - 1 : 0;
          const col = activeColumns[colIdx];
          if (!col) break;
          const idx = focusedIndices[colIdx] ?? 0;
          const option = col[idx];
          if (option?.children?.length) {
            handleOptionSelect(option, colIdx);
            // Push focus index for the new child column
            const newFocused = [...focusedIndices];
            newFocused.push(0);
            setFocusedIndices(newFocused);
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (focusedIndices.length > 1) {
            setFocusedIndices(focusedIndices.slice(0, -1));
            setActiveColumns(activeColumns.slice(0, -1));
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          const colIdx = focusedIndices.length > 0 ? focusedIndices.length - 1 : 0;
          const col = activeColumns[colIdx];
          if (!col) break;
          const idx = focusedIndices[colIdx] ?? 0;
          const option = col[idx];
          if (option) {
            handleOptionSelect(option, colIdx);
          }
          break;
        }
      }
    },
    [activeColumns, focusedIndices, handleOptionSelect, isInteractive, isOpen],
  );

  // Display text
  const { labels: displayLabels } = findOptionPath(options, currentValue);
  const displayText = displayRender
    ? displayRender(displayLabels)
    : displayLabels.length > 0
      ? displayLabels.join(" / ")
      : "";

  // Search results
  const searchResults = React.useMemo(() => {
    if (!searchQuery) return [];
    const flat = flattenOptions(options);
    const query = searchQuery.toLowerCase();
    return flat.filter((item) =>
      item.labels.some((l) => l.toLowerCase().includes(query)),
    );
  }, [options, searchQuery]);

  if (accessState.isHidden) return null;

  return (
    <div
      ref={forwardedRef}
      data-access-state={accessState.state}
      className={cn("relative inline-block", className)}
      onKeyDown={handleKeyDown}
      title={accessReason}
      data-testid="cascader-root"
    >
      {label && (
        <label
          id={`${rootId}-label`}
          htmlFor={rootId}
          className="mb-1 block text-sm font-medium text-text-primary"
        >
          {label}
        </label>
      )}

      {description && (
        <p className="mb-1 text-xs text-text-secondary">{description}</p>
      )}

      <button
        ref={triggerRef}
        id={rootId}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={label ? `${rootId}-label` : undefined}
        aria-label={label ? undefined : placeholder}
        aria-disabled={accessState.isDisabled || undefined}
        aria-readonly={accessState.isReadonly || undefined}
        disabled={accessState.isDisabled}
        className={cn(
          "inline-flex w-full items-center justify-between rounded-md border bg-[var(--surface-canvas)] text-start transition-colors focus-within:ring-2 focus-within:ring-focus-outline/30",
          SIZE_CLASS[size],
          error
            ? "border-[var(--border-danger)]"
            : "border-border-default",
          isOpen && "ring-2 ring-accent-primary",
          accessState.isDisabled && "cursor-not-allowed opacity-50",
          accessState.isReadonly && "cursor-default",
        )}
        onClick={() => {
          if (!isInteractive) return;
          setIsOpen(!isOpen);
        }}
      >
        <span
          className={cn(
            "truncate",
            !displayText && "text-[var(--text-placeholder)]",
          )}
        >
          {displayText || placeholder}
        </span>
        <svg
          className={cn(
            "ms-2 h-4 w-4 shrink-0 text-text-secondary transition-[rotate]",
            isOpen && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && (
        <p className="mt-1 text-xs text-[var(--text-danger)]" role="alert">
          This field has an error
        </p>
      )}

      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 flex max-w-[calc(100vw-2rem)] rounded-md border border-border-default bg-[var(--surface-canvas)] shadow-lg",
            searchable && searchQuery ? "flex-col" : "flex-row overflow-x-auto",
          )}
          data-testid="cascader-dropdown"
        >
          {searchable && (
            <div className="border-b border-border-default p-2">
              <input
                ref={searchInputRef}
                type="text"
                role="searchbox"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full rounded-xs border border-border-default bg-transparent px-2 py-1 text-sm text-text-primary outline-hidden"
                data-testid="cascader-search"
              />
            </div>
          )}

          {searchable && searchQuery ? (
            <ul className="max-h-60 overflow-auto py-1" data-testid="cascader-search-results">
              {searchResults.length === 0 ? (
                <li className="px-3 py-2 text-sm text-text-secondary">
                  No results found
                </li>
              ) : (
                searchResults.map((item) => (
                  <li
                    key={item.values.join("/")}
                    role="option"
                    aria-selected={false}
                    className="cursor-pointer px-3 py-2 text-sm text-text-primary hover:bg-[var(--surface-hover)]"
                    onClick={() => handleSearchSelect(item.values)}
                  >
                    {item.labels.join(" / ")}
                  </li>
                ))
              )}
            </ul>
          ) : (
            activeColumns.map((column, colIdx) => (
              <ul
                key={colIdx}
                className="min-w-[150px] max-h-60 overflow-auto border-r border-border-default py-1 last:border-r-0"
                role="group"
                data-testid={`cascader-column-${colIdx}`}
              >
                {column.map((option, optIdx) => {
                  const isSelected = currentValue[colIdx] === option.value;
                  const isFocused = focusedIndices[colIdx] === optIdx;

                  return (
                    <li
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      className={cn(
                        "flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors",
                        isSelected && "bg-[var(--surface-active)] text-accent-primary",
                        isFocused && !isSelected && "bg-[var(--surface-hover)]",
                        option.disabled
                          ? "cursor-not-allowed text-[var(--text-disabled)] opacity-50"
                          : "text-text-primary hover:bg-[var(--surface-hover)]",
                      )}
                      onClick={() => handleOptionSelect(option, colIdx)}
                      onMouseEnter={() => handleOptionHover(option, colIdx)}
                      data-testid={`cascader-option-${option.value}`}
                    >
                      <span>{option.label}</span>
                      {option.children && option.children.length > 0 && (
                        <svg
                          className="ms-2 h-3 w-3 text-text-secondary"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))
          )}
        </div>
      )}
    </div>
  );
});

Cascader.displayName = "Cascader";

export default Cascader;
