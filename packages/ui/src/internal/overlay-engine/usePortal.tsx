/* ------------------------------------------------------------------ */
/*  usePortal — Standardized portal behavior for overlay components    */
/*                                                                     */
/*  Creates a dedicated container div, appends it to a target          */
/*  (defaults to document.body), and cleans up on unmount. Returns     */
/*  a Portal wrapper component and a ref to the container element.     */
/*                                                                     */
/*  Faz 2.9 — Standardized Portal                                     */
/*                                                                     */
/*  Codex 019ddf17 iter-47c — `layerId` option aligns the portal       */
/*  container's inline `z-index` with the value returned by            */
/*  `registerLayer`, so the visual stacking order matches the          */
/*  layer-stack semantic ordering. Portal root itself does NOT         */
/*  re-register as a layer; the consumer's `registerLayer` call is     */
/*  the single source of truth. Fully optional: omitting `layerId`     */
/*  preserves the previous behavior (browser default stacking).        */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getLayerStack } from './layer-stack';

export interface UsePortalOptions {
  /** Whether to use a portal. @default true */
  enabled?: boolean;
  /** Custom container element. @default document.body */
  container?: HTMLElement | null;
  /** HTML id attribute for the portal container div. */
  id?: string;
  /** CSS class name applied to the portal container div. */
  className?: string;
  /** Callback fired when the portal container is attached to the DOM. */
  onReady?: (container: HTMLDivElement) => void;
  /** Whether to remove the container from the DOM on cleanup. @default true */
  autoCleanup?: boolean;
  /**
   * Layer id from `registerLayer`. Codex 019ddf17 iter-47c — when
   * provided, the portal container's inline `z-index` is set to the
   * matching layer-stack entry's z-index. The consumer is responsible
   * for calling `registerLayer` (this hook does NOT re-register the
   * portal as its own layer); usePortal only mirrors the registered
   * z-index onto the portal root so visual stacking aligns with the
   * dismissal/focus-trap semantic order. Omit to keep the previous
   * default-stacking behavior.
   */
  layerId?: string;
}

/**
 * Standardized portal behavior for overlay components.
 * Creates a dedicated container div and cleans up on unmount.
 *
 * @public
 *
 * @example
 * ```tsx
 * function Overlay({ children }) {
 *   const { Portal } = usePortal();
 *   return (
 *     <Portal>
 *       <div className="overlay">{children}</div>
 *     </Portal>
 *   );
 * }
 *
 * // Render inline (no portal)
 * function InlineOverlay({ children }) {
 *   const { Portal } = usePortal({ enabled: false });
 *   return <Portal>{children}</Portal>;
 * }
 *
 * // Layer-aligned portal (iter-47c)
 * function LayerAlignedOverlay({ children }) {
 *   const layerId = useId();
 *   useEffect(() => {
 *     registerLayer(layerId, 'modal');
 *     return () => unregisterLayer(layerId);
 *   }, [layerId]);
 *   const { Portal } = usePortal({ layerId });
 *   return <Portal>{children}</Portal>;
 * }
 * ```
 */
export function usePortal(options: UsePortalOptions = {}) {
  const { enabled = true, container, id, layerId } = options;
  const portalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const target = container ?? document.body;
    const el = document.createElement('div');
    if (id) el.id = id;
    el.setAttribute('data-portal', 'true');
    target.appendChild(el);
    portalRef.current = el;

    return () => {
      if (el.parentNode === target) {
        target.removeChild(el);
      }
      portalRef.current = null;
    };
  }, [enabled, container, id]);

  // Codex 019ddf17 iter-47c — mirror the registered layer's z-index
  // onto the portal root so visual stacking matches the layer-stack
  // semantic order. Re-runs whenever the layerId changes; the portal
  // ref must already be populated by the mount effect above.
  // Single source of truth: `registerLayer` decides z-index; this
  // effect only PROJECTS that value, never registers a new layer.
  useEffect(() => {
    if (!enabled || !layerId) return;
    const el = portalRef.current;
    if (!el) return;
    const entry = getLayerStack().find((e) => e.id === layerId);
    if (entry) {
      el.style.zIndex = String(entry.zIndex);
    }
  }, [enabled, layerId]);

  const Portal: React.FC<{ children: React.ReactNode }> = useCallback(
    ({ children }) => {
      if (!enabled) return <>{children}</>;
      if (!portalRef.current) return null;
      return createPortal(children, portalRef.current);
    },
    [enabled],
  );

  return { Portal, portalElement: portalRef };
}

/** Return type of the usePortal hook. */
export type UsePortalReturn = ReturnType<typeof usePortal>;

/** Props alias for usePortal options. */
export type UsePortalProps = UsePortalOptions;
/** Portal container element type. */
export type PortalContainerElement = HTMLDivElement;
