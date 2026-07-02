/* ------------------------------------------------------------------ */
/*  Focus Trap — Keyboard focus containment for overlays               */
/*                                                                     */
/*  Traps keyboard focus within a container element, preventing Tab    */
/*  from escaping to elements behind the overlay. Supports:            */
/*  - Auto-focus first focusable element on mount                      */
/*  - Wrap-around Tab navigation                                       */
/*  - Restore focus on unmount                                         */
/*  - Initial focus target override                                    */
/*                                                                     */
/*  Faz 2.2 — Focus Trap                                               */
/* ------------------------------------------------------------------ */

import React, { useEffect, useRef, useCallback } from 'react';
// Codex 019dde60 iter-47b1 — layer-aware gating: when the consumer
// passes `layerId`, the keydown handler checks `isTopFocusTrapLayer`
// at event time so a nested modal doesn't fight the outer modal's
// trap. Without `layerId` the hook keeps its iter-45 backwards-
// compatible behavior.
//
// Codex 019ddf17 iter-47b2 — `getRestoreTarget` honors the
// modal-over-X transfer chain (inherited dropdown opener), and
// `setLayerRestoreTarget` publishes the captured previousActiveElement
// so a higher modal can later inherit it. Both calls are no-ops
// when `layerId` is omitted (legacy callers).
import { getRestoreTarget, isTopFocusTrapLayer, setLayerRestoreTarget } from './layer-stack';

/* ---- Focusable element query ---- */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

/**
 * Detects whether an element is visually hidden via CSS or the HTML
 * `hidden` attribute. Codex 019dde20 iter-45 — replaces the previous
 * `offsetParent === null` check which depended on browser layout
 * (jsdom does not run layout, so every element appeared hidden during
 * tests, breaking trap behavior under unit tests). The new check is
 * environment-portable: it works in jsdom + browser identically and
 * matches the real-world cases that should keep elements out of the
 * Tab cycle.
 */
function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return elements.filter((el) => {
    if (isHidden(el)) return false;
    return !el.closest('[inert]');
  });
}

/* ---- Hook ---- */

export type UseFocusTrapOptions = {
  /** Whether the trap is active */
  active: boolean;
  /** Auto-focus first focusable element on activation */
  autoFocus?: boolean;
  /** Restore focus to previously focused element on deactivation */
  restoreFocus?: boolean;
  /** Ref to the element that should receive initial focus */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /**
   * Layer id from `registerLayer`. When provided, the Tab keydown
   * handler only intercepts when this layer is the top focus-trap
   * participant — nested modals can stack without the outer trap
   * stealing Tab from the inner one. Codex 019dde60 iter-47b1.
   * Backward-compatible: omitting layerId disables the gate.
   */
  layerId?: string;
};

/**
 * Focus trap hook for overlay components.
 *
 * @public Exported for consumer use in custom overlay implementations.
 *
 * @note Built-in overlay components (Dialog, Modal) use native `<dialog>`
 * focus trapping. DetailDrawer and FormDrawer use panel tabIndex for focus
 * containment. This hook is available for consumers building custom overlays
 * that need programmatic focus trapping.
 *
 * @example
 * ```tsx
 * function CustomOverlay({ isOpen, children }) {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   useFocusTrap(containerRef, isOpen);
 *   return <div ref={containerRef}>{children}</div>;
 * }
 * ```
 */
export function useFocusTrap({
  active,
  autoFocus = true,
  restoreFocus = true,
  initialFocusRef,
  layerId,
}: UseFocusTrapOptions): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef<boolean>(false);

  // Codex 019dde60 iter-47b1 — restore-once helper used by both the
  // active=true→false transition and the unmount cleanup. Sets the
  // previousFocusRef to null after firing so the same target isn't
  // focused twice (transition + unmount). Skips the focus call when
  // the target is no longer in the DOM (e.g. trigger removed by an
  // auto-close in the underlying layer).
  //
  // Codex 019ddf17 iter-47b2 — when `layerId` is provided, the
  // layer-stack restore target wins over the captured
  // previousActiveElement. This honors the modal-over-X transfer
  // chain: a modal that opened above a dropdown inherits the
  // dropdown's opener, so closing the modal returns focus to the
  // ORIGINAL opener, not the now-invisible dropdown menu item that
  // triggered it. Falls back to the captured ref if the layer-stack
  // has no transferred target (single-layer or non-chained case).
  const restoreToPreviousFocus = useCallback(() => {
    const layerTarget = layerId ? getRestoreTarget(layerId) : null;
    const target = layerTarget ?? previousFocusRef.current;
    if (!target) return;
    previousFocusRef.current = null;
    if (target.isConnected) {
      target.focus();
    }
  }, [layerId]);

  // Store the previously focused element when trap activates. Codex
  // 019ddf17 iter-47b2 — also publish to layer-stack so a later
  // modal-over-X can inherit this target if the trap consumer didn't
  // pass an explicit `restoreTarget` to `registerLayer`. Order
  // requirement (consumer side): registerLayer first, useFocusTrap
  // second — both happen synchronously in the open-effect chain so
  // this just-in-time publish is reliable.
  useEffect(() => {
    if (active && restoreFocus) {
      const previous = document.activeElement as HTMLElement;
      previousFocusRef.current = previous;
      if (layerId) {
        setLayerRestoreTarget(layerId, previous);
      }
    }
  }, [active, restoreFocus, layerId]);

  // Codex 019dde60 iter-47b1 — restore on active=true→false transition
  // (component still mounted). Without this, opener restore breaks for
  // overlays that flip `open` while staying mounted (the unmount
  // cleanup never fires). Combined with `restoreToPreviousFocus`
  // nulling the ref, the unmount path stays a no-op when active
  // already transitioned to false.
  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (wasActiveRef.current && restoreFocus) {
      // Slight delay so any async close-handler-driven DOM updates
      // settle before we try to focus the previous target.
      const t = setTimeout(() => {
        restoreToPreviousFocus();
      }, 0);
      wasActiveRef.current = false;
      return () => clearTimeout(t);
    }
  }, [active, restoreFocus, restoreToPreviousFocus]);

  // Auto-focus on activation
  useEffect(() => {
    if (!active || !autoFocus) return;

    // Small delay to ensure container is rendered
    const timeout = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // If no focusable elements, focus the container itself
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }, 50);

    return () => clearTimeout(timeout);
  }, [active, autoFocus, initialFocusRef]);

  // Restore focus on UNMOUNT (cleanup). Active-transition restore
  // above already handles the mounted-but-closed case; this branch
  // only fires when the consumer unmounts the trap entirely. The
  // ref-null guard from `restoreToPreviousFocus` prevents double
  // focus when both transition + unmount fire in quick succession.
  useEffect(() => {
    return () => {
      if (restoreFocus && previousFocusRef.current) {
        setTimeout(() => {
          restoreToPreviousFocus();
        }, 0);
      }
    };
  }, [restoreFocus, restoreToPreviousFocus]);

  // Tab trap handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!active || event.key !== 'Tab') return;

      // Codex 019dde60 iter-47b1 — event-time top-layer gate. When
      // multiple traps are attached (nested modals, modal-style
      // popover over modal), only the topmost focus-trap participant
      // should intercept Tab. Without `layerId` the gate is disabled
      // for backward compatibility with iter-45 consumers.
      // Important: when the gate excludes us we MUST NOT call
      // preventDefault — the underlying topmost layer needs a clean
      // event to handle.
      if (layerId && !isTopFocusTrapLayer(layerId)) return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];

      if (event.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === firstFocusable) {
          event.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === lastFocusable) {
          event.preventDefault();
          firstFocusable.focus();
        }
      }
    },
    [active, layerId],
  );

  // Attach/detach keydown listener
  useEffect(() => {
    if (!active) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);

  return containerRef;
}

/* ---- Component wrapper ---- */

/** Props for the FocusTrap component. */
export interface FocusTrapProps {
  /** Whether the trap is active */
  active: boolean;
  /** Auto-focus first element */
  autoFocus?: boolean;
  /** Restore focus on deactivation */
  restoreFocus?: boolean;
  /** Initial focus target */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Container className */
  className?: string;
  children: React.ReactNode;
}

/**
 * Component wrapper for focus trap.
 *
 * @example
 * ```tsx
 * <FocusTrap active={isOpen}>
 *   <div>Dialog content with trapped focus</div>
 * </FocusTrap>
 * ```
 */
export const FocusTrap: React.FC<FocusTrapProps> = ({
  active,
  autoFocus = true,
  restoreFocus = true,
  initialFocusRef,
  className,
  children,
}) => {
  const ref = useFocusTrap({ active, autoFocus, restoreFocus, initialFocusRef });

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      data-focus-trap={active ? '' : undefined}
    >
      {children}
    </div>
  );
};

FocusTrap.displayName = 'FocusTrap';
