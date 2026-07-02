/* ------------------------------------------------------------------ */
/*  Scroll Lock — Body scroll prevention for overlays                  */
/*                                                                     */
/*  Prevents background scrolling when an overlay is open.             */
/*  Handles scroll position preservation and layout shift prevention.  */
/*                                                                     */
/*  Faz 2.3 — Scroll Lock                                              */
/* ------------------------------------------------------------------ */

import { useEffect, useRef } from "react";

/* ---- Core scroll lock functions ---- */

let lockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

/**
 * Locks body scroll. Supports nested calls — only the first call
 * actually locks, and only the last unlock restores.
 */
export function lockScroll(): void {
  if (typeof document === "undefined") return;

  lockCount += 1;
  if (lockCount > 1) return; // Already locked

  const body = document.body;
  const scrollbarWidth =
    typeof window !== "undefined"
      ? window.innerWidth - document.documentElement.clientWidth
      : 0;

  originalOverflow = body.style.overflow;
  originalPaddingRight = body.style.paddingRight;

  body.style.overflow = "hidden";

  // Prevent layout shift from scrollbar disappearing
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
}

/**
 * Unlocks body scroll. Only actually unlocks when all lock calls
 * have been balanced by unlock calls.
 */
export function unlockScroll(): void {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return; // Still locked by another consumer

  const body = document.body;
  body.style.overflow = originalOverflow;
  body.style.paddingRight = originalPaddingRight;
}

/**
 * Returns current lock count (for debugging).
 */
export function getScrollLockCount(): number {
  return lockCount;
}

/**
 * Force-resets scroll lock state. Only use in tests.
 */
export function resetScrollLock(): void {
  lockCount = 0;
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }
}

/* ---- React Hook ---- */

/**
 * Hook that locks body scroll while active.
 *
 * @example
 * ```tsx
 * function Modal({ open }) {
 *   useScrollLock(open);
 *   return open ? <div>Modal content</div> : null;
 * }
 * ```
 */
export function useScrollLock(active: boolean): void {
  const wasActive = useRef(false);

  useEffect(() => {
    if (active && !wasActive.current) {
      lockScroll();
      wasActive.current = true;
    } else if (!active && wasActive.current) {
      unlockScroll();
      wasActive.current = false;
    }

    return () => {
      if (wasActive.current) {
        unlockScroll();
        wasActive.current = false;
      }
    };
  }, [active]);
}
