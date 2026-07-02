/* ------------------------------------------------------------------ */
/*  Roving Tabindex — Keyboard navigation within widget groups         */
/*                                                                     */
/*  Implements the roving tabindex pattern (WAI-ARIA APG) for          */
/*  composite widgets like tabs, radio groups, menus, and toolbars.    */
/*  Only one item in the group is tabbable (tabindex=0); the rest     */
/*  have tabindex=-1 and are reachable via arrow keys.                 */
/*                                                                     */
/*  Faz 2.6 — Roving Tabindex                                         */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useMemo } from "react";
import type React from "react";

export type RovingDirection = "horizontal" | "vertical" | "both";

export type UseRovingTabindexOptions = {
  /** Total number of items */
  itemCount: number;
  /** Initial active index (default: 0) */
  initialIndex?: number;
  /** Arrow key direction */
  direction?: RovingDirection;
  /** Wrap around at ends */
  loop?: boolean;
  /** Called when active index changes */
  onActiveChange?: (index: number) => void;
  /** Disabled item indices */
  disabledIndices?: Set<number>;
};

export type RovingTabindexReturn = {
  /** Currently active (focused) index */
  activeIndex: number;
  /** Set active index programmatically */
  setActiveIndex: (index: number) => void;
  /** Get props for an item at the given index */
  getItemProps: (index: number) => {
    tabIndex: number;
    onKeyDown: (event: React.KeyboardEvent) => void;
    onFocus: () => void;
    "data-roving-active"?: string;
  };
  /** Move to next item */
  moveNext: () => void;
  /** Move to previous item */
  movePrev: () => void;
  /** Move to first item */
  moveFirst: () => void;
  /** Move to last item */
  moveLast: () => void;
};

/**
 * Hook implementing the roving tabindex pattern.
 *
 * @example
 * ```tsx
 * function TabList({ tabs }) {
 *   const roving = useRovingTabindex({
 *     itemCount: tabs.length,
 *     direction: "horizontal",
 *   });
 *
 *   return (
 *     <div role="tablist">
 *       {tabs.map((tab, i) => (
 *         <button key={tab.key} role="tab" {...roving.getItemProps(i)}>
 *           {tab.label}
 *         </button>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
/** Props returned for each roving item. */
export type RovingItemProps = ReturnType<RovingTabindexReturn['getItemProps']>;

export function useRovingTabindex({
  itemCount,
  initialIndex = 0,
  direction = "horizontal",
  loop = true,
  onActiveChange,
  disabledIndices = new Set(),
}: UseRovingTabindexOptions): RovingTabindexReturn {
  const [activeIndex, setActiveIndexState] = useState(initialIndex);

  const findNextEnabled = useCallback(
    (from: number, delta: number): number => {
      if (itemCount === 0) return from;

      let index = from;
      let attempts = 0;

      do {
        index += delta;

        if (loop) {
          index = ((index % itemCount) + itemCount) % itemCount;
        } else {
          index = Math.max(0, Math.min(itemCount - 1, index));
        }

        attempts++;

        // If we've checked all items and none are enabled, stay put
        if (attempts > itemCount) return from;
      } while (disabledIndices.has(index) && index !== from);

      return index;
    },
    [itemCount, loop, disabledIndices],
  );

  const setActiveIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < itemCount && !disabledIndices.has(index)) {
        setActiveIndexState(index);
        onActiveChange?.(index);
      }
    },
    [itemCount, onActiveChange, disabledIndices],
  );

  const moveNext = useCallback(() => {
    setActiveIndex(findNextEnabled(activeIndex, 1));
  }, [activeIndex, findNextEnabled, setActiveIndex]);

  const movePrev = useCallback(() => {
    setActiveIndex(findNextEnabled(activeIndex, -1));
  }, [activeIndex, findNextEnabled, setActiveIndex]);

  const moveFirst = useCallback(() => {
    setActiveIndex(findNextEnabled(-1, 1));
  }, [findNextEnabled, setActiveIndex]);

  const moveLast = useCallback(() => {
    setActiveIndex(findNextEnabled(itemCount, -1));
  }, [itemCount, findNextEnabled, setActiveIndex]);

  const getItemProps = useCallback(
    (index: number) => {
      const isActive = index === activeIndex;

      const handleKeyDown = (event: React.KeyboardEvent) => {
        let handled = false;

        switch (event.key) {
          case "ArrowRight":
            if (direction === "horizontal" || direction === "both") {
              moveNext();
              handled = true;
            }
            break;
          case "ArrowLeft":
            if (direction === "horizontal" || direction === "both") {
              movePrev();
              handled = true;
            }
            break;
          case "ArrowDown":
            if (direction === "vertical" || direction === "both") {
              moveNext();
              handled = true;
            }
            break;
          case "ArrowUp":
            if (direction === "vertical" || direction === "both") {
              movePrev();
              handled = true;
            }
            break;
          case "Home":
            moveFirst();
            handled = true;
            break;
          case "End":
            moveLast();
            handled = true;
            break;
        }

        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      const handleFocus = () => {
        if (!disabledIndices.has(index)) {
          setActiveIndex(index);
        }
      };

      return {
        tabIndex: isActive ? 0 : -1,
        onKeyDown: handleKeyDown,
        onFocus: handleFocus,
        ...(isActive ? { "data-roving-active": "" } : {}),
      };
    },
    [activeIndex, direction, moveNext, movePrev, moveFirst, moveLast, setActiveIndex, disabledIndices],
  );

  return useMemo(
    () => ({
      activeIndex,
      setActiveIndex,
      getItemProps,
      moveNext,
      movePrev,
      moveFirst,
      moveLast,
    }),
    [activeIndex, setActiveIndex, getItemProps, moveNext, movePrev, moveFirst, moveLast],
  );
}

/** Props interface alias for useRovingTabindex options. */
export interface UseRovingTabindexProps extends UseRovingTabindexOptions {}
