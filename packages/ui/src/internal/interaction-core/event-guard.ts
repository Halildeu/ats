/* ------------------------------------------------------------------ */
/*  Event Guard — Centralized event blocking & delegation              */
/*                                                                     */
/*  Provides a unified way to guard events based on component state    */
/*  (disabled, readonly, loading). Replaces ad-hoc preventDefault      */
/*  patterns scattered across components.                              */
/*                                                                     */
/*  Faz 1.4 — Event Guard                                              */
/* ------------------------------------------------------------------ */

import type React from "react";
import type { AccessLevel } from "../access-controller";

/* ---- Guard Options ---- */

export type EventGuardOptions = {
  /** Access level from access-controller */
  access?: AccessLevel;
  /** Externally disabled */
  disabled?: boolean;
  /** Loading state — blocks interaction */
  loading?: boolean;
  /** If true, allow event but mark as readonly (no state change) */
  allowReadonlyFocus?: boolean;
};

/* ---- Guard Result ---- */

export type EventGuardResult = {
  /** Should the event be completely blocked? */
  blocked: boolean;
  /** Is the component in a readonly state? */
  readonly: boolean;
  /** Is the component disabled? */
  disabled: boolean;
  /** Is the component loading? */
  loading: boolean;
  /** Reason for blocking (for debugging / aria) */
  reason?: "disabled" | "readonly" | "hidden" | "loading";
};

/**
 * Evaluates whether an event should be blocked based on component state.
 *
 * @example
 * ```ts
 * const guard = evaluateGuard({ access: "readonly", disabled: false });
 * if (guard.blocked) return;
 * ```
 */
export function evaluateGuard(options: EventGuardOptions): EventGuardResult {
  const { access = "full", disabled = false, loading = false } = options;

  if (disabled) {
    return { blocked: true, readonly: false, disabled: true, loading: false, reason: "disabled" };
  }

  if (loading) {
    return { blocked: true, readonly: false, disabled: false, loading: true, reason: "loading" };
  }

  if (access === "hidden") {
    return { blocked: true, readonly: false, disabled: false, loading: false, reason: "hidden" };
  }

  if (access === "disabled") {
    return { blocked: true, readonly: false, disabled: true, loading: false, reason: "disabled" };
  }

  if (access === "readonly") {
    return { blocked: true, readonly: true, disabled: false, loading: false, reason: "readonly" };
  }

  return { blocked: false, readonly: false, disabled: false, loading: false };
}

/**
 * Creates a guarded event handler that blocks events when interaction
 * is not allowed. Replaces `withAccessGuard` with a more ergonomic API.
 *
 * @example
 * ```tsx
 * const handleClick = guardEvent(
 *   { access, disabled, loading },
 *   (e) => { doSomething(); }
 * );
 * <button onClick={handleClick} />
 * ```
 */
export function guardEvent<E extends React.SyntheticEvent = React.SyntheticEvent>(
  options: EventGuardOptions,
  handler?: (event: E) => void,
): (event: E) => void {
  return (event: E) => {
    const guard = evaluateGuard(options);

    if (guard.blocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    handler?.(event);
  };
}

/**
 * Computes interaction CSS classes based on guard state.
 * Provides consistent cursor and opacity styling.
 *
 * @example
 * ```tsx
 * <label className={cn("...", guardStyles({ access, disabled }))}>
 * ```
 */
export function guardStyles(options: EventGuardOptions): string {
  const guard = evaluateGuard(options);

  if (guard.disabled || guard.loading) {
    return "cursor-not-allowed opacity-50 pointer-events-none";
  }

  if (guard.readonly) {
    return "cursor-default opacity-70";
  }

  return "cursor-pointer";
}

/**
 * Returns ARIA attributes appropriate for the guard state.
 *
 * @example
 * ```tsx
 * <input {...guardAria({ access: "readonly" })} />
 * // → { "aria-disabled": undefined, "aria-readonly": true }
 * ```
 */
export function guardAria(options: EventGuardOptions): Record<string, boolean | undefined> {
  const guard = evaluateGuard(options);

  return {
    "aria-disabled": guard.disabled || guard.loading || undefined,
    "aria-readonly": guard.readonly || undefined,
    "aria-busy": guard.loading || undefined,
  };
}
