/* ------------------------------------------------------------------ */
/*  Outside Click — Click-away detection for overlays                  */
/*                                                                     */
/*  Detects clicks outside a given element and fires a callback.       */
/*  Supports multiple refs (e.g., trigger + panel) and respects        */
/*  portal-mounted elements.                                           */
/*                                                                     */
/*  Faz 2.4 — Outside Click                                            */
/* ------------------------------------------------------------------ */

import { useEffect, useCallback, useRef } from 'react';
import type React from 'react';
// Codex 019dde60 iter-47b1 — layer-aware dismissal: when `layerId`
// is provided, the handlers (mousedown / Escape) check whether this
// layer is the topmost dismissable layer at event time. Lower layers
// stay registered but pass the event through, so a modal stacked on
// top of a popover doesn't fire BOTH outside-click handlers.
import { isTopDismissableLayer } from './layer-stack';

export type UseOutsideClickOptions = {
  /** Whether the listener is active */
  active: boolean;
  /** Callback when click outside is detected */
  onOutsideClick: (event: MouseEvent | TouchEvent) => void;
  /** Additional refs to exclude from "outside" detection */
  excludeRefs?: React.RefObject<HTMLElement | null>[];
  /**
   * Layer id from `registerLayer`. When provided, the handler only
   * fires when this layer is the topmost dismissable layer. Without
   * `layerId` the gate is disabled (backward-compatible).
   */
  layerId?: string;
};

/**
 * Hook that detects clicks outside a referenced element.
 *
 * @example
 * ```tsx
 * function Dropdown({ onClose }) {
 *   const ref = useOutsideClick({
 *     active: true,
 *     onOutsideClick: () => onClose(),
 *   });
 *   return <div ref={ref}>Dropdown content</div>;
 * }
 * ```
 */
export function useOutsideClick({
  active,
  onOutsideClick,
  excludeRefs = [],
  layerId,
}: UseOutsideClickOptions): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onOutsideClick);

  // Keep callback ref fresh to avoid stale closures
  useEffect(() => {
    callbackRef.current = onOutsideClick;
  }, [onOutsideClick]);

  const handleClick = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Codex 019dde60 iter-47b1 — top-layer gate at EVENT time.
      // Without this, a modal stacked on top of a popover would let
      // both layers fire outside-click and the popover would close
      // when the modal handles its own backdrop. The gate is opt-in
      // via `layerId`; legacy consumers without it keep the iter-45
      // behavior unchanged.
      if (layerId && !isTopDismissableLayer(layerId)) return;

      const target = event.target as Node;

      // Check if click is inside the container
      if (containerRef.current?.contains(target)) return;

      // Check if click is inside any excluded refs
      for (const ref of excludeRefs) {
        if (ref.current?.contains(target)) return;
      }

      callbackRef.current(event);
    },
    [excludeRefs, layerId],
  );

  useEffect(() => {
    if (!active) return;

    // Use mousedown instead of click for better UX
    // (fires before focus changes, preventing flash of unfocused state)
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('touchstart', handleClick, true);

    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('touchstart', handleClick, true);
    };
  }, [active, handleClick]);

  return containerRef;
}

/**
 * Hook for ESC key dismissal. Often used alongside outside-click.
 *
 * Codex 019dde60 iter-47b1 — `layerId` opts the consumer into
 * top-layer gated dismissal. When provided, Escape only fires (and
 * only consumes the event via preventDefault/stopPropagation) when
 * this layer is the topmost dismissable participant. Underlying
 * layers register but pass the event through, preserving LIFO close
 * order across nested overlays. Backward-compatible: legacy 2-arg
 * calls keep the iter-45 always-fires behavior.
 *
 * @example
 * ```tsx
 * useEscapeKey(isOpen, () => setIsOpen(false));                  // legacy
 * useEscapeKey(isOpen, () => setIsOpen(false), { layerId });      // gated
 * ```
 */
export function useEscapeKey(
  active: boolean,
  onEscape: () => void,
  options?: { layerId?: string },
): void {
  const callbackRef = useRef(onEscape);
  useEffect(() => {
    callbackRef.current = onEscape;
  }, [onEscape]);

  const layerId = options?.layerId;

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      // Codex 019dde60 iter-47b1 — Critical: when the gate excludes
      // us we MUST NOT preventDefault/stopPropagation. Doing so
      // would steal the topmost layer's Escape handling. The hook
      // simply opts out for non-top layers and leaves the event
      // for whoever IS top.
      if (layerId && !isTopDismissableLayer(layerId)) return;

      event.preventDefault();
      event.stopPropagation();
      callbackRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, layerId]);
}
