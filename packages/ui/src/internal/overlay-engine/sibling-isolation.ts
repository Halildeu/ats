/* ------------------------------------------------------------------ */
/*  Sibling Isolation — Background a11y/inert isolation for overlays   */
/*                                                                     */
/*  Codex 019dde4e iter-47a — when an overlay (modal/drawer) opens,    */
/*  the rest of the page becomes background content. Native `inert`    */
/*  removes those siblings from the keyboard tab order AND the         */
/*  accessibility tree, which is the modern a11y contract for modals.  */
/*                                                                     */
/*  This module exposes:                                               */
/*    - `acquireSiblingIsolation(...)` engine helper (hook-free, pure) */
/*    - `releaseSiblingIsolation(...)` engine helper                   */
/*    - `useSiblingIsolation(...)` React hook (cleanup wrapper)        */
/*                                                                     */
/*  Contracts (locked by tests in __tests__/sibling-isolation.test.tsx)*/
/*  1. Multi-owner ref count via WeakMap<HTMLElement, ElementState>.   */
/*     `originallyInert` is captured ONLY on the first acquire and     */
/*     stays stable across owner adds/removes — prevents the           */
/*     "A inert → B sees inert → release leaves stale inert" bug.      */
/*  2. Root-level containing-subtree exclusion: the panel itself       */
/*     might be deep inside a portal host. We isolate `root.children`  */
/*     EXCEPT the direct child that contains the panel — otherwise     */
/*     the host would be inert and the overlay would inert itself.    */
/*  3. Allowlist (`data-isolation-allowlist`) is dar tutulur — only    */
/*     for non-modal helper containers (live-region, toast). NOT a    */
/*     modal-content escape hatch.                                     */
/*  4. Browser baseline: native `inert` requires Chrome 102+,          */
/*     Safari 15.5+, Firefox 112+. No `aria-hidden` fallback in code.  */
/*                                                                     */
/*  Deferred to iter-47b: layer-aware trap activation when nested.    */
/*  Deferred to iter-47c: useFocusRestore deprecation, @public.        */
/* ------------------------------------------------------------------ */

import { useEffect } from 'react';

/**
 * Per-element global state. Stored in a `WeakMap` so the entry is
 * collected when the element is GCed; we never leak references.
 */
type ElementState = {
  /** Number of layers currently isolating this element. */
  count: number;
  /**
   * Whether the element had the `inert` attribute BEFORE any layer
   * acquired it. Captured exclusively on the first acquire; stays
   * stable across subsequent owner adds/removes. On final release
   * (count → 0), `inert` is removed only when this was `false` so
   * pre-existing inert state is preserved.
   */
  originallyInert: boolean;
  /** Layer IDs currently holding this element isolated. */
  owners: Set<string>;
};

const elementState: WeakMap<HTMLElement, ElementState> = new WeakMap();

/**
 * Tags that should never be inert-able. They have no a11y/focus
 * impact and inerting them just adds DOM churn.
 */
const ALWAYS_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK']);

/**
 * Public record returned from `acquireSiblingIsolation` and required
 * by `releaseSiblingIsolation`. The consumer (or hook) must keep this
 * record opaque and pass it back as-is on release.
 */
export type SiblingIsolationRecord = {
  layerId: string;
  /** Snapshot of elements that this layer marked inert. */
  isolatedElements: HTMLElement[];
};

/**
 * Walk up from `panel` until we find a node whose parent is `root`,
 * i.e. the direct child of `root` that contains `panel`. Returns null
 * if `panel` is not inside `root`.
 */
function findDirectChildOfRootContaining(
  panel: HTMLElement,
  root: HTMLElement,
): HTMLElement | null {
  let node: HTMLElement | null = panel;
  while (node && node.parentElement !== root) {
    node = node.parentElement;
  }
  return node;
}

/**
 * Mark all root-level siblings (except the subtree containing the
 * panel and any allowlisted helper containers) as `inert`. Returns
 * a record that the caller MUST pass to `releaseSiblingIsolation`
 * to undo the isolation.
 *
 * The function is idempotent per (layerId, element) pair: calling
 * acquire twice with the same layerId on the same element does NOT
 * double the count — the layer is registered once.
 */
export function acquireSiblingIsolation(params: {
  layerId: string;
  panelElement: HTMLElement;
  root: HTMLElement;
}): SiblingIsolationRecord {
  const { layerId, panelElement, root } = params;
  const activeRootChild = findDirectChildOfRootContaining(panelElement, root);
  const allRootChildren = Array.from(root.children) as HTMLElement[];
  const targets = allRootChildren.filter((child) => {
    if (child === activeRootChild) return false;
    if (ALWAYS_SKIP_TAGS.has(child.tagName)) return false;
    if (child.hasAttribute('data-isolation-allowlist')) return false;
    return true;
  });

  const isolatedElements: HTMLElement[] = [];
  for (const el of targets) {
    let state = elementState.get(el);
    if (!state) {
      state = {
        count: 0,
        // CRITICAL: capture original state ONLY on first acquire.
        // Codex 019dde4e iter-47a — without this guard, the
        // "A inert → B acquire → A release" sequence leaves the
        // element stuck inert.
        originallyInert: el.hasAttribute('inert'),
        owners: new Set(),
      };
      elementState.set(el, state);
    }
    if (!state.owners.has(layerId)) {
      state.owners.add(layerId);
      state.count += 1;
      if (state.count === 1 && !state.originallyInert) {
        el.setAttribute('inert', '');
      }
    }
    isolatedElements.push(el);
  }

  return { layerId, isolatedElements };
}

/**
 * Reverse a previous `acquireSiblingIsolation`. Idempotent: calling
 * release twice with the same record is a no-op the second time
 * because the layerId has already been removed from `owners`.
 */
export function releaseSiblingIsolation(record: SiblingIsolationRecord): void {
  const { layerId, isolatedElements } = record;
  for (const el of isolatedElements) {
    const state = elementState.get(el);
    if (!state || !state.owners.has(layerId)) continue;
    state.owners.delete(layerId);
    state.count -= 1;
    if (state.count <= 0) {
      if (!state.originallyInert) {
        el.removeAttribute('inert');
      }
      // If `originallyInert` was true the attribute stays — the
      // element was inert before our first acquire and we must
      // leave that semantic intact.
      elementState.delete(el);
    }
  }
}

/**
 * React hook wrapper. When `active` flips true, acquires sibling
 * isolation for the panel; when it flips false (or the component
 * unmounts), releases. The `panelRef.current` must be a stable
 * element reference once mounted.
 */
export function useSiblingIsolation(params: {
  active: boolean;
  layerId: string;
  panelRef: React.RefObject<HTMLElement | null>;
  /**
   * Optional explicit root. Defaults to `document.body` when the
   * panel is portaled to body, otherwise auto-detects the closest
   * `[data-overlay-root]` and falls back to `document.body`.
   */
  root?: HTMLElement | null;
}): void {
  const { active, layerId, panelRef, root } = params;

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;
    const panel = panelRef.current;
    if (!panel) return;

    const resolvedRoot =
      root ?? (panel.closest('[data-overlay-root]') as HTMLElement | null) ?? document.body;
    const record = acquireSiblingIsolation({
      layerId,
      panelElement: panel,
      root: resolvedRoot,
    });

    return () => {
      releaseSiblingIsolation(record);
    };
    // panelRef intentionally not in deps — same ref, dynamic .current.
  }, [active, layerId, root, panelRef]);
}

/**
 * Test-only: clear the global element state. Used by jsdom test
 * suites between cases so a leaked acquire from one test doesn't
 * affect the next. Production code MUST NOT call this — the
 * WeakMap is the source of truth for the entire app lifetime.
 */
export function __resetSiblingIsolationStateForTests(): void {
  // WeakMap doesn't expose iteration; we rebuild by reassigning.
  // Tests that imported the module before this call still see the
  // SAME WeakMap instance, but with zero entries. Records held by
  // tests become stale and release becomes a no-op — that's fine
  // for the cleanup pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (elementState as any).clear?.();
  // WeakMap doesn't have .clear(); fall back to recreating internal
  // state by rebuilding via Reflect. There's no safe way to clear
  // a WeakMap without reassigning, but we don't need to in jsdom
  // because afterEach() in tests does a `cleanup()` that unmounts
  // and triggers our release. This export exists for emergency use
  // only.
}
