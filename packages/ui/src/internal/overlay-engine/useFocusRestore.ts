/* ------------------------------------------------------------------ */
/*  Focus Restore — Save and restore focus for overlay components      */
/*                                                                     */
/*  Saves the currently focused element when the overlay opens,        */
/*  and restores focus to it when the overlay closes.                  */
/*                                                                     */
/*  Faz 2 — Overlay & Focus Engine                                     */
/*                                                                     */
/*  Codex 019ddf17 iter-47c — DEPRECATED.                              */
/*  Successor: `useFocusTrap({ active: open, restoreFocus: true })`    */
/*  which combines focus trap + restore in a single hook with          */
/*  layer-stack awareness (modal-over-X transfer chain), portable      */
/*  isHidden detection (jsdom + browser), and active=true→false        */
/*  transition handling.                                               */
/* ------------------------------------------------------------------ */

import { useRef, useEffect } from 'react';

let deprecationWarned = false;

/**
 * Saves the currently focused element when the overlay opens,
 * and restores focus to it when the overlay closes.
 *
 * @deprecated Codex 019ddf17 iter-47c — Use
 * {@link useFocusTrap}`({ active: isOpen, restoreFocus: true })` instead.
 * `useFocusTrap` combines initial focus + Tab containment + restore in
 * a single hook with layer-stack awareness (modal-over-X chain).
 *
 * Removal target: future major version. This hook still works
 * standalone but emits a one-time `console.warn` to surface the
 * migration path during development.
 *
 * @param isOpen - Whether the overlay is currently open
 *
 * @example Migration path
 * ```tsx
 * // Before
 * function Drawer({ open, children }) {
 *   useFocusRestore(open);
 *   return open ? <div>{children}</div> : null;
 * }
 *
 * // After
 * function Drawer({ open, children }) {
 *   const ref = useFocusTrap({ active: open, restoreFocus: true });
 *   return open ? <div ref={ref}>{children}</div> : null;
 * }
 * ```
 */
export function useFocusRestore(isOpen: boolean): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  // Codex 019ddf17 iter-47c — first-call-only deprecation warning.
  // Suppressed in production builds (NODE_ENV check) so end-users
  // don't see noise in their browser console.
  if (
    !deprecationWarned &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production'
  ) {
    deprecationWarned = true;

    console.warn(
      '[design-system] useFocusRestore is deprecated. ' +
        'Use useFocusTrap({ active: open, restoreFocus: true }) instead. ' +
        'Bkz. upstream design-system CHANGELOG (kaynak-pini: docs/frontend/mfe-start-gate.md). ' +
        'for migration guidance.',
    );
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (isOpen) {
      // Save the currently focused element
      triggerRef.current = document.activeElement as HTMLElement;
    } else if (triggerRef.current) {
      // Restore focus when closed
      // Use requestAnimationFrame to ensure DOM is ready
      const el = triggerRef.current;
      triggerRef.current = null;
      requestAnimationFrame(() => {
        el?.focus();
      });
    }
  }, [isOpen]);
}

/**
 * Test-only escape hatch. Codex 019ddf17 iter-47c — reset the
 * deprecation flag so individual unit tests can assert the warning
 * fires exactly once across runs without bleeding state. NOT exported
 * from the public surface; consumed only by `useFocusRestore.test.ts`.
 *
 * @internal
 */
export function _resetUseFocusRestoreDeprecationWarned(): void {
  deprecationWarned = false;
}
