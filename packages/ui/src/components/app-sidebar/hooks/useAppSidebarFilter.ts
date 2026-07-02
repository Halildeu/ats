import { useCallback, useEffect, useRef, useState } from 'react';
import type { SidebarFilterResult } from '../types';

const DEBOUNCE_MS = 300;

/**
 * Search / filter logic for sidebar items.
 *
 * - Debounces input by 300ms
 * - Provides a `match()` helper that returns character-index ranges for highlighting
 * - Clears on Escape
 */
export function useAppSidebarFilter(): SidebarFilterResult {
  const [raw, setRaw] = useState('');
  const [query, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  /* Debounce -------------------------------------------------------- */
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(raw);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [raw]);

  /* Escape to clear ------------------------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && raw) {
        setRaw('');
        setDebouncedQuery('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [raw]);

  /* Match helper ----------------------------------------------------- */
  const match = useCallback(
    (label: string): [number, number][] | null => {
      if (!query) return null;
      const lower = label.toLowerCase();
      const q = query.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx === -1) return null;
      return [[idx, idx + q.length]];
    },
    [query],
  );

  const clear = useCallback(() => {
    setRaw('');
    setDebouncedQuery('');
  }, []);

  return {
    query,
    setQuery: setRaw,
    clear,
    match,
    isFiltering: query.length > 0,
  };
}
