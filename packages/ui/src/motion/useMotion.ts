'use client';
/* ------------------------------------------------------------------ */
/*  useMotion — token-driven animation hook                            */
/* ------------------------------------------------------------------ */

import { useMemo } from 'react';
import {
  duration as durationTokens,
  easing as easingTokens,
  type DurationKey,
  type EasingKey,
} from '../tokens/motion';
import {
  useReducedMotion,
} from '../internal/overlay-engine/reduced-motion';

export type MotionDuration = DurationKey;
export type MotionEasing = EasingKey;

/** Parse "200ms" → 200 */
function parseMs(value: string): number {
  return parseInt(value, 10) || 0;
}

export interface UseMotionOptions {
  duration?: MotionDuration;
  easing?: MotionEasing;
}

export interface UseMotionReturn {
  /** Duration in ms (0 if reduced motion). */
  duration: number;
  /** CSS easing string. */
  easing: string;
  /** True if animations should be disabled. */
  reducedMotion: boolean;
  /** CSS transition shorthand: `all {duration}ms {easing}`. */
  transition: string;
  /** Style object for inline use. */
  style: { transitionDuration: string; transitionTimingFunction: string };
}

/**
 * Hook that resolves motion tokens + reduced-motion preference.
 *
 * @example
 * ```tsx
 * function Panel() {
 *   const { transition, reducedMotion } = useMotion({ duration: 'normal' });
 *   return <div style={{ transition }}>...</div>;
 * }
 * ```
 */
export function useMotion(
  options: UseMotionOptions = {},
): UseMotionReturn {
  const { duration: durationKey = 'normal', easing: easingKey = 'default' } = options;
  const reducedMotion = useReducedMotion();

  return useMemo(() => {
    const rawDuration = parseMs(durationTokens[durationKey]);
    const easingValue = easingTokens[easingKey];
    const effectiveDuration = reducedMotion ? 0 : rawDuration;

    return {
      duration: effectiveDuration,
      easing: easingValue,
      reducedMotion,
      transition: effectiveDuration === 0
        ? 'none'
        : `all ${effectiveDuration}ms ${easingValue}`,
      style: {
        transitionDuration: `${effectiveDuration}ms`,
        transitionTimingFunction: easingValue,
      },
    };
  }, [durationKey, easingKey, reducedMotion]);
}
