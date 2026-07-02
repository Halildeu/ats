/* ------------------------------------------------------------------ */
/*  Contrast ratio tokens — WCAG-driven contrast adjustments          */
/*                                                                     */
/*  Provides border and text contrast multipliers for each WCAG level. */
/*  "standard" = no adjustment (default), "aa" and "aaa" progressively */
/*  increase contrast to meet WCAG 2.1 success criteria.               */
/* ------------------------------------------------------------------ */

export const contrastRatio = {
  standard: {
    /** No adjustment — uses default palette values */
    borderAlpha: 1,
    textAlpha: 1,
    /** Minimum contrast ratio target (informational) */
    minContrastText: 4.5,
    minContrastLargeText: 3,
    minContrastUI: 3,
  },
  aa: {
    /** WCAG 2.1 AA — enhanced border visibility */
    borderAlpha: 1.15,
    textAlpha: 1.1,
    minContrastText: 4.5,
    minContrastLargeText: 3,
    minContrastUI: 3,
  },
  aaa: {
    /** WCAG 2.1 AAA — maximum contrast for low-vision users */
    borderAlpha: 1.4,
    textAlpha: 1.25,
    minContrastText: 7,
    minContrastLargeText: 4.5,
    minContrastUI: 4.5,
  },
} as const;

export type ContrastRatioMode = keyof typeof contrastRatio;
