'use client';
/* ------------------------------------------------------------------ */
/*  AnimatePresence — tracks child mount/unmount for exit animations   */
/*                                                                     */
/*  Keeps children mounted during their exit animation. When a child   */
/*  is removed from the tree, AnimatePresence delays actual unmount    */
/*  until the animation duration elapses.                              */
/* ------------------------------------------------------------------ */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from '../internal/overlay-engine/reduced-motion';

export interface AnimatePresenceProps {
  /** Exit animation duration in ms. @default 150 */
  exitDuration?: number;
  /** Called when all exiting children have finished unmounting. */
  onExitComplete?: () => void;
  /** Dynamic children to track for mount/unmount animations. */
  children: React.ReactNode;
  /** Whether to skip animations entirely. When true, children unmount immediately. */
  disabled?: boolean;
  /** Whether to animate on initial mount. @default false */
  initial?: boolean;
  /** Mode controlling how enter/exit animations overlap. @default "sync" */
  mode?: "sync" | "wait" | "popLayout";
}

/**
 * Tracks child presence and delays unmount for exit animations.
 *
 * Wrap dynamic children (conditional renders, lists) with AnimatePresence
 * so they can animate out before removal.
 *
 * @example
 * ```tsx
 * <AnimatePresence exitDuration={200}>
 *   {isVisible && <FadePanel key="panel" />}
 * </AnimatePresence>
 * ```
 */
export function AnimatePresence({
  exitDuration = 150,
  onExitComplete,
  children,
}: AnimatePresenceProps) {
  const reducedMotion = useReducedMotion();
  const effectiveDuration = reducedMotion ? 0 : exitDuration;

  // Track which keys are currently in the DOM (including exiting)
  const [presentChildren, setPresentChildren] = useState<React.ReactNode>(children);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const currentKeys = new Set<string>();
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.key != null) {
        currentKeys.add(String(child.key));
      }
    });

    const prevKeys = new Set<string>();
    React.Children.forEach(presentChildren, (child) => {
      if (React.isValidElement(child) && child.key != null) {
        prevKeys.add(String(child.key));
      }
    });

    // Find removed children
    const removed = new Set<string>();
    for (const key of prevKeys) {
      if (!currentKeys.has(key)) {
        removed.add(key);
      }
    }

    if (removed.size === 0) {
      // No removals — update immediately
      setPresentChildren(children);
      return;
    }

    // Keep removed children mounted during exit
    // After duration, remove them
    cleanup();
    timerRef.current = setTimeout(() => {
      setPresentChildren(children);
      onExitComplete?.();
    }, effectiveDuration);

    return cleanup;
  }, [children]);

  return <>{presentChildren}</>;
}

AnimatePresence.displayName = 'AnimatePresence';

/** Type alias for AnimatePresence ref. */
export type AnimatePresenceRef = React.Ref<HTMLElement>;
/** Type alias for AnimatePresence element. */
export type AnimatePresenceElement = HTMLElement;
/** Type alias for AnimatePresence cssproperties. */
export type AnimatePresenceCSSProperties = React.CSSProperties;
