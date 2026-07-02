'use client';
/* ------------------------------------------------------------------ */
/*  @ats/ui/motion — Animation & Motion System              */
/*                                                                     */
/*  Token-driven, a11y-aware animation utilities. Zero external deps.  */
/*  Respects prefers-reduced-motion automatically.                     */
/* ------------------------------------------------------------------ */

// Components
export { Transition } from './Transition';
export type { TransitionProps } from './Transition';

export { AnimatePresence } from './AnimatePresence';
export type { AnimatePresenceProps } from './AnimatePresence';

export { StaggerGroup } from './StaggerGroup';
export type { StaggerGroupProps } from './StaggerGroup';

// Hooks
export { useMotion } from './useMotion';
export type { UseMotionOptions, UseMotionReturn, MotionDuration, MotionEasing } from './useMotion';

// Presets
export {
  presets,
  fadeIn,
  fadeInSlow,
  zoomIn,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
  scaleUp,
} from './presets';
export type { AnimationPreset, PresetName } from './presets';

// Re-export reduced motion utilities for convenience
export {
  useReducedMotion,
  prefersReducedMotion,
  motionDuration,
  REDUCED_MOTION_CLASS,
} from '../internal/overlay-engine/reduced-motion';
