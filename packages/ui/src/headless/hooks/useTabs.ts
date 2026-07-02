/* ------------------------------------------------------------------ */
/*  useTabs — Tab selection + keyboard navigation hook                 */
/*                                                                     */
/*  Manages tab selection state with arrow key navigation, Home/End,  */
/*  automatic or manual activation modes, and proper ARIA attributes  */
/*  per WAI-ARIA APG Tabs pattern.                                    */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface TabItem {
  /** Unique identifier */
  id: string;
  /** Whether tab is disabled */
  disabled?: boolean;
}

export interface UseTabsOptions {
  /** Tab definitions */
  tabs: TabItem[];
  /** Controlled selected tab ID */
  selectedId?: string;
  /** Default selected tab ID (uncontrolled) */
  defaultSelectedId?: string;
  /** Called when selected tab changes */
  onSelectedChange?: (id: string) => void;
  /** Activation mode: "automatic" selects on focus, "manual" requires Enter/Space */
  activationMode?: "automatic" | "manual";
  /** Orientation for arrow key navigation (default: "horizontal") */
  orientation?: "horizontal" | "vertical";
  /** Whether navigation wraps around (default: true) */
  loop?: boolean;
}

export interface TabListProps {
  role: "tablist";
  "aria-orientation": "horizontal" | "vertical";
}

export interface TabProps {
  id: string;
  role: "tab";
  "aria-selected": boolean;
  "aria-controls": string;
  "aria-disabled": boolean | undefined;
  tabIndex: number;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
}

export interface TabPanelProps {
  id: string;
  role: "tabpanel";
  "aria-labelledby": string;
  tabIndex: 0;
  hidden: boolean;
}

export interface UseTabsReturn {
  /** Currently selected tab ID */
  selectedId: string;
  /** Currently focused tab index (for keyboard nav) */
  focusedIndex: number;
  /** Props for the tablist container */
  getTabListProps: () => TabListProps;
  /** Props for a specific tab */
  getTabProps: (tab: TabItem, index: number) => TabProps;
  /** Props for a specific tab panel */
  getPanelProps: (tab: TabItem) => TabPanelProps;
  /** Select a specific tab */
  select: (id: string) => void;
}

/* ---- Hook ---- */

export function useTabs(options: UseTabsOptions): UseTabsReturn {
  const {
    tabs,
    selectedId: controlledSelectedId,
    defaultSelectedId,
    onSelectedChange,
    activationMode = "automatic",
    orientation = "horizontal",
    loop = true,
  } = options;

  const baseId = useId();

  // Resolve default
  const resolvedDefault = defaultSelectedId ?? tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id ?? "";

  const [internalSelectedId, setInternalSelectedId] = useState(resolvedDefault);
  const [focusedIndex, setFocusedIndex] = useState(() => {
    const idx = tabs.findIndex((t) => t.id === resolvedDefault);
    return idx >= 0 ? idx : 0;
  });

  const isControlled = controlledSelectedId !== undefined;
  const selectedId = isControlled ? controlledSelectedId : internalSelectedId;

  const select = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab?.disabled) return;
      if (!isControlled) setInternalSelectedId(id);
      onSelectedChange?.(id);
    },
    [tabs, isControlled, onSelectedChange],
  );

  // Navigation
  const findNextEnabled = useCallback(
    (from: number, delta: number): number => {
      if (tabs.length === 0) return from;
      let index = from;
      let attempts = 0;
      do {
        index += delta;
        if (loop) {
          index = ((index % tabs.length) + tabs.length) % tabs.length;
        } else {
          index = Math.max(0, Math.min(tabs.length - 1, index));
        }
        attempts++;
        if (attempts > tabs.length) return from;
      } while (tabs[index]?.disabled);
      return index;
    },
    [tabs, loop],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const nextIndex = findNextEnabled(focusedIndex, delta);
      setFocusedIndex(nextIndex);
      if (activationMode === "automatic" && tabs[nextIndex]) {
        select(tabs[nextIndex].id);
      }
    },
    [focusedIndex, findNextEnabled, activationMode, tabs, select],
  );

  // Prop getters
  const getTabListProps = useCallback(
    (): TabListProps => ({
      role: "tablist",
      "aria-orientation": orientation,
    }),
    [orientation],
  );

  const getTabProps = useCallback(
    (tab: TabItem, index: number): TabProps => {
      const isSelected = tab.id === selectedId;
      const tabId = `${baseId}-tab-${tab.id}`;
      const panelId = `${baseId}-panel-${tab.id}`;
      const isHorizontal = orientation === "horizontal";

      return {
        id: tabId,
        role: "tab",
        "aria-selected": isSelected,
        "aria-controls": panelId,
        "aria-disabled": tab.disabled || undefined,
        tabIndex: isSelected ? 0 : -1,
        onClick: () => {
          if (!tab.disabled) {
            select(tab.id);
            setFocusedIndex(index);
          }
        },
        onKeyDown: (event: React.KeyboardEvent) => {
          const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";
          const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";

          switch (event.key) {
            case nextKey:
              event.preventDefault();
              moveFocus(1);
              break;
            case prevKey:
              event.preventDefault();
              moveFocus(-1);
              break;
            case "Home":
              event.preventDefault();
              {
                const firstIdx = findNextEnabled(-1, 1);
                setFocusedIndex(firstIdx);
                if (activationMode === "automatic" && tabs[firstIdx]) {
                  select(tabs[firstIdx].id);
                }
              }
              break;
            case "End":
              event.preventDefault();
              {
                const lastIdx = findNextEnabled(tabs.length, -1);
                setFocusedIndex(lastIdx);
                if (activationMode === "automatic" && tabs[lastIdx]) {
                  select(tabs[lastIdx].id);
                }
              }
              break;
            case "Enter":
            case " ":
              if (activationMode === "manual" && !tab.disabled) {
                event.preventDefault();
                select(tabs[focusedIndex]?.id ?? tab.id);
              }
              break;
          }
        },
        onFocus: () => {
          setFocusedIndex(index);
        },
      };
    },
    [selectedId, baseId, orientation, select, moveFocus, findNextEnabled, activationMode, tabs, focusedIndex],
  );

  const getPanelProps = useCallback(
    (tab: TabItem): TabPanelProps => {
      const tabId = `${baseId}-tab-${tab.id}`;
      const panelId = `${baseId}-panel-${tab.id}`;

      return {
        id: panelId,
        role: "tabpanel",
        "aria-labelledby": tabId,
        tabIndex: 0,
        hidden: tab.id !== selectedId,
      };
    },
    [baseId, selectedId],
  );

  return useMemo(
    () => ({
      selectedId,
      focusedIndex,
      getTabListProps,
      getTabProps,
      getPanelProps,
      select,
    }),
    [selectedId, focusedIndex, getTabListProps, getTabProps, getPanelProps, select],
  );
}
