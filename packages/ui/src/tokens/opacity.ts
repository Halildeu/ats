/* ------------------------------------------------------------------ */
/*  Opacity tokens — state-based opacity values                       */
/* ------------------------------------------------------------------ */

export const opacity = {
  disabled: 0.5,
  readonly: 0.7,
  hover: 0.8,
  active: 0.9,
  placeholder: 0.5,
  overlay: 0.6,
  /* Surface overlays */
  overlayLight: 0.05,
  overlayMedium: 0.1,
  overlayHeavy: 0.2,
} as const;

export type OpacityKey = keyof typeof opacity;
