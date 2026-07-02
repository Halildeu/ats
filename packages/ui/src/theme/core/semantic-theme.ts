/* ------------------------------------------------------------------ */
/*  Semantic theme — mode-agnostic contract                            */
/*                                                                     */
/*  Re-exports theme-controller types + the runtime contract from      */
/*  design-tokens/generated/theme-contract.json via the existing       */
/*  ui-kit runtime until full migration is complete.                   */
/* ------------------------------------------------------------------ */

export type ThemeAppearance = "light" | "dark" | "high-contrast";
export type ThemeDensity = "comfortable" | "compact";
export type ThemeRadius = "rounded" | "sharp";
export type ThemeElevation = "raised" | "flat";
export type ThemeMotion = "standard" | "reduced";
export type ThemeContrastRatio = "standard" | "aa" | "aaa";
export type ThemeAccent = string;
export type ThemeSurfaceTone = string;
export type TableSurfaceTone = "soft" | "normal" | "strong";

export type ThemeAxes = {
  appearance: ThemeAppearance;
  density: ThemeDensity;
  radius: ThemeRadius;
  elevation: ThemeElevation;
  motion: ThemeMotion;
  contrastRatio: ThemeContrastRatio;
  tableSurfaceTone: TableSurfaceTone;
  surfaceTone: ThemeSurfaceTone;
  accent: ThemeAccent;
  overlayIntensity: number;
  overlayOpacity: number;
};

export const DEFAULT_THEME_AXES: ThemeAxes = {
  appearance: "light",
  density: "comfortable",
  radius: "rounded",
  elevation: "raised",
  motion: "standard",
  contrastRatio: "standard",
  tableSurfaceTone: "normal",
  surfaceTone: "soft-1",
  accent: "light",
  overlayIntensity: 10,
  overlayOpacity: 10,
};

/** Data-attribute names used on <html> for CSS theme resolution */
export const THEME_ATTRIBUTE_MAP: Record<keyof ThemeAxes, string> = {
  appearance: "data-appearance",
  density: "data-density",
  radius: "data-radius",
  elevation: "data-elevation",
  motion: "data-motion",
  contrastRatio: "data-contrast-ratio",
  tableSurfaceTone: "data-table-surface-tone",
  surfaceTone: "data-surface-tone",
  accent: "data-accent",
  overlayIntensity: "data-overlay-intensity",
  overlayOpacity: "data-overlay-opacity",
};
