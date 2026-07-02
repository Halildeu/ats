/* ------------------------------------------------------------------ */
/*  useMenu — Menu navigation hook                                     */
/*                                                                     */
/*  Manages menu state with typeahead search, arrow key navigation,   */
/*  nested menu support, and ARIA attributes per WAI-ARIA APG Menu    */
/*  pattern.                                                           */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface MenuItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Whether item has a submenu */
  hasSubmenu?: boolean;
}

export interface UseMenuOptions {
  /** Menu items */
  items: MenuItem[];
  /** Controlled open state */
  isOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Called when a menu item is activated */
  onAction?: (itemId: string) => void;
  /** Orientation: "vertical" (default) or "horizontal" */
  orientation?: "vertical" | "horizontal";
  /** Typeahead timeout in ms (default: 500) */
  typeaheadTimeout?: number;
  /** Whether this is a submenu */
  isSubmenu?: boolean;
}

export interface MenuTriggerProps {
  id: string;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface MenuListProps {
  id: string;
  role: "menu";
  "aria-labelledby": string;
  "aria-orientation": "vertical" | "horizontal";
  "aria-activedescendant": string | undefined;
  tabIndex: -1;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface MenuItemProps {
  id: string;
  role: "menuitem";
  "aria-disabled": boolean | undefined;
  "aria-haspopup": "menu" | undefined;
  tabIndex: number;
  onClick: () => void;
  onMouseEnter: () => void;
}

export interface UseMenuReturn {
  /** Whether the menu is open */
  isOpen: boolean;
  /** Currently highlighted index */
  highlightedIndex: number;
  /** Open the menu */
  open: () => void;
  /** Close the menu */
  close: () => void;
  /** Toggle the menu */
  toggle: () => void;
  /** Props for the trigger element */
  getTriggerProps: () => MenuTriggerProps;
  /** Props for the menu list container */
  getMenuProps: () => MenuListProps;
  /** Props for a menu item */
  getItemProps: (item: MenuItem, index: number) => MenuItemProps;
}

/* ---- Hook ---- */

export function useMenu(options: UseMenuOptions): UseMenuReturn {
  const {
    items,
    isOpen: controlledIsOpen,
    onOpenChange,
    onAction,
    orientation = "vertical",
    typeaheadTimeout = 500,
    isSubmenu = false,
  } = options;

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const menuId = `${baseId}-menu`;

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Typeahead state
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const updateOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalIsOpen(next);
      onOpenChange?.(next);
      if (!next) setHighlightedIndex(-1);
    },
    [isControlled, onOpenChange],
  );

  const open = useCallback(() => {
    updateOpen(true);
    setHighlightedIndex(0);
  }, [updateOpen]);

  const close = useCallback(() => updateOpen(false), [updateOpen]);
  const toggle = useCallback(() => {
    if (isOpen) close(); else open();
  }, [isOpen, open, close]);

  // Navigation
  const findNextEnabled = useCallback(
    (from: number, delta: number): number => {
      if (items.length === 0) return -1;
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

  // Typeahead
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
      }

      typeaheadTimerRef.current = setTimeout(() => {
        typeaheadRef.current = "";
      }, typeaheadTimeout);
    },
    [items, typeaheadTimeout],
  );

  const activateItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.disabled) return;
      if (item.hasSubmenu) return; // Submenus handle their own opening
      onAction?.(item.id);
      close();
    },
    [items, onAction, close],
  );

  // Key handler for menu navigation
  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const isVertical = orientation === "vertical";
      const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
      const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";

      switch (event.key) {
        case nextKey:
          event.preventDefault();
          setHighlightedIndex(findNextEnabled(highlightedIndex, 1));
          break;
        case prevKey:
          event.preventDefault();
          setHighlightedIndex(findNextEnabled(highlightedIndex, -1));
          break;
        case "Home":
          event.preventDefault();
          setHighlightedIndex(findNextEnabled(-1, 1));
          break;
        case "End":
          event.preventDefault();
          setHighlightedIndex(findNextEnabled(items.length, -1));
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          if (highlightedIndex >= 0) {
            activateItem(highlightedIndex);
          }
          break;
        case "Escape":
          event.preventDefault();
          close();
          break;
        case "ArrowRight":
          // For vertical menus, ArrowRight opens submenu
          if (isVertical && highlightedIndex >= 0 && items[highlightedIndex]?.hasSubmenu) {
            event.preventDefault();
            // Consumer handles submenu opening
          }
          break;
        case "ArrowLeft":
          // For vertical submenus, ArrowLeft closes
          if (isVertical && isSubmenu) {
            event.preventDefault();
            close();
          }
          break;
        default:
          // Typeahead
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            handleTypeahead(event.key);
          }
          break;
      }
    },
    [
      orientation, highlightedIndex, items, isSubmenu,
      findNextEnabled, activateItem, close, handleTypeahead,
    ],
  );

  // Prop getters
  const getTriggerProps = useCallback(
    (): MenuTriggerProps => ({
      id: triggerId,
      "aria-haspopup": "menu",
      "aria-expanded": isOpen,
      "aria-controls": menuId,
      onClick: toggle,
      onKeyDown: (event: React.KeyboardEvent) => {
        switch (event.key) {
          case "ArrowDown":
          case "Enter":
          case " ":
            event.preventDefault();
            open();
            break;
          case "ArrowUp":
            event.preventDefault();
            updateOpen(true);
            setHighlightedIndex(items.length > 0 ? items.length - 1 : -1);
            break;
        }
      },
    }),
    [triggerId, menuId, isOpen, toggle, open, updateOpen, items.length],
  );

  const getMenuProps = useCallback(
    (): MenuListProps => ({
      id: menuId,
      role: "menu",
      "aria-labelledby": triggerId,
      "aria-orientation": orientation,
      "aria-activedescendant":
        highlightedIndex >= 0
          ? `${baseId}-item-${highlightedIndex}`
          : undefined,
      tabIndex: -1,
      onKeyDown: handleMenuKeyDown,
    }),
    [menuId, triggerId, orientation, highlightedIndex, baseId, handleMenuKeyDown],
  );

  const getItemProps = useCallback(
    (item: MenuItem, index: number): MenuItemProps => ({
      id: `${baseId}-item-${index}`,
      role: "menuitem",
      "aria-disabled": item.disabled || undefined,
      "aria-haspopup": item.hasSubmenu ? "menu" : undefined,
      tabIndex: index === highlightedIndex ? 0 : -1,
      onClick: () => {
        if (!item.disabled) {
          activateItem(index);
        }
      },
      onMouseEnter: () => {
        if (!item.disabled) {
          setHighlightedIndex(index);
        }
      },
    }),
    [baseId, highlightedIndex, activateItem],
  );

  return useMemo(
    () => ({
      isOpen,
      highlightedIndex,
      open,
      close,
      toggle,
      getTriggerProps,
      getMenuProps,
      getItemProps,
    }),
    [isOpen, highlightedIndex, open, close, toggle, getTriggerProps, getMenuProps, getItemProps],
  );
}
