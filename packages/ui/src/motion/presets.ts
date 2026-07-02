/* ------------------------------------------------------------------ */
/*  Animation Presets — reusable animation configurations               */
/*                                                                     */
/*  Each preset defines CSS classes for enter and exit states.          */
/*  Consumed by <Transition> and useMotion().                           */
/* ------------------------------------------------------------------ */

export interface AnimationPreset {
  /** CSS classes applied during enter animation. */
  enter: string;
  /** CSS classes applied during exit animation. */
  exit: string;
  /** Default duration in ms. */
  duration: number;
}

export const fadeIn: AnimationPreset = {
  enter: 'animate-in fade-in-0',
  exit: 'animate-out fade-out-0',
  duration: 150,
};

export const fadeInSlow: AnimationPreset = {
  enter: 'animate-in fade-in-0',
  exit: 'animate-out fade-out-0',
  duration: 300,
};

export const zoomIn: AnimationPreset = {
  enter: 'animate-in fade-in-0 zoom-in-95',
  exit: 'animate-out fade-out-0 zoom-out-95',
  duration: 150,
};

export const slideUp: AnimationPreset = {
  enter: 'animate-in fade-in-0 slide-in-from-bottom-2',
  exit: 'animate-out fade-out-0 slide-out-to-bottom-2',
  duration: 200,
};

export const slideDown: AnimationPreset = {
  enter: 'animate-in fade-in-0 slide-in-from-top-2',
  exit: 'animate-out fade-out-0 slide-out-to-top-2',
  duration: 200,
};

export const slideLeft: AnimationPreset = {
  enter: 'animate-in fade-in-0 slide-in-from-right-full',
  exit: 'animate-out fade-out-0 slide-out-to-right-full',
  duration: 300,
};

export const slideRight: AnimationPreset = {
  enter: 'animate-in fade-in-0 slide-in-from-left-full',
  exit: 'animate-out fade-out-0 slide-out-to-left-full',
  duration: 300,
};

export const scaleUp: AnimationPreset = {
  enter: 'animate-in zoom-in-90',
  exit: 'animate-out zoom-out-90',
  duration: 200,
};

/**
 * All presets as a map for programmatic access.
 */
export const presets = {
  fadeIn,
  fadeInSlow,
  zoomIn,
  slideUp,
  slideDown,
  slideLeft,
  slideRight,
  scaleUp,
} as const;

export type PresetName = keyof typeof presets;
