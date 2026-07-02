/* ------------------------------------------------------------------ */
/*  useSelect — Select state management hook                           */
/*                                                                     */
/*  Full select state machine: open/close, selection, keyboard nav,   */
/*  and typeahead search per WAI-ARIA APG Listbox pattern.            */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface SelectItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Whether item is disabled */
  disabled?: boolean;
}

export interface UseSelectOptions<T extends SelectItem = SelectItem> {
  /** All available items */
  items: T[];
  /** Controlled selected item */
  selectedItem?: T | null;
  /** Default selected item (uncontrolled) */
  defaultSelectedItem?: T | null;
  /** Called when selection changes */
  onSelectedItemChange?: (item: T | null) => void;
  /** Controlled open state */
  isOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Typeahead timeout in ms (default: 500) */
  typeaheadTimeout?: number;
}

export interface SelectTriggerProps {
  id: string;
  role: "combobox";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-haspopup": "listbox";
  "aria-activedescendant": string | undefined;
  tabIndex: number;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface SelectListboxProps {
  id: string;
  role: "listbox";
  "aria-labelledby": string;
  tabIndex: -1;
}

export interface SelectOptionProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  "aria-disabled": boolean | undefined;
  onClick: () => void;
  onMouseEnter: () => void;
}

export interface UseSelectReturn<T extends SelectItem = SelectItem> {
  /** Whether the listbox is open */
  isOpen: boolean;
  /** Currently selected item */
  selectedItem: T | null;
  /** Currently highlighted index */
  highlightedIndex: number;
  /** Props for the trigger/button */
  getTriggerProps: () => SelectTriggerProps;
  /** Props for the listbox container */
  getListboxProps: () => SelectListboxProps;
  /** Props for an option */
  getOptionProps: (item: T, index: number) => SelectOptionProps;
  /** Open the listbox */
  open: () => void;
  /** Close the listbox */
  close: () => void;
  /** Select an item */
  selectItem: (item: T | null) => void;
}

/* ---- Hook ---- */

export function useSelect<T extends SelectItem = SelectItem>(
  options: UseSelectOptions<T>,
): UseSelectReturn<T> {
  const {
    items,
    selectedItem: controlledSelected,
    defaultSelectedItem = null,
    onSelectedItemChange,
    isOpen: controlledIsOpen,
    onOpenChange,
    typeaheadTimeout = 500,
  } = options;

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const listboxId = `${baseId}-listbox`;

  // Internal state
  const [internalSelected, setInternalSelected] = useState<T | null>(defaultSelectedItem);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Typeahead state
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Resolve controlled/uncontrolled
  const isOpenControlled = controlledIsOpen !== undefined;
  const isOpen = isOpenControlled ? controlledIsOpen : internalIsOpen;

  const isSelectedControlled = controlledSelected !== undefined;
  const selectedItem = isSelectedControlled ? controlledSelected : internalSelected;

  // Helpers
  const updateOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setInternalIsOpen(next);
      onOpenChange?.(next);
      if (!next) setHighlightedIndex(-1);
    },
    [isOpenControlled, onOpenChange],
  );

  const selectItem = useCallback(
    (item: T | null) => {
      if (!isSelectedControlled) setInternalSelected(item);
      onSelectedItemChange?.(item);
      updateOpen(false);
    },
    [isSelectedControlled, onSelectedItemChange, updateOpen],
  );

  const open = useCallback(() => {
    updateOpen(true);
    // Highlight selected item or first item
    const idx = selectedItem ? items.findIndex((i) => i.id === selectedItem.id) : 0;
    setHighlightedIndex(idx >= 0 ? idx : 0);
  }, [updateOpen, selectedItem, items]);

  const close = useCallback(() => updateOpen(false), [updateOpen]);

  // Navigation
  const findNextEnabled = useCallback(
    (from: number, delta: number): number => {
      if (items.length === 0) return from;
      let index = from;
      let attempts = 0;
      do {
        index += delta;
        if (index < 0) index = items.length - 1;
        if (index >= items.length) index = 0;
        attempts++;
        if (attempts > items.length) return from;
      } while (items[index]?.disabled);
      return index;
    },
    [items],
  );

  // Typeahead search
  const handleTypeahead = useCallback(
    (char: string) => {
      if (typeaheadTimerRef.current) {
        clearTimeout(typeaheadTimerRef.current);
      }
      typeaheadRef.current += char.toLowerCase();

      const match = items.findIndex(
        (item) =>
          !item.disabled &&
          item.label.toLowerCase().startsWith(typeaheadRef.current),
      );

      if (match >= 0) {
        setHighlightedIndex(match);
        if (!isOpen) {
          // In closed state, select the match
          selectItem(items[match]);
        }
      }

      typeaheadTimerRef.current = setTimeout(() => {
        typeaheadRef.current = "";
      }, typeaheadTimeout);
    },
    [items, isOpen, selectItem, typeaheadTimeout],
  );

  // Prop getters
  const getTriggerProps = useCallback(
    (): SelectTriggerProps => ({
      id: triggerId,
      role: "combobox",
      "aria-expanded": isOpen,
      "aria-controls": listboxId,
      "aria-haspopup": "listbox",
      "aria-activedescendant":
        isOpen && highlightedIndex >= 0
          ? `${baseId}-option-${highlightedIndex}`
          : undefined,
      tabIndex: 0,
      onClick: () => {
        if (isOpen) {
          close();
        } else {
          open();
        }
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        switch (event.key) {
          case "Enter":
          case " ":
            event.preventDefault();
            if (isOpen && highlightedIndex >= 0 && items[highlightedIndex]) {
              selectItem(items[highlightedIndex]);
            } else if (!isOpen) {
              open();
            }
            break;
          case "ArrowDown":
            event.preventDefault();
            if (!isOpen) {
              open();
            } else {
              setHighlightedIndex(findNextEnabled(highlightedIndex, 1));
            }
            break;
          case "ArrowUp":
            event.preventDefault();
            if (isOpen) {
              setHighlightedIndex(findNextEnabled(highlightedIndex, -1));
            }
            break;
          case "Home":
            event.preventDefault();
            if (isOpen) {
              setHighlightedIndex(findNextEnabled(-1, 1));
            }
            break;
          case "End":
            event.preventDefault();
            if (isOpen) {
              setHighlightedIndex(findNextEnabled(items.length, -1));
            }
            break;
          case "Escape":
            if (isOpen) {
              event.preventDefault();
              close();
            }
            break;
          case "Tab":
            if (isOpen) {
              close();
            }
            break;
          default:
            // Typeahead: single printable character
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
              handleTypeahead(event.key);
            }
            break;
        }
      },
    }),
    [
      triggerId, listboxId, baseId, isOpen, highlightedIndex,
      items, open, close, selectItem, findNextEnabled, handleTypeahead,
    ],
  );

  const getListboxProps = useCallback(
    (): SelectListboxProps => ({
      id: listboxId,
      role: "listbox",
      "aria-labelledby": triggerId,
      tabIndex: -1,
    }),
    [listboxId, triggerId],
  );

  const getOptionProps = useCallback(
    (item: T, index: number): SelectOptionProps => ({
      id: `${baseId}-option-${index}`,
      role: "option",
      "aria-selected": selectedItem?.id === item.id,
      "aria-disabled": item.disabled || undefined,
      onClick: () => {
        if (!item.disabled) {
          selectItem(item);
        }
      },
      onMouseEnter: () => {
        if (!item.disabled) {
          setHighlightedIndex(index);
        }
      },
    }),
    [baseId, selectedItem, selectItem],
  );

  return useMemo(
    () => ({
      isOpen,
      selectedItem,
      highlightedIndex,
      getTriggerProps,
      getListboxProps,
      getOptionProps,
      open,
      close,
      selectItem,
    }),
    [
      isOpen, selectedItem, highlightedIndex,
      getTriggerProps, getListboxProps, getOptionProps,
      open, close, selectItem,
    ],
  );
}
