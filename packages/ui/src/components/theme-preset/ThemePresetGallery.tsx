import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { Badge } from "../../primitives/badge";
import { EmptyState as Empty } from "../empty-state";
import { Text } from "../../primitives/text";
import { ThemePreviewCard } from "../theme-preview-card";
import {
  resolveAccessState,
  shouldBlockInteraction,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";
import { stateAttrs, focusRingClass } from "../../internal/interaction-core";
import { useScopedTheme } from "../theme-preview-card/useScopedTheme";
import type { ThemeAxes } from "../../theme/core/semantic-theme";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ThemePresetGalleryItem {
  presetId: string;
  label: React.ReactNode;
  themeMode?: React.ReactNode;
  appearance?: React.ReactNode;
  density?: React.ReactNode;
  intent?: React.ReactNode;
  isHighContrast?: boolean;
  isDefaultMode?: boolean;
  badges?: React.ReactNode[];
  /** Theme axes for live scoped preview per card. */
  themeAxes?: Partial<ThemeAxes>;
  /** Accent color name (for filtering). */
  accent?: string;
}

export interface ThemePresetGalleryProps extends AccessControlledProps {
  presets: ThemePresetGalleryItem[];
  title?: React.ReactNode;
  description?: React.ReactNode;
  compareAxes?: React.ReactNode[];
  selectedPresetId?: string | null;
  defaultSelectedPresetId?: string | null;
  onSelectPreset?: (presetId: string, preset: ThemePresetGalleryItem) => void;
  className?: string;
  /** Enable keyboard navigation. @default true */
  enableKeyboardNav?: boolean;
  /** Show filter chips. @default false */
  showFilters?: boolean;
  /** Filter axes to display. @default ['appearance', 'density'] */
  filterAxes?: Array<"appearance" | "density" | "accent" | "contrast">;
  /** Show search input. @default false */
  showSearch?: boolean;
  /** Controlled search query. */
  searchQuery?: string;
  /** Search change callback. */
  onSearchChange?: (query: string) => void;
  /** Enable compare mode (select 2 presets). @default false */
  enableCompare?: boolean;
  /** Fires when 2 presets selected for comparison. */
  onCompare?: (leftPresetId: string, rightPresetId: string) => void;
  /** Show copy/export action buttons per card. @default false */
  showActions?: boolean;
  /** Copy theme callback. */
  onCopyTheme?: (presetId: string, preset: ThemePresetGalleryItem) => void;
  /** Export CSS callback. */
  onExportCss?: (presetId: string, preset: ThemePresetGalleryItem) => void;
  /** Preview card size. @default "md" */
  previewSize?: "sm" | "md";
  /** Grid column count override. */
  columns?: number;
  /** Locale overrides. */
  localeText?: {
    searchPlaceholder?: string;
    compareLabel?: string;
    copyLabel?: string;
    exportLabel?: string;
    filterLabel?: string;
    noResultsMessage?: string;
    emptyMessage?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Internal hooks                                                     */
/* ------------------------------------------------------------------ */

function useGalleryFilters(
  presets: ThemePresetGalleryItem[],
  showFilters: boolean,
  showSearch: boolean,
  searchQuery: string | undefined,
  internalSearch: string,
  filterState: Record<string, Set<string>>,
) {
  return useMemo(() => {
    let result = presets;

    // Apply search
    const query = (searchQuery ?? internalSearch).toLowerCase().trim();
    if (showSearch && query) {
      result = result.filter((p) =>
        String(p.label).toLowerCase().includes(query),
      );
    }

    // Apply filters
    if (showFilters) {
      for (const [axis, values] of Object.entries(filterState)) {
        if (values.size === 0) continue;
        result = result.filter((p) => {
          const pVal = String(
            axis === "contrast"
              ? p.isHighContrast ? "high" : "standard"
              : (p as unknown as Record<string, unknown>)[axis] ?? "",
          ).toLowerCase();
          return values.has(pVal);
        });
      }
    }

    return result;
  }, [presets, showFilters, showSearch, searchQuery, internalSearch, filterState]);
}

/* ------------------------------------------------------------------ */
/*  Preset Card sub-component                                          */
/* ------------------------------------------------------------------ */

function PresetCard({
  preset,
  selected,
  blocked,
  previewSize,
  showActions,
  onSelect,
  onCopy,
  onExport,
  focusRing,
  accessReason,
  localeText,
  role,
  ariaSelected,
  tabIndex,
}: {
  preset: ThemePresetGalleryItem;
  selected: boolean;
  blocked: boolean;
  previewSize: "sm" | "md";
  showActions: boolean;
  onSelect: () => void;
  onCopy?: () => void;
  onExport?: () => void;
  focusRing: string;
  accessReason?: string;
  localeText?: ThemePresetGalleryProps["localeText"];
  role?: string;
  ariaSelected?: boolean;
  tabIndex?: number;
}) {
  const scoped = useScopedTheme(preset.themeAxes);

  return (
    <button
      type="button"
      className={cn(
        "group relative w-full rounded-[26px] border px-4 py-4 text-start transition",
        focusRing,
        selected
          ? "border-action-primary bg-[var(--action-primary-soft,var(--surface-muted))]"
          : "border-border-subtle bg-surface-default hover:bg-surface-muted",
        blocked && "cursor-not-allowed opacity-75",
      )}
      role={role}
      aria-selected={ariaSelected}
      aria-current={selected ? "true" : undefined}
      tabIndex={tabIndex}
      data-preset-card
      onClick={blocked ? undefined : onSelect}
      title={accessReason}
    >
      {/* Header: label + badges */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Text as="div" className="text-sm font-semibold text-text-primary">
            {preset.label}
          </Text>
          {preset.intent && (
            <Text variant="secondary" className="mt-1 block text-sm leading-6">
              {preset.intent}
            </Text>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {preset.isDefaultMode && <Badge variant="success">Default</Badge>}
          {preset.isHighContrast && <Badge variant="warning">High contrast</Badge>}
          {preset.badges?.map((badge, i) => (
            <React.Fragment key={`${preset.presetId}-badge-${i}`}>{badge}</React.Fragment>
          ))}
        </div>
      </div>

      {/* Preview + metadata grid */}
      <div
        className="mt-4 grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}
      >
        {/* Scoped theme preview */}
        <div
          className="rounded-[20px] border border-border-subtle bg-surface-muted p-3"
          {...(preset.themeAxes ? scoped.attrs : {})}
          style={preset.themeAxes ? scoped.style : undefined}
        >
          <ThemePreviewCard selected={selected} size={previewSize} />
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["Mode", preset.themeMode],
              ["Appearance", preset.appearance],
              ["Density", preset.density],
              ["Contrast", preset.isHighContrast ? "high" : "standard"],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-border-subtle bg-surface-muted px-3 py-3"
            >
              <Text
                variant="secondary"
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              >
                {label}
              </Text>
              <Text as="div" className="mt-2 text-sm font-semibold text-text-primary">
                {value ?? "\u2014"}
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Hover actions */}
      {showActions && (
        <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onCopy && (
            <span
              role="button"
              tabIndex={-1}
              className="rounded-full bg-surface-default px-2 py-1 text-[10px] font-medium shadow-xs hover:bg-surface-muted"
              onClick={(e) => { e.stopPropagation(); onCopy(); }}
            >
              {localeText?.copyLabel ?? "Kopyala"}
            </span>
          )}
          {onExport && (
            <span
              role="button"
              tabIndex={-1}
              className="rounded-full bg-surface-default px-2 py-1 text-[10px] font-medium shadow-xs hover:bg-surface-muted"
              onClick={(e) => { e.stopPropagation(); onExport(); }}
            >
              {localeText?.exportLabel ?? "CSS Aktar"}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export const ThemePresetGallery = React.forwardRef<HTMLElement, ThemePresetGalleryProps>(
  (
    {
      presets,
      title = "Tema on tanim galerisi",
      description = "Resmi preset ailesi docs, runtime ve release diliyle ayni preset kimlikleri uzerinden okunur.",
      compareAxes = [],
      selectedPresetId,
      defaultSelectedPresetId = null,
      onSelectPreset,
      className,
      enableKeyboardNav = true,
      showFilters = false,
      filterAxes = ["appearance", "density"],
      showSearch = false,
      searchQuery,
      onSearchChange,
      enableCompare = false,
      onCompare,
      showActions = false,
      onCopyTheme,
      onExportCss,
      previewSize = "md",
      columns,
      localeText,
      access = "full",
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const blocked = shouldBlockInteraction(access, accessState.isDisabled);
    const interactionState: AccessLevel = accessState.isDisabled
      ? "disabled"
      : accessState.isReadonly
        ? "readonly"
        : accessState.state;
    const focusRing = focusRingClass("ring");

    // Selection state
    const [internalSelected, setInternalSelected] = useState<string | null>(
      defaultSelectedPresetId ?? presets[0]?.presetId ?? null,
    );
    const currentSelected = selectedPresetId ?? internalSelected;

    // Compare state
    const [compareSelection, setCompareSelection] = useState<string[]>([]);

    // Search state
    const [internalSearch, setInternalSearch] = useState("");

    // Filter state
    const [filterState, setFilterState] = useState<Record<string, Set<string>>>({});

    // Keyboard nav state
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const gridRef = useRef<HTMLDivElement>(null);

    // Filter presets
    const filteredPresets = useGalleryFilters(
      presets, showFilters, showSearch, searchQuery, internalSearch, filterState,
    );

    // Handle selection
    const handleSelect = useCallback(
      (preset: ThemePresetGalleryItem) => {
        if (blocked) return;

        if (enableCompare) {
          setCompareSelection((prev) => {
            if (prev.includes(preset.presetId)) {
              return prev.filter((id) => id !== preset.presetId);
            }
            const next = [...prev, preset.presetId].slice(-2);
            if (next.length === 2) {
              onCompare?.(next[0], next[1]);
            }
            return next;
          });
        } else {
          if (selectedPresetId === undefined) {
            setInternalSelected(preset.presetId);
          }
          onSelectPreset?.(preset.presetId, preset);
        }
      },
      [blocked, enableCompare, onCompare, onSelectPreset, selectedPresetId],
    );

    // Keyboard handler
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!enableKeyboardNav || filteredPresets.length === 0) return;

        const actions: Record<string, () => void> = {
          ArrowRight: () => setFocusedIndex((i) => Math.min(i + 1, filteredPresets.length - 1)),
          ArrowLeft: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
          ArrowDown: () => setFocusedIndex((i) => Math.min(i + 1, filteredPresets.length - 1)),
          ArrowUp: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
          Home: () => setFocusedIndex(0),
          End: () => setFocusedIndex(filteredPresets.length - 1),
          Enter: () => {
            if (focusedIndex >= 0) handleSelect(filteredPresets[focusedIndex]);
          },
          " ": () => {
            if (focusedIndex >= 0) handleSelect(filteredPresets[focusedIndex]);
          },
          Escape: () => {
            setFocusedIndex(-1);
            if (!enableCompare && selectedPresetId === undefined) {
              setInternalSelected(null);
            }
          },
        };

        const action = actions[e.key];
        if (action) {
          e.preventDefault();
          action();
        }
      },
      [enableKeyboardNav, filteredPresets, focusedIndex, handleSelect, enableCompare, selectedPresetId],
    );

    // Focus management
    React.useEffect(() => {
      if (focusedIndex < 0 || !gridRef.current) return;
      const buttons = gridRef.current.querySelectorAll<HTMLButtonElement>('button[data-preset-card]');
      buttons[focusedIndex]?.focus();
    }, [focusedIndex]);

    // Toggle filter
    const toggleFilter = useCallback((axis: string, value: string) => {
      setFilterState((prev) => {
        const next = { ...prev };
        const set = new Set(next[axis] ?? []);
        if (set.has(value)) set.delete(value);
        else set.add(value);
        next[axis] = set;
        return next;
      });
    }, []);

    // Extract unique filter values
    const filterOptions = useMemo(() => {
      const opts: Record<string, string[]> = {};
      for (const axis of filterAxes) {
        const values = new Set<string>();
        for (const p of presets) {
          const v = axis === "contrast"
            ? (p.isHighContrast ? "high" : "standard")
            : String((p as unknown as Record<string, unknown>)[axis] ?? "").toLowerCase();
          if (v) values.add(v);
        }
        opts[axis] = [...values].sort();
      }
      return opts;
    }, [presets, filterAxes]);

    const gridStyle: React.CSSProperties = {
      gridTemplateColumns: columns
        ? `repeat(${columns}, 1fr)`
        : "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
    };

    return (
      <section
        ref={ref}
        className={cn(
          "rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs",
          className,
        )}
        data-access-state={accessState.state}
        data-component="theme-preset-gallery"
        title={accessReason}
        {...stateAttrs({ access, component: "theme-preset-gallery" })}
      >
        {/* Header */}
        <Text as="div" className="text-base font-semibold text-text-primary">
          {title}
        </Text>
        <Text variant="secondary" className="mt-1 block text-sm leading-6">
          {description}
        </Text>

        {/* Compare axes badges */}
        {compareAxes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {compareAxes.map((axis, i) => (
              <Badge key={`theme-axis-${i}`} variant="muted">{axis}</Badge>
            ))}
          </div>
        )}

        {/* Search bar */}
        {showSearch && (
          <div className="mt-4">
            <input
              type="search"
              className="w-full rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:border-action-primary focus:outline-none"
              placeholder={localeText?.searchPlaceholder ?? "Preset ara..."}
              value={searchQuery ?? internalSearch}
              onChange={(e) => {
                const val = e.target.value;
                if (onSearchChange) onSearchChange(val);
                else setInternalSearch(val);
              }}
            />
          </div>
        )}

        {/* Filter chips */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(filterOptions).map(([axis, values]) =>
              values.map((val) => {
                const active = filterState[axis]?.has(val) ?? false;
                return (
                  <Badge
                    key={`${axis}-${val}`}
                    variant={active ? "primary" : "muted"}
                    className={cn("cursor-pointer select-none", active && "ring-1 ring-action-primary")}
                    onClick={() => toggleFilter(axis, val)}
                  >
                    {val}
                  </Badge>
                );
              }),
            )}
          </div>
        )}

        {/* Compare mode indicator */}
        {enableCompare && compareSelection.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
            <span>{compareSelection.length}/2 secili</span>
            {compareSelection.length === 2 && (
              <Badge variant="primary" className="cursor-pointer" onClick={() => onCompare?.(compareSelection[0], compareSelection[1])}>
                {localeText?.compareLabel ?? "Karsilastir"}
              </Badge>
            )}
          </div>
        )}

        {/* Grid */}
        {filteredPresets.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-border-subtle bg-surface-default p-4">
            <Empty description={
              presets.length === 0
                ? (localeText?.emptyMessage ?? "Theme preset bulunamadi.")
                : (localeText?.noResultsMessage ?? "Sonuc bulunamadi.")
            } />
          </div>
        ) : (
          <div
            ref={gridRef}
            className="mt-4 grid gap-4"
            style={gridStyle}
            role={enableKeyboardNav ? "listbox" : undefined}
            aria-label={enableKeyboardNav ? "Theme preset gallery" : undefined}
            onKeyDown={enableKeyboardNav ? handleKeyDown : undefined}
          >
            {filteredPresets.map((preset, index) => {
              const isSelected = enableCompare
                ? compareSelection.includes(preset.presetId)
                : preset.presetId === currentSelected;

              return (
                <PresetCard
                  key={preset.presetId}
                  preset={preset}
                  selected={isSelected}
                  blocked={blocked}
                  previewSize={previewSize}
                  showActions={showActions}
                  onSelect={() => handleSelect(preset)}
                  onCopy={onCopyTheme ? () => onCopyTheme(preset.presetId, preset) : undefined}
                  onExport={onExportCss ? () => onExportCss(preset.presetId, preset) : undefined}
                  focusRing={focusRing}
                  accessReason={accessReason}
                  localeText={localeText}
                  role={enableKeyboardNav ? "option" : undefined}
                  ariaSelected={enableKeyboardNav ? isSelected : undefined}
                  tabIndex={enableKeyboardNav ? (index === focusedIndex || (focusedIndex === -1 && index === 0) ? 0 : -1) : undefined}
                />
              );
            })}
          </div>
        )}
      </section>
    );
  },
);

ThemePresetGallery.displayName = "ThemePresetGallery";

export default ThemePresetGallery;
