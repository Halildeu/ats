/**
 * @unstable These exports are NOT covered by semver guarantees.
 * They may change or be removed in any minor/patch release.
 * Prefer `@ats/ui/headless` for stable alternatives.
 *
 * Import path: `@ats/ui/unstable/overlay-engine`
 */

// Runtime warning removed — JSDoc @unstable tag + package.json export path
// provide sufficient signal. Internal DS modules import this heavily,
// making per-import console.warn too noisy for dev workflows.

/* ------------------------------------------------------------------ */
/*  Overlay Engine — Centralized overlay infrastructure                */
/*                                                                     */
/*  Provides all the building blocks for overlay-based components:     */
/*  portals, focus trapping, scroll locking, z-index management,       */
/*  outside click detection, positioning, a11y, and motion.            */
/*                                                                     */
/*  Faz 2 — Overlay & Focus Engine                                     */
/* ------------------------------------------------------------------ */

// Existing modules (pre-Faz 2)
export {
  resolveOverlayPosition,
  resolveOverlayArrowPositionClassName,
  type OverlaySide,
  type OverlayAlign,
  type OverlayPosition,
} from '../OverlayPositioning';

export {
  OverlaySurface,
  premiumOverlayPanelClassName,
  premiumOverlayCloseButtonClassName,
  type OverlayCloseReason,
} from '../OverlaySurface';

// Layer Stack — z-index management
//
// Codex 019ddf17 iter-47c — `isTopLayer` deprecated shim removed
// (was kept since iter-47b1 for compatibility). All consumers should
// use `isTopFocusTrapLayer` (focus-trap gating) or
// `isTopDismissableLayer` (Escape / outside-click LIFO) — these honor
// participation flags so a `toast` doesn't accidentally swallow
// Escape just because it has the highest z-index band.
export {
  registerLayer,
  unregisterLayer,
  getTopZIndex,
  isTopFocusTrapLayer,
  isTopDismissableLayer,
  getLayerStack,
  resetLayerStack,
  getRestoreTarget,
  setLayerRestoreTarget,
  Z_INDEX_BASE,
  type ZIndexLayer,
  type LayerParticipation,
  type LayerRegistrationOptions,
} from './layer-stack';

// Focus Trap — keyboard focus containment
export {
  useFocusTrap,
  FocusTrap,
  type UseFocusTrapOptions,
  type FocusTrapProps,
} from './focus-trap';

// Scroll Lock — body scroll prevention
export {
  useScrollLock,
  lockScroll,
  unlockScroll,
  getScrollLockCount,
  resetScrollLock,
} from './scroll-lock';

// Outside Click — click-away detection
export { useOutsideClick, useEscapeKey, type UseOutsideClickOptions } from './outside-click';

// ARIA Live — screen reader announcements
export { announce, useAnnounce, AriaLiveRegion, type AriaLivePoliteness } from './aria-live';

// Roving Tabindex — keyboard navigation in groups
export {
  useRovingTabindex,
  type UseRovingTabindexOptions,
  type RovingTabindexReturn,
  type RovingDirection,
} from './roving-tabindex';

// Portal — React portal wrapper (legacy)
export { Portal, usePortal as useLegacyPortal, type PortalProps } from './portal';

// Portal — Standardized portal hook (new)
export { usePortal, type UsePortalOptions } from './usePortal';

// Portal Provider — Global portal configuration
export { PortalProvider, usePortalConfig } from './PortalProvider';

// Focus Restore — save/restore focus for overlays
export { useFocusRestore } from './useFocusRestore';

// Sibling Isolation — inert background siblings while overlay is open
// Codex 019dde4e iter-47a — engine helpers + React hook with WeakMap
// ref-count + root-level containing-subtree exclusion. Sibling
// isolation makes screen readers and Tab order treat the rest of the
// page as background while a modal-style overlay is open.
export {
  acquireSiblingIsolation,
  releaseSiblingIsolation,
  useSiblingIsolation,
  type SiblingIsolationRecord,
} from './sibling-isolation';

// Reduced Motion — motion preference
export {
  useReducedMotion,
  prefersReducedMotion,
  motionDuration,
  REDUCED_MOTION_CLASS,
} from './reduced-motion';
