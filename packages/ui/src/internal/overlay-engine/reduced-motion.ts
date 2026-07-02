/* ------------------------------------------------------------------ */
/*  Reduced Motion — prefers-reduced-motion utility                    */
/*                                                                     */
/*  Provides a hook and utility for respecting the user's motion       */
/*  preference. Components should use this to disable or simplify      */
/*  animations when reduced motion is preferred.                       */
/*                                                                     */
/*  Faz 2.7 — Reduced Motion                                           */
/* ------------------------------------------------------------------ */

import { useState, useEffect } from "react";

/**
 * Returns true if the user prefers reduced motion.
 * Works in SSR (returns false on server).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Hook that reactively tracks the user's reduced motion preference.
 *
 * @example
 * ```tsx
 * function AnimatedPanel({ children }) {
 *   const reducedMotion = useReducedMotion();
 *   return (
 *     <div className={reducedMotion ? "transition-none" : "transition-all duration-300"}>
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handler = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };

    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}

/**
 * Returns a Tailwind className that disables transitions when
 * reduced motion is preferred. Can be used as a static class.
 */
export const REDUCED_MOTION_CLASS = "motion-reduce:transition-none motion-reduce:animate-none";

/**
 * Returns appropriate transition duration based on motion preference.
 *
 * @example
 * ```ts
 * const duration = motionDuration(300); // 300ms normally, 0ms with reduced motion
 * ```
 */
export function motionDuration(ms: number): number {
  return prefersReducedMotion() ? 0 : ms;
}
