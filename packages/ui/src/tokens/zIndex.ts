/* ------------------------------------------------------------------ */
/*  Z-index layer tokens                                               */
/* ------------------------------------------------------------------ */

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  backdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
  toast: 1700,
  commandPalette: 1800,
} as const;

export type ZIndexKey = keyof typeof zIndex;
