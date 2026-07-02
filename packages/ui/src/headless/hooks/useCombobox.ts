/* ------------------------------------------------------------------ */
/*  useCombobox — Combobox state management hook                       */
/*                                                                     */
/*  Full combobox state machine: open/close, input value, filtered     */
/*  items, highlight index, selection, and keyboard navigation per     */
/*  WAI-ARIA APG Combobox pattern.                                     */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface ComboboxItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Whether item is disabled */
  disabled?: boolean;
}

export interface UseComboboxOptions<T extends ComboboxItem = ComboboxItem> {
  /** All available items */
  items: T[];
  /** Custom filter function (default: case-insensitive label match) */
  filter?: (item: T, inputValue: string) => boolean;
  /** Controlled selected item */
  selectedItem?: T | null;
  /** Default selected item (uncontrolled) */
  defaultSelectedItem?: T | null;
  /** Called when selection changes */
  onSelectedItemChange?: (item: T | null) => void;
  /** Controlled input value */
  inputValue?: string;
  /** Called when input value changes */
  onInputValueChange?: (value: string) => void;
  /** Controlled open state */
  isOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
}

export interface ComboboxInputProps {
  id: string;
  role: "combobox";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-activedescendant": string | undefined;
  "aria-autocomplete": "list";
  "aria-haspopup": "listbox";
  autoComplete: "off";
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export interface ComboboxListboxProps {
  id: string;
  role: "listbox";
  "aria-labelledby": string;
}

export interface ComboboxOptionProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  "aria-disabled": boolean | undefined;
  onClick: () => void;
  onMouseEnter: () => void;
}

export interface UseComboboxReturn<T extends ComboboxItem = ComboboxItem> {
  /** Whether the listbox is open */
  isOpen: boolean;
  /** Current input value */
  inputValue: string;
  /** Currently selected item */
  selectedItem: T | null;
  /** Filtered items based on input value */
  filteredItems: T[];
  /** Currently highlighted index in filtered list */
  highlightedIndex: number;
  /** Props for the input element */
  getInputProps: () => ComboboxInputProps;
  /** Props for the listbox container */
  getListboxProps: () => ComboboxListboxProps;
  /** Props for an option element */
  getOptionProps: (item: T, index: number) => ComboboxOptionProps;
  /** Open the listbox */
  open: () => void;
  /** Close the listbox */
  close: () => void;
  /** Set input value programmatically */
  setInputValue: (value: string) => void;
  /** Select an item programmatically */
  selectItem: (item: T | null) => void;
  /** Reset the combobox */
  reset: () => void;
}

/* ---- Default filter ---- */

function defaultFilter<T extends ComboboxItem>(item: T, inputValue: string): boolean {
  return item.label.toLowerCase().includes(inputValue.toLowerCase());
}

/* ---- Hook ---- */

export function useCombobox<T extends ComboboxItem = ComboboxItem>(
  options: UseComboboxOptions<T>,
): UseComboboxReturn<T> {
  const {
    items,
    filter = defaultFilter,
    selectedItem: controlledSelected,
    defaultSelectedItem = null,
    onSelectedItemChange,
    inputValue: controlledInputValue,
    onInputValueChange,
    isOpen: controlledIsOpen,
    onOpenChange,
  } = options;

  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;

  // Internal state
  const [internalSelected, setInternalSelected] = useState<T | null>(defaultSelectedItem);
  const [internalInputValue, setInternalInputValue] = useState(
    defaultSelectedItem?.label ?? "",
  );
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Resolve controlled/uncontrolled
  const isOpenControlled = controlledIsOpen !== undefined;
  const isOpen = isOpenControlled ? controlledIsOpen : internalIsOpen;

  const isSelectedControlled = controlledSelected !== undefined;
  const selectedItem = isSelectedControlled ? controlledSelected : internalSelected;

  const isInputControlled = controlledInputValue !== undefined;
  const inputValue = isInputControlled ? controlledInputValue : internalInputValue;

  // Filtered items
  const filteredItems = useMemo(
    () => (inputValue ? items.filter((item) => filter(item, inputValue)) : items),
    [items, inputValue, filter],
  );

  // Helpers
  const updateOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setInternalIsOpen(next);
      onOpenChange?.(next);
      if (!next) setHighlightedIndex(-1);
    },
    [isOpenControlled, onOpenChange],
  );

  const updateInputValue = useCallback(
    (next: string) => {
      if (!isInputControlled) setInternalInputValue(next);
      onInputValueChange?.(next);
    },
    [isInputControlled, onInputValueChange],
  );

  const selectItem = useCallback(
    (item: T | null) => {
      if (!isSelectedControlled) setInternalSelected(item);
      onSelectedItemChange?.(item);
      updateInputValue(item?.label ?? "");
      updateOpen(false);
    },
    [isSelectedControlled, onSelectedItemChange, updateInputValue, updateOpen],
  );

  const open = useCallback(() => updateOpen(true), [updateOpen]);
  const close = useCallback(() => updateOpen(false), [updateOpen]);

  const setInputValue = useCallback(
    (value: string) => updateInputValue(value),
    [updateInputValue],
  );

  const reset = useCallback(() => {
    selectItem(null);
    updateInputValue("");
    updateOpen(false);
  }, [selectItem, updateInputValue, updateOpen]);

  // Navigation
  const moveHighlight = useCallback(
    (delta: number) => {
      if (filteredItems.length === 0) return;
      setHighlightedIndex((prev) => {
        let next = prev + delta;
        // Skip disabled items
        let attempts = 0;
        while (attempts < filteredItems.length) {
          if (next < 0) next = filteredItems.length - 1;
          if (next >= filteredItems.length) next = 0;
          if (!filteredItems[next].disabled) return next;
          next += delta;
          attempts++;
        }
        return prev;
      });
    },
    [filteredItems],
  );

  // Prop getters
  const getInputProps = useCallback(
    (): ComboboxInputProps => ({
      id: inputId,
      role: "combobox",
      "aria-expanded": isOpen,
      "aria-controls": listboxId,
      "aria-activedescendant":
        isOpen && highlightedIndex >= 0
          ? `${baseId}-option-${highlightedIndex}`
          : undefined,
      "aria-autocomplete": "list",
      "aria-haspopup": "listbox",
      autoComplete: "off",
      value: inputValue,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const val = event.target.value;
        updateInputValue(val);
        if (!isOpen) updateOpen(true);
        setHighlightedIndex(-1);
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            if (!isOpen) {
              updateOpen(true);
              setHighlightedIndex(0);
            } else {
              moveHighlight(1);
            }
            break;
          case "ArrowUp":
            event.preventDefault();
            if (isOpen) {
              moveHighlight(-1);
            }
            break;
          case "Enter":
            if (isOpen && highlightedIndex >= 0 && filteredItems[highlightedIndex]) {
              event.preventDefault();
              selectItem(filteredItems[highlightedIndex]);
            }
            break;
          case "Escape":
            if (isOpen) {
              event.preventDefault();
              updateOpen(false);
            }
            break;
          case "Home":
            if (isOpen) {
              event.preventDefault();
              setHighlightedIndex(0);
            }
            break;
          case "End":
            if (isOpen) {
              event.preventDefault();
              setHighlightedIndex(filteredItems.length - 1);
            }
            break;
        }
      },
      onFocus: () => {
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
        }
      },
      onBlur: () => {
        blurTimeoutRef.current = setTimeout(() => {
          updateOpen(false);
        }, 200);
      },
    }),
    [
      inputId, listboxId, baseId, isOpen, highlightedIndex,
      inputValue, filteredItems, updateInputValue, updateOpen,
      moveHighlight, selectItem,
    ],
  );

  const getListboxProps = useCallback(
    (): ComboboxListboxProps => ({
      id: listboxId,
      role: "listbox",
      "aria-labelledby": inputId,
    }),
    [listboxId, inputId],
  );

  const getOptionProps = useCallback(
    (item: T, index: number): ComboboxOptionProps => ({
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
      inputValue,
      selectedItem,
      filteredItems,
      highlightedIndex,
      getInputProps,
      getListboxProps,
      getOptionProps,
      open,
      close,
      setInputValue,
      selectItem,
      reset,
    }),
    [
      isOpen, inputValue, selectedItem, filteredItems, highlightedIndex,
      getInputProps, getListboxProps, getOptionProps,
      open, close, setInputValue, selectItem, reset,
    ],
  );
}
