import { useCallback, useEffect, useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  useBreakpoint — Responsive breakpoint hook (SSR-safe)              */
/*                                                                     */
/*  Returns the current breakpoint name and comparison helpers.        */
/*  Uses window.matchMedia for efficient, event-driven updates.       */
/* ------------------------------------------------------------------ */

/** Canonical breakpoint scale (Tailwind-aligned). */
export const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

const ORDERED_KEYS: BreakpointKey[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];

export interface UseBreakpointReturn {
  /** Current active breakpoint name. */
  current: BreakpointKey;
  /** True if viewport is at or above the given breakpoint. */
  isAbove: (bp: BreakpointKey) => boolean;
  /** True if viewport is below the given breakpoint. */
  isBelow: (bp: BreakpointKey) => boolean;
  /** True if viewport matches the exact breakpoint range. */
  isExact: (bp: BreakpointKey) => boolean;
  /** Current viewport width in pixels. */
  width: number;
}

function resolveBreakpoint(width: number): BreakpointKey {
  for (let i = ORDERED_KEYS.length - 1; i >= 0; i--) {
    if (width >= BREAKPOINTS[ORDERED_KEYS[i]]) return ORDERED_KEYS[i];
  }
  return 'xs';
}

/**
 * Reactive responsive breakpoint hook. Returns the current breakpoint
 * name and comparison helpers (`isAbove`, `isBelow`, `isExact`).
 *
 * Uses `window.matchMedia` for efficient, event-driven updates — no
 * polling or resize listeners.
 *
 * @example
 * ```tsx
 * const { current, isAbove, isBelow } = useBreakpoint();
 * const columns = isAbove('lg') ? 3 : isAbove('md') ? 2 : 1;
 * ```
 *
 * @since 1.1.0
 */
export function useBreakpoint(): UseBreakpointReturn {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Build media queries for each breakpoint transition
    const queries = ORDERED_KEYS.slice(1).map((key) => ({
      key,
      mql: window.matchMedia(`(min-width: ${BREAKPOINTS[key]}px)`),
    }));

    const update = () => setWidth(window.innerWidth);

    for (const { mql } of queries) {
      mql.addEventListener('change', update);
    }
    // Initial sync
    update();

    return () => {
      for (const { mql } of queries) {
        mql.removeEventListener('change', update);
      }
    };
  }, []);

  const current = useMemo(() => resolveBreakpoint(width), [width]);

  const isAbove = useCallback(
    (bp: BreakpointKey) => width >= BREAKPOINTS[bp],
    [width],
  );

  const isBelow = useCallback(
    (bp: BreakpointKey) => width < BREAKPOINTS[bp],
    [width],
  );

  const isExact = useCallback(
    (bp: BreakpointKey) => {
      const idx = ORDERED_KEYS.indexOf(bp);
      const min = BREAKPOINTS[bp];
      const max = idx < ORDERED_KEYS.length - 1 ? BREAKPOINTS[ORDERED_KEYS[idx + 1]] : Infinity;
      return width >= min && width < max;
    },
    [width],
  );

  return { current, isAbove, isBelow, isExact, width };
}
