import React, { useEffect, useId, useMemo, useState } from "react";
import { cn } from "../../utils/cn";
import { Badge } from "../../primitives/badge";
import { EmptyState as Empty } from "../empty-state";
import { TextInput } from "../../primitives/input";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  CommandPalette — ⌘K style search overlay for commands & routes    */
/* ------------------------------------------------------------------ */

export interface CommandPaletteItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  group?: string;
  shortcut?: string;
  keywords?: string[];
  disabled?: boolean;
  badge?: React.ReactNode;
}

/** Props for the CommandPalette component. */
export interface CommandPaletteProps extends AccessControlledProps {
  /** Whether the command palette overlay is visible. */
  open: boolean;
  /** Available command items to search and select. */
  items: CommandPaletteItem[];
  /** Heading text for the palette dialog. */
  title?: React.ReactNode;
  /** Subtitle text displayed below the heading. */
  subtitle?: React.ReactNode;
  /** Controlled search query value. */
  query?: string;
  /** Initial search query for uncontrolled mode. */
  defaultQuery?: string;
  /** Callback fired when the search query changes. */
  onQueryChange?: (query: string) => void;
  /** Callback fired when a command item is selected. */
  onSelect?: (id: string, item: CommandPaletteItem) => void;
  /** Callback fired when the palette is dismissed. */
  onClose?: () => void;
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Label shown when no commands match the query. */
  emptyStateLabel?: string;
  /** Custom content rendered in the palette footer. */
  footer?: React.ReactNode;
}

const stringify = (value: React.ReactNode) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
};

/**
 * Keyboard-driven search overlay for quickly finding and executing commands or navigating routes.
 *
 * @example
 * ```tsx
 * <CommandPalette
 *   open={isOpen}
 *   items={[
 *     { id: 'dashboard', title: 'Go to Dashboard', group: 'Navigation' },
 *     { id: 'settings', title: 'Open Settings', shortcut: '⌘,' },
 *   ]}
 *   onSelect={(id) => navigate(id)}
 *   onClose={() => setIsOpen(false)}
 * />
 * ```
 */
export const CommandPalette = React.forwardRef<HTMLDivElement, CommandPaletteProps>(({
  open,
  items,
  title = "Komut Paleti",
  subtitle = "Rota, komut ve AI destekli is akislarini tek yerden arayin.",
  query,
  defaultQuery = "",
  onQueryChange,
  onSelect,
  onClose,
  placeholder = "Komut, rota, politika ara\u2026",
  emptyStateLabel = "Eslesen komut bulunamadi.",
  footer,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [internalQuery, setInternalQuery] = useState(defaultQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const isControlled = query !== undefined;
  const currentQuery = isControlled ? query : internalQuery;
  const canExecute = !accessState.isDisabled && !accessState.isReadonly;

  const filteredItems = useMemo(() => {
    const normalized = currentQuery.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [
        stringify(item.title),
        stringify(item.description),
        item.group ?? "",
        ...(item.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [currentQuery, items]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = filteredItems.findIndex((item) => !item.disabled);
    setActiveIndex(firstEnabled === -1 ? 0 : firstEnabled);
  }, [filteredItems, open]);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || accessState.isHidden) {
    return null;
  }

  const setQueryValue = (value: string) => {
    if (!isControlled) {
      setInternalQuery(value);
    }
    onQueryChange?.(value);
  };

  const groupedItems = filteredItems.reduce<
    Record<string, CommandPaletteItem[]>
  >((acc, item) => {
    const key = item.group ?? "General";
    acc[key] ??= [];
    acc[key].push(item);
    return acc;
  }, {});

  const orderedItems = filteredItems;

  const handleSelect = (item: CommandPaletteItem) => {
    if (item.disabled || !canExecute) {
      return;
    }
    onSelect?.(item.id, item);
    onClose?.();
  };

  const handleInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (orderedItems.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      let next = activeIndex;
      do {
        next = (next + 1) % orderedItems.length;
      } while (orderedItems[next]?.disabled && next !== activeIndex);
      setActiveIndex(next);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      let next = activeIndex;
      do {
        next = (next - 1 + orderedItems.length) % orderedItems.length;
      } while (orderedItems[next]?.disabled && next !== activeIndex);
      setActiveIndex(next);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      handleSelect(orderedItems[activeIndex]);
    }
  };

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 py-10"
      {...stateAttrs({ component: "command-palette", state: "open", disabled: accessState.isDisabled })}
      data-access-state={accessState.state}
    >
      {/* Overlay backdrop */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor:
             
            "color-mix(in srgb, var(--surface-overlay-bg) calc(var(--overlay-intensity) * 1%), transparent)",
          opacity: "var(--overlay-opacity)",
        }}
        onClick={() => onClose?.()}
        role="presentation"
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-border-subtle bg-surface-muted shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {/* Header */}
        <div className="border-b border-border-subtle px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div
                id={titleId}
                className="text-lg font-semibold text-text-primary"
              >
                {title}
              </div>
              <div
                id={descriptionId}
                className="text-sm leading-6 text-text-secondary"
              >
                {subtitle}
              </div>
            </div>
            {onClose ? (
              <button
                type="button"
                onClick={() => onClose()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-default text-text-secondary hover:bg-surface-muted"
                aria-label="Close command palette"
                title={accessReason}
              >
                &times;
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            <TextInput
              label="Command search"
              description="Search by route, command or policy cue."
              value={currentQuery}
              onValueChange={setQueryValue}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              leadingVisual={<span aria-hidden="true">{"\u2318"}</span>}
              trailingVisual={<Badge variant="muted">AI</Badge>}
              access={accessState.isReadonly ? "readonly" : access}
              accessReason={accessReason}
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-default p-5">
              <Empty description={emptyStateLabel} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {Object.entries(groupedItems).map(([group, groupItems]) => (
                <section
                  key={group}
                  className="rounded-2xl border border-border-subtle bg-surface-default p-3"
                >
                  <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-secondary">
                    {group}
                  </div>
                  <div className="flex flex-col gap-2">
                    {groupItems.map((item) => {
                      const index = orderedItems.findIndex(
                        (candidate) => candidate.id === item.id,
                      );
                      const isActive = index === activeIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelect(item)}
                          disabled={item.disabled || !canExecute}
                          className={cn(
                            "flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition",
                            isActive
                              ? "border-action-primary bg-[var(--action-primary-soft)]"
                              : "border-border-subtle bg-surface-muted hover:bg-[var(--surface-hover))]",
                            (item.disabled || !canExecute) &&
                              "cursor-not-allowed opacity-60",
                          )}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary">
                              {item.title}
                            </div>
                            {item.description ? (
                              <div className="mt-1 text-sm leading-6 text-text-secondary">
                                {item.description}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.badge ? item.badge : null}
                            {item.shortcut ? (
                              <Badge variant="muted">{item.shortcut}</Badge>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {footer ? (
          <div className="border-t border-border-subtle px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
});

CommandPalette.displayName = "CommandPalette";

export default CommandPalette;
