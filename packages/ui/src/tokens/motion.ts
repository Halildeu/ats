/* ------------------------------------------------------------------ */
/*  Motion tokens — duration & easing curves                           */
/* ------------------------------------------------------------------ */

export const duration = {
  instant: "0ms",
  fast: "100ms",
  normal: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export const easing = {
  default: "cubic-bezier(0.4, 0, 0.2, 1)",
  in: "cubic-bezier(0.4, 0, 1, 1)",
  out: "cubic-bezier(0, 0, 0.2, 1)",
  inOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
} as const;

export type DurationKey = keyof typeof duration;
export type EasingKey = keyof typeof easing;
