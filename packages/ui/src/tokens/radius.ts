/* ------------------------------------------------------------------ */
/*  Border radius tokens                                               */
/* ------------------------------------------------------------------ */

export const radius = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "20px",
  "3xl": "24px",
  full: "9999px",
} as const;

export type RadiusKey = keyof typeof radius;
