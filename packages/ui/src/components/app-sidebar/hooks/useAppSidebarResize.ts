import { useCallback, useState } from 'react';
import type { SidebarResizeState } from '../types';

const DEFAULT_STORAGE_KEY = 'sidebar-width';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function readStoredWidth(key: string, fallback: number): number {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    /* SSR or restricted storage */
  }
  return fallback;
}

function writeStoredWidth(key: string, width: number): void {
  try {
    globalThis.localStorage?.setItem(key, String(Math.round(width)));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

interface UseAppSidebarResizeOpts {
  /** Default expanded width (used as initial if nothing stored). */
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
}

interface UseAppSidebarResizeReturn {
  resizeState: SidebarResizeState;
  setWidth: (w: number) => void;
  setIsResizing: (v: boolean) => void;
}

export function useAppSidebarResize({
  defaultWidth,
  minWidth = 200,
  maxWidth = 500,
  storageKey = DEFAULT_STORAGE_KEY,
}: UseAppSidebarResizeOpts): UseAppSidebarResizeReturn {
  const [width, _setWidth] = useState<number>(() =>
    readStoredWidth(storageKey, defaultWidth),
  );
  const [isResizing, setIsResizing] = useState(false);

  const setWidth = useCallback(
    (w: number) => {
      const clamped = Math.min(maxWidth, Math.max(minWidth, w));
      _setWidth(clamped);
      writeStoredWidth(storageKey, clamped);
    },
    [storageKey, minWidth, maxWidth],
  );

  return {
    resizeState: { width, minWidth, maxWidth, isResizing },
    setWidth,
    setIsResizing,
  };
}
