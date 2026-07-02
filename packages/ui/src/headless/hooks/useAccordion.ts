/* ------------------------------------------------------------------ */
/*  useAccordion — Accordion state management hook                     */
/*                                                                     */
/*  Manages expand/collapse state for accordion panels with support    */
/*  for single or multiple expansion, keyboard navigation, and        */
/*  proper ARIA attributes per WAI-ARIA APG Accordion pattern.        */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface UseAccordionOptions {
  /** Allow multiple panels open simultaneously (default: false) */
  multiple?: boolean;
  /** Default expanded panel keys (uncontrolled) */
  defaultExpandedKeys?: string[];
  /** Controlled expanded panel keys */
  expandedKeys?: string[];
  /** Called when expanded keys change */
  onExpandedChange?: (keys: string[]) => void;
}

export interface AccordionTriggerProps {
  id: string;
  role: "button";
  "aria-expanded": boolean;
  "aria-controls": string;
  tabIndex: number;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface AccordionPanelProps {
  id: string;
  role: "region";
  "aria-labelledby": string;
  hidden: boolean;
}

export interface AccordionItemState {
  isExpanded: boolean;
  getTriggerProps: (index: number) => AccordionTriggerProps;
  getPanelProps: () => AccordionPanelProps;
}

export interface UseAccordionReturn {
  /** Get state and prop getters for a specific item */
  getItemState: (key: string) => AccordionItemState;
  /** Currently expanded keys */
  expandedKeys: string[];
  /** Toggle a specific item */
  toggle: (key: string) => void;
  /** Expand a specific item */
  expand: (key: string) => void;
  /** Collapse a specific item */
  collapse: (key: string) => void;
  /** Collapse all items */
  collapseAll: () => void;
}

/* ---- Hook ---- */

export function useAccordion(options: UseAccordionOptions = {}): UseAccordionReturn {
  const {
    multiple = false,
    defaultExpandedKeys = [],
    expandedKeys: controlledKeys,
    onExpandedChange,
  } = options;

  const baseId = useId();
  const [internalKeys, setInternalKeys] = useState<string[]>(defaultExpandedKeys);

  const isControlled = controlledKeys !== undefined;
  const expandedKeys = isControlled ? controlledKeys : internalKeys;

  const updateKeys = useCallback(
    (next: string[]) => {
      if (!isControlled) {
        setInternalKeys(next);
      }
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange],
  );

  const toggle = useCallback(
    (key: string) => {
      const isExpanded = expandedKeys.includes(key);
      let next: string[];
      if (isExpanded) {
        next = expandedKeys.filter((k) => k !== key);
      } else if (multiple) {
        next = [...expandedKeys, key];
      } else {
        next = [key];
      }
      updateKeys(next);
    },
    [expandedKeys, multiple, updateKeys],
  );

  const expand = useCallback(
    (key: string) => {
      if (expandedKeys.includes(key)) return;
      const next = multiple ? [...expandedKeys, key] : [key];
      updateKeys(next);
    },
    [expandedKeys, multiple, updateKeys],
  );

  const collapse = useCallback(
    (key: string) => {
      if (!expandedKeys.includes(key)) return;
      updateKeys(expandedKeys.filter((k) => k !== key));
    },
    [expandedKeys, updateKeys],
  );

  const collapseAll = useCallback(() => {
    updateKeys([]);
  }, [updateKeys]);

  const getItemState = useCallback(
    (key: string): AccordionItemState => {
      const isExpanded = expandedKeys.includes(key);
      const triggerId = `${baseId}-trigger-${key}`;
      const panelId = `${baseId}-panel-${key}`;

      return {
        isExpanded,
        getTriggerProps: (_index: number) => ({
          id: triggerId,
          role: "button" as const,
          "aria-expanded": isExpanded,
          "aria-controls": panelId,
          tabIndex: 0,
          onClick: () => toggle(key),
          onKeyDown: (event: React.KeyboardEvent) => {
            switch (event.key) {
              case "Enter":
              case " ":
                event.preventDefault();
                toggle(key);
                break;
              case "Home":
                event.preventDefault();
                // Focus first trigger — consumer manages refs
                break;
              case "End":
                event.preventDefault();
                // Focus last trigger — consumer manages refs
                break;
            }
          },
        }),
        getPanelProps: () => ({
          id: panelId,
          role: "region" as const,
          "aria-labelledby": triggerId,
          hidden: !isExpanded,
        }),
      };
    },
    [expandedKeys, baseId, toggle],
  );

  return useMemo(
    () => ({
      getItemState,
      expandedKeys,
      toggle,
      expand,
      collapse,
      collapseAll,
    }),
    [getItemState, expandedKeys, toggle, expand, collapse, collapseAll],
  );
}
