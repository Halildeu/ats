/* ------------------------------------------------------------------ */
/*  Layer Stack — z-index management for overlays                      */
/*                                                                     */
/*  Manages a stack of overlay layers to ensure proper z-index         */
/*  ordering without hardcoded z-index values. Each new overlay        */
/*  registers itself and gets an auto-incremented z-index.             */
/*                                                                     */
/*  Faz 2.1 — Layer Stack                                              */
/* ------------------------------------------------------------------ */

/* ---- Z-Index Scale ---- */

export const Z_INDEX_BASE = {
  /** Page content */
  content: 0,
  /** Sticky headers, floating action buttons */
  sticky: 100,
  /** Dropdown menus, tooltips */
  dropdown: 200,
  /**
   * Popover (default non-modal). Codex 019dde60 iter-47b1 — semantically
   * distinct from `dropdown` so the auto-close registry coming in
   * iter-47b2 can target popovers explicitly. Z-index band intentionally
   * shared with `dropdown` (visual stacking unchanged) per Codex review.
   */
  popover: 200,
  /** Modal overlays, drawers */
  modal: 300,
  /** Toast notifications */
  toast: 400,
  /** Top-most: spotlight, coachmarks */
  spotlight: 500,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX_BASE;

/**
 * Layer participation flags. Codex 019dde60 iter-47b1 — captures the
 * COMPONENT capability, not the runtime prop state. A modal that has
 * `disableFocusTrap=true` still registers as `participatesInFocusTrap:
 * true` (the consumer hook then chooses not to use the trap), keeping
 * the layer-stack semantic stable across props.
 */
export type LayerParticipation = {
  /**
   * Whether this layer should be considered when answering
   * `isTopFocusTrapLayer`. Default by type:
   *   modal  → true
   *   modal-style popover (enableFocusTrap=true) → true
   *   default popover, dropdown, toast → false
   */
  participatesInFocusTrap: boolean;
  /**
   * Whether this layer should be considered when answering
   * `isTopDismissableLayer` (Escape + outside-click LIFO). Default
   * by type:
   *   modal, dropdown, popover (default), modal-style popover → true
   *   toast → false (non-interactive overlay)
   */
  participatesInDismissal: boolean;
};

const DEFAULT_PARTICIPATION: Record<ZIndexLayer, LayerParticipation> = {
  content: { participatesInFocusTrap: false, participatesInDismissal: false },
  sticky: { participatesInFocusTrap: false, participatesInDismissal: false },
  dropdown: { participatesInFocusTrap: false, participatesInDismissal: true },
  popover: { participatesInFocusTrap: false, participatesInDismissal: true },
  modal: { participatesInFocusTrap: true, participatesInDismissal: true },
  toast: { participatesInFocusTrap: false, participatesInDismissal: false },
  spotlight: { participatesInFocusTrap: false, participatesInDismissal: false },
};

/* ---- Layer Stack Manager ---- */

/**
 * Options accepted by {@link registerLayer}. Codex 019ddf17 iter-47b2 —
 * extends the previous `Partial<LayerParticipation>` shape with two
 * additional fields used by the modal-over-X auto-close registry.
 *
 * - `autoCloseOnHigherLayer` — when a `modal` or `spotlight` layer
 *   registers above this entry, the registry calls this callback so the
 *   underlying dropdown/popover closes automatically (avoids hayalet
 *   half-open state hidden under the new modal).
 * - `restoreTarget` — DOM element focus should return to when this
 *   layer (or a higher modal that absorbed its restore chain) closes.
 *   Idempotent transfer: if a higher layer registers without an
 *   explicit `restoreTarget`, it inherits the oldest underlying entry's
 *   target; the modal's explicit `restoreTarget` is never overridden.
 */
export type LayerRegistrationOptions = Partial<LayerParticipation> & {
  autoCloseOnHigherLayer?: () => void;
  restoreTarget?: HTMLElement | null;
};

type LayerEntry = {
  id: string;
  layer: ZIndexLayer;
  zIndex: number;
  timestamp: number;
  participation: LayerParticipation;
  /** iter-47b2 — auto-close callback invoked when modal/spotlight stacks above. */
  autoCloseOnHigherLayer?: () => void;
  /** iter-47b2 — focus restore target (transferred up the modal-over-X chain). */
  restoreTarget: HTMLElement | null;
};

let stack: LayerEntry[] = [];
let counter = 0;

/**
 * Registers a new overlay layer and returns its z-index. Later
 * registrations within the same layer get higher z-indices.
 *
 * @example
 * ```ts
 * registerLayer("my-modal", "modal");                       // defaults
 * registerLayer("my-popover", "popover", {
 *   participatesInFocusTrap: true,                           // modal-style
 * });
 * registerLayer("my-drawer", "modal", {
 *   autoCloseOnHigherLayer: () => setOpen(false),
 *   restoreTarget: triggerRef.current,
 * });
 * ```
 *
 * Codex 019dde60 iter-47b1 — third `options` parameter overrides the
 * default participation flags for the chosen `layer` type. Backward-
 * compatible: existing two-arg calls keep their default participation.
 *
 * Codex 019ddf17 iter-47b2 — `options` widened to
 * {@link LayerRegistrationOptions}, accepting `autoCloseOnHigherLayer`
 * (modal-over-X registry callback) and `restoreTarget` (focus restore
 * chain). When `layer` is `modal` or `spotlight`, a snapshot of all
 * underlying dismissable dropdown/popover entries is taken first; the
 * new entry inherits the oldest underlying `restoreTarget` (idempotent:
 * never overrides an explicit modal-side target); then the snapshot's
 * `autoCloseOnHigherLayer` callbacks are invoked with try/catch
 * resilience. Snapshot semantics keep the behavior deterministic even
 * if a callback synchronously calls {@link unregisterLayer}.
 */
export function registerLayer(
  id: string,
  layer: ZIndexLayer = 'dropdown',
  options?: LayerRegistrationOptions,
): number {
  // Remove existing entry with same id (re-registration). Codex 019ddf17
  // iter-47b2 — re-register MUST NOT trigger the previous entry's
  // autoCloseOnHigherLayer (that was the entry's responsibility, now
  // gone). Just drop it.
  stack = stack.filter((entry) => entry.id !== id);

  counter += 1;
  const base = Z_INDEX_BASE[layer];
  const zIndex = base + counter;

  const participation: LayerParticipation = {
    ...DEFAULT_PARTICIPATION[layer],
    participatesInFocusTrap:
      options?.participatesInFocusTrap ?? DEFAULT_PARTICIPATION[layer].participatesInFocusTrap,
    participatesInDismissal:
      options?.participatesInDismissal ?? DEFAULT_PARTICIPATION[layer].participatesInDismissal,
  };

  const newEntry: LayerEntry = {
    id,
    layer,
    zIndex,
    timestamp: Date.now(),
    participation,
    autoCloseOnHigherLayer: options?.autoCloseOnHigherLayer,
    restoreTarget: options?.restoreTarget ?? null,
  };

  // Codex 019ddf17 iter-47b2 — modal-over-X auto-close registry.
  // Only `modal` and `spotlight` registrations trigger this; dropdown/
  // popover stacking among themselves does NOT cascade-close.
  if (layer === 'modal' || layer === 'spotlight') {
    // Snapshot first — callback may synchronously unregisterLayer; live
    // stack iteration would skip entries or visit stale state.
    const dismissibleLowers = stack
      .filter(
        (e) =>
          (e.layer === 'dropdown' || e.layer === 'popover') &&
          e.participation.participatesInDismissal &&
          e.zIndex < zIndex,
      )
      .slice();

    // Restore-target transfer chain (idempotent):
    //   - explicit modal restoreTarget → never overridden
    //   - otherwise inherit OLDEST underlying entry's restoreTarget
    //     (stack push order = registration order = oldest first), so
    //     the modal closes back to the original opener (not the
    //     intermediate dropdown's now-invisible menu item).
    if (newEntry.restoreTarget == null) {
      const firstWithRestore = dismissibleLowers.find((e) => e.restoreTarget != null);
      if (firstWithRestore) {
        newEntry.restoreTarget = firstWithRestore.restoreTarget;
      }
    }

    // Push the new entry BEFORE invoking callbacks so any nested
    // registerLayer calls inside a callback see the modal already in
    // place (correct z-index resolution).
    stack.push(newEntry);

    for (const entry of dismissibleLowers) {
      try {
        entry.autoCloseOnHigherLayer?.();
      } catch (err) {
        // Resilience — one buggy consumer must not block the rest.
        // Use console.error so test environments + production parity.
        console.error(`[layer-stack] auto-close callback failed for ${entry.id}:`, err);
      }
    }
  } else {
    stack.push(newEntry);
  }

  return zIndex;
}

/**
 * Unregisters a layer from the stack.
 */
export function unregisterLayer(id: string): void {
  stack = stack.filter((entry) => entry.id !== id);
}

/**
 * Returns the current top-most z-index across all layers.
 * Useful for ensuring a new overlay appears above everything.
 */
export function getTopZIndex(): number {
  if (stack.length === 0) return Z_INDEX_BASE.content;
  return Math.max(...stack.map((entry) => entry.zIndex));
}

/**
 * Returns whether the given layer id is the top-most layer that
 * participates in the keyboard focus trap. Codex 019dde60 iter-47b1.
 *
 * Use case: nested modals — only the topmost modal's `useFocusTrap`
 * should intercept Tab; the underlying modal's trap stays armed but
 * passes Tab through. Toasts and dropdowns never participate even if
 * their visual z-index is higher.
 */
export function isTopFocusTrapLayer(id: string): boolean {
  const eligible = stack.filter((e) => e.participation.participatesInFocusTrap);
  if (eligible.length === 0) return false;
  const top = eligible.reduce((best, entry) => (entry.zIndex > best.zIndex ? entry : best));
  return top.id === id;
}

/**
 * Returns whether the given layer id is the top-most layer that
 * participates in dismissal (Escape + outside-click). Codex 019dde60
 * iter-47b1.
 *
 * Use case: modal-over-popover — Escape should close the modal first,
 * then the popover. A toast on top of both does NOT consume Escape
 * because it doesn't participate in dismissal.
 */
export function isTopDismissableLayer(id: string): boolean {
  const eligible = stack.filter((e) => e.participation.participatesInDismissal);
  if (eligible.length === 0) return false;
  const top = eligible.reduce((best, entry) => (entry.zIndex > best.zIndex ? entry : best));
  return top.id === id;
}

/**
 * Returns the registered restore target for a layer, if any. Codex
 * 019ddf17 iter-47b2 — used by `useFocusTrap` to honor the
 * modal-over-X chain: a modal that inherited an underlying dropdown's
 * restore target will close back to the dropdown's original opener
 * (not the intermediate dropdown menu item, now invisible after
 * auto-close). Returns `null` when the layer is unknown OR has no
 * restore target.
 */
export function getRestoreTarget(id: string): HTMLElement | null {
  const entry = stack.find((e) => e.id === id);
  return entry?.restoreTarget ?? null;
}

/**
 * Sets/updates the restore target for an already-registered layer.
 * Codex 019ddf17 iter-47b2 — `useFocusTrap` calls this when its trap
 * activates so the layer-stack knows where to send focus after close;
 * a higher modal that registers later can then inherit this target via
 * the transfer chain. No-op if the layer id is unknown (registration
 * order: registerLayer first, then setLayerRestoreTarget).
 */
export function setLayerRestoreTarget(id: string, target: HTMLElement | null): void {
  const entry = stack.find((e) => e.id === id);
  if (entry) {
    entry.restoreTarget = target;
  }
}

/**
 * Returns the current stack for debugging purposes.
 */
export function getLayerStack(): readonly LayerEntry[] {
  return [...stack];
}

/**
 * Resets the layer stack. Only use in tests.
 */
export function resetLayerStack(): void {
  stack = [];
  counter = 0;
}
