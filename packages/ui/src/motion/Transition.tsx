'use client';
/* ------------------------------------------------------------------ */
/*  Transition — CSS class-based enter/exit animation component        */
/*                                                                     */
/*  Toggles enter/exit CSS classes and delays unmount until the exit   */
/*  animation completes. Zero external dependencies.                   */
/* ------------------------------------------------------------------ */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from '../internal/overlay-engine/reduced-motion';
import type { AnimationPreset, PresetName } from './presets';
import { presets } from './presets';

export interface TransitionProps {
  /** Whether the child is visible. */
  show: boolean;
  /** Animation preset name or custom preset object. */
  preset?: PresetName | AnimationPreset;
  /** Custom enter classes (overrides preset). */
  enter?: string;
  /** Custom exit classes (overrides preset). */
  exit?: string;
  /** Duration in ms for exit delay (overrides preset). */
  duration?: number;
  /** Called after exit animation completes and element is removed. */
  onExited?: () => void;
  /** Called after enter animation completes. */
  onEntered?: () => void;
  children: React.ReactElement;
  className?: string;
}

/**
 * Wraps a child element with enter/exit CSS animation classes.
 *
 * When `show` transitions from true→false, the exit classes are applied
 * and the child stays mounted until the animation duration elapses.
 *
 * @example
 * ```tsx
 * <Transition show={isOpen} preset="zoomIn">
 *   <div className="p-4">Content</div>
 * </Transition>
 * ```
 */
export function Transition({
  show,
  preset: presetProp = 'fadeIn',
  enter: enterOverride,
  exit: exitOverride,
  duration: durationOverride,
  onExited,
  onEntered,
  children,
  className,
}: TransitionProps) {
  const reducedMotion = useReducedMotion();

  const resolvedPreset: AnimationPreset =
    typeof presetProp === 'string' ? presets[presetProp] : presetProp;

  const enterClasses = enterOverride ?? resolvedPreset.enter;
  const exitClasses = exitOverride ?? resolvedPreset.exit;
  const animDuration = reducedMotion ? 0 : (durationOverride ?? resolvedPreset.duration);

  // Track mount state: 'entering' | 'entered' | 'exiting' | 'exited'
  const [state, setState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>(
    show ? 'entering' : 'exited',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();

    if (show) {
      setState('entering');
      timerRef.current = setTimeout(() => {
        setState('entered');
        onEntered?.();
      }, animDuration);
    } else if (state !== 'exited') {
      setState('exiting');
      timerRef.current = setTimeout(() => {
        setState('exited');
        onExited?.();
      }, animDuration);
    }

    return cleanup;
  }, [show]);

  // Don't render if fully exited
  if (state === 'exited' && !show) return null;

  const animClass =
    state === 'entering' || state === 'entered' ? enterClasses : exitClasses;

  return React.cloneElement(children, {
    className: [children.props.className, className, animClass]
      .filter(Boolean)
      .join(' '),
    style: {
      ...children.props.style,
      animationDuration: `${animDuration}ms`,
    },
  });
}

Transition.displayName = 'Transition';

/** Type alias for Transition ref. */
export type TransitionRef = React.Ref<HTMLElement>;
/** Type alias for Transition element. */
export type TransitionElement = HTMLElement;
/** Type alias for Transition cssproperties. */
export type TransitionCSSProperties = React.CSSProperties;
