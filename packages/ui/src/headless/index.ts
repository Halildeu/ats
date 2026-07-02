/* ------------------------------------------------------------------ */
/*  @ats/ui/headless — Public headless hooks & utilities    */
/*                                                                     */
/*  Behavior-only building blocks for custom components:               */
/*  state, accessibility, keyboard, focus, portal, overlay, ARIA.      */
/*  No styled components — pure logic & hooks.                         */
/* ------------------------------------------------------------------ */

// ---------------------------------------------------------------------------
// Interaction Core
// ---------------------------------------------------------------------------

// State Attributes
export { stateAttrs, stateSelector } from '../internal/interaction-core';
export type {
  StateAttributeOptions,
  StateAttributes,
  ComponentState,
  ComponentStatus,
} from '../internal/interaction-core';

// Focus Policy
export {
  focusRingClass,
  focusRingClassWithColor,
  defaultFocusStrategy,
  isKeyboardInteraction,
  FOCUS_TRAP_ATTR,
} from '../internal/interaction-core';
export type { FocusStrategy } from '../internal/interaction-core';

// Keyboard Contract
export {
  Keys,
  KEYBOARD_CONTRACTS,
  createKeyHandler,
  describeKeyboardContract,
} from '../internal/interaction-core';
export type {
  KeyConstant,
  KeyboardAction,
  KeyBinding,
  ComponentKeyboardContract,
} from '../internal/interaction-core';

// Event Guard
export { evaluateGuard, guardEvent, guardStyles, guardAria } from '../internal/interaction-core';
export type { EventGuardOptions, EventGuardResult } from '../internal/interaction-core';

// Semantic Intent
export { resolveKeyboardIntent, resolveClickIntent } from '../internal/interaction-core';
export type {
  SemanticIntent,
  NavigationDirection,
  ResolvedIntent,
} from '../internal/interaction-core';

// Access Controller
export {
  resolveAccessState,
  shouldBlockInteraction,
  withAccessGuard,
  accessStyles,
} from '../internal/interaction-core';
export type {
  AccessLevel,
  AccessControlledProps,
  AccessResolution,
} from '../internal/interaction-core';

// ---------------------------------------------------------------------------
// Overlay Engine
// ---------------------------------------------------------------------------

// Overlay Positioning
export {
  resolveOverlayPosition,
  resolveOverlayArrowPositionClassName,
} from '../internal/overlay-engine';
export type { OverlaySide, OverlayAlign, OverlayPosition } from '../internal/overlay-engine';

// Overlay Surface
export {
  OverlaySurface,
  premiumOverlayPanelClassName,
  premiumOverlayCloseButtonClassName,
} from '../internal/overlay-engine';
export type { OverlayCloseReason } from '../internal/overlay-engine';

// Layer Stack
// Codex 019ddf17 iter-47c — `isTopLayer` removed. Use
// `isTopFocusTrapLayer` (focus-trap gating) or
// `isTopDismissableLayer` (Escape / outside-click LIFO).
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
} from '../internal/overlay-engine';
export type { ZIndexLayer } from '../internal/overlay-engine';

// Focus Trap
export { useFocusTrap, FocusTrap } from '../internal/overlay-engine';
export type { UseFocusTrapOptions, FocusTrapProps } from '../internal/overlay-engine';

// Scroll Lock
export {
  useScrollLock,
  lockScroll,
  unlockScroll,
  getScrollLockCount,
  resetScrollLock,
} from '../internal/overlay-engine';

// Outside Click
export { useOutsideClick, useEscapeKey } from '../internal/overlay-engine';
export type { UseOutsideClickOptions } from '../internal/overlay-engine';

// ARIA Live
export { announce, useAnnounce, AriaLiveRegion } from '../internal/overlay-engine';
export type { AriaLivePoliteness } from '../internal/overlay-engine';

// Roving Tabindex
export { useRovingTabindex } from '../internal/overlay-engine';
export type {
  UseRovingTabindexOptions,
  RovingTabindexReturn,
  RovingDirection,
} from '../internal/overlay-engine';

// Portal (legacy + new)
export { Portal, useLegacyPortal, usePortal } from '../internal/overlay-engine';
export type { PortalProps, UsePortalOptions } from '../internal/overlay-engine';

// Portal Provider
export { PortalProvider, usePortalConfig } from '../internal/overlay-engine';

// Focus Restore
export { useFocusRestore } from '../internal/overlay-engine';

// Reduced Motion
export {
  useReducedMotion,
  prefersReducedMotion,
  motionDuration,
  REDUCED_MOTION_CLASS,
} from '../internal/overlay-engine';

// ---------------------------------------------------------------------------
// A11y Engine
// ---------------------------------------------------------------------------

// Audit
export { auditElement, auditComponent, getAuditRules } from '../a11y';

// Keyboard Testing
export {
  getKeyboardContract,
  testKeyboardNavigation,
  getSupportedComponentTypes,
  hasKeyboardContract,
} from '../a11y';

// Recommendations
export { getRecommendations, getComponentA11yChecklist, getSupportedChecklistTypes } from '../a11y';

// A11y Types
export type {
  A11yViolation,
  A11yAuditResult,
  KeyboardNavTest,
  A11yComponentReport,
  A11yComponentType,
  A11yRule,
  A11ySeverity,
} from '../a11y';

// ---------------------------------------------------------------------------
// Headless Hooks — State management hooks (no styling)
// ---------------------------------------------------------------------------

export {
  useAccordion,
  useCombobox,
  useDialog,
  useMenu,
  useSelect,
  useSlider,
  useTabs,
  useTooltip,
} from './hooks';

export type {
  UseAccordionOptions,
  AccordionTriggerProps,
  AccordionPanelProps,
  AccordionItemState,
  UseAccordionReturn,
  ComboboxItem,
  UseComboboxOptions,
  ComboboxInputProps,
  ComboboxListboxProps,
  ComboboxOptionProps,
  UseComboboxReturn,
  UseDialogOptions,
  DialogTriggerProps,
  DialogContentProps,
  DialogTitleProps,
  DialogDescriptionProps,
  UseDialogReturn,
  MenuItem,
  UseMenuOptions,
  MenuTriggerProps,
  MenuListProps,
  MenuItemProps,
  UseMenuReturn,
  SelectItem,
  UseSelectOptions,
  SelectTriggerProps,
  SelectListboxProps,
  SelectOptionProps,
  UseSelectReturn,
  UseSliderOptions,
  SliderTrackProps,
  SliderThumbProps,
  UseSliderReturn,
  TabItem,
  UseTabsOptions,
  TabListProps,
  TabProps,
  TabPanelProps,
  UseTabsReturn,
  UseTooltipOptions,
  TooltipTriggerProps,
  TooltipContentProps,
  UseTooltipReturn,
} from './hooks';
