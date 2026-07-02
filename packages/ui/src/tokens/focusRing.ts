/* ------------------------------------------------------------------ */
/*  Focus ring tokens — accessible focus indicators                   */
/* ------------------------------------------------------------------ */

export const focusRing = {
  width: 2,
  offset: 2,
  color: "var(--focus-ring, var(--focus-outline, var(--accent-primary)))",
  style: "solid",
  /* Utility class */
  class:
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_30%,transparent)] focus-visible:ring-offset-2",
} as const;

export type FocusRingKey = keyof typeof focusRing;
