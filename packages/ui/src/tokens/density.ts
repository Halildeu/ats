/* ------------------------------------------------------------------ */
/*  Density tokens — compact / comfortable / spacious scales          */
/* ------------------------------------------------------------------ */

export const density = {
  compact: {
    controlHeight: { sm: 24, md: 28, lg: 32 },
    padding: { xs: 4, sm: 6, md: 8, lg: 10 },
    gap: { xs: 2, sm: 4, md: 6, lg: 8 },
    fontSize: { xs: 10, sm: 11, md: 12, lg: 13 },
    iconSize: { sm: 12, md: 14, lg: 16 },
  },
  comfortable: {
    controlHeight: { sm: 28, md: 32, lg: 40 },
    padding: { xs: 6, sm: 8, md: 12, lg: 16 },
    gap: { xs: 4, sm: 6, md: 8, lg: 12 },
    fontSize: { xs: 11, sm: 12, md: 13, lg: 14 },
    iconSize: { sm: 14, md: 16, lg: 20 },
  },
  spacious: {
    controlHeight: { sm: 32, md: 40, lg: 48 },
    padding: { xs: 8, sm: 12, md: 16, lg: 20 },
    gap: { xs: 6, sm: 8, md: 12, lg: 16 },
    fontSize: { xs: 12, sm: 13, md: 14, lg: 16 },
    iconSize: { sm: 16, md: 20, lg: 24 },
  },
} as const;

export type DensityMode = keyof typeof density;
