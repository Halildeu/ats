/* ------------------------------------------------------------------ */
/*  Theme Controller — Runtime theme axis management                    */
/*                                                                     */
/*  Imperative state manager for theme axes. Persists to localStorage, */
/*  applies data-attributes + CSS custom properties on <html>, and     */
/*  notifies subscribers synchronously on every update.                */
/* ------------------------------------------------------------------ */

import {
  DEFAULT_THEME_AXES,
  THEME_ATTRIBUTE_MAP,
  type ThemeAppearance,
  type ThemeDensity,
  type ThemeRadius,
  type ThemeElevation,
  type ThemeMotion,
  type ThemeContrastRatio,
  type ThemeAccent,
  type ThemeSurfaceTone,
  type TableSurfaceTone,
  type ThemeAxes,
} from "./semantic-theme";
import { getThemeContract, resolveThemeModeKey } from "./theme-contract";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ThemeListener = (axes: ThemeAxes) => void;

const STORAGE_KEY = "themeAxes";

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getRoot = () =>
  typeof document !== "undefined" ? document.documentElement : null;

// ---------------------------------------------------------------------------
// Token-derived overlay configuration
// ---------------------------------------------------------------------------

type TokenValue = { value?: string | number };
type ModeToken = { modes?: Record<string, TokenValue> };

interface OverlayConfig {
  intensity: { min: number; max: number; default: number };
  opacity: { default: number };
}

/**
 * Extract overlay intensity/opacity config from design-tokens JSON.
 * Falls back to safe defaults when tokens aren't available.
 */
const loadOverlayConfig = (): OverlayConfig => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic JSON load with graceful fallback
    const tokens = require("../../../../../design-tokens/figma.tokens.json") as {
      semantic?: {
        color?: {
          overlay?: {
            intensity?: { min?: ModeToken; max?: ModeToken; default?: ModeToken };
            opacity?: { default?: ModeToken };
          };
        };
      };
    };

    const contract = getThemeContract();
    const preferredMode = contract.defaultMode;

    const pickValue = (node: ModeToken | undefined, fallback: number): number => {
      const modes = node?.modes;
      if (modes && Object.keys(modes).length > 0) {
        const candidate =
          (preferredMode ? modes[preferredMode] : undefined) ??
          Object.values(modes)[0];
        const raw = candidate?.value;
        const num =
          typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
        if (Number.isFinite(num)) return num;
      }
      return fallback;
    };

    const intensityNode = tokens.semantic?.color?.overlay?.intensity;
    const opacityNode = tokens.semantic?.color?.overlay?.opacity;

    return {
      intensity: {
        min: pickValue(intensityNode?.min, 0),
        max: pickValue(intensityNode?.max, 60),
        default: pickValue(intensityNode?.default, 10),
      },
      opacity: { default: pickValue(opacityNode?.default, 10) },
    };
  } catch {
    return {
      intensity: { min: 0, max: 60, default: 10 },
      opacity: { default: 10 },
    };
  }
};

const overlayConfig = loadOverlayConfig();

const overlayIntensityRange = {
  min: overlayConfig.intensity.min,
  max: overlayConfig.intensity.max,
};

const overlayOpacityRange = { min: 0, max: 100 };

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const loadStoredAxes = (): Partial<ThemeAxes> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<ThemeAxes>;
    return {
      appearance: parsed.appearance,
      density: parsed.density,
      radius: parsed.radius,
      elevation: parsed.elevation,
      motion: parsed.motion,
      contrastRatio: parsed.contrastRatio,
      tableSurfaceTone: parsed.tableSurfaceTone as TableSurfaceTone | undefined,
      surfaceTone: parsed.surfaceTone as ThemeSurfaceTone | undefined,
      accent: parsed.accent as ThemeAccent | undefined,
      overlayIntensity:
        typeof parsed.overlayIntensity === "number"
          ? parsed.overlayIntensity
          : undefined,
      overlayOpacity:
        typeof parsed.overlayOpacity === "number"
          ? parsed.overlayOpacity
          : undefined,
    };
  } catch {
    return {};
  }
};

const persistAxes = (axes: ThemeAxes) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(axes));
  } catch {
    // ignore storage errors
  }
};

// ---------------------------------------------------------------------------
// DOM application
// ---------------------------------------------------------------------------

const applyAxes = (axes: ThemeAxes) => {
  const root = getRoot();
  if (!root) return;

  root.setAttribute(THEME_ATTRIBUTE_MAP.appearance, axes.appearance);
  root.setAttribute(
    "data-mode",
    axes.appearance === "dark" || axes.appearance === "high-contrast"
      ? "dark"
      : "light",
  );
  root.setAttribute(THEME_ATTRIBUTE_MAP.density, axes.density);
  root.setAttribute(THEME_ATTRIBUTE_MAP.radius, axes.radius);
  root.setAttribute(THEME_ATTRIBUTE_MAP.elevation, axes.elevation);
  root.setAttribute(THEME_ATTRIBUTE_MAP.motion, axes.motion);
  root.setAttribute(THEME_ATTRIBUTE_MAP.contrastRatio, axes.contrastRatio);
  root.setAttribute(THEME_ATTRIBUTE_MAP.tableSurfaceTone, axes.tableSurfaceTone);
  root.setAttribute(THEME_ATTRIBUTE_MAP.surfaceTone, axes.surfaceTone);
  root.setAttribute(THEME_ATTRIBUTE_MAP.accent, axes.accent);
  root.setAttribute(
    THEME_ATTRIBUTE_MAP.overlayIntensity,
    String(axes.overlayIntensity),
  );
  root.setAttribute(
    THEME_ATTRIBUTE_MAP.overlayOpacity,
    String(axes.overlayOpacity),
  );
  root.style.setProperty("--overlay-intensity", String(axes.overlayIntensity));
  root.style.setProperty(
    "--overlay-opacity",
    (axes.overlayOpacity / 100).toString(),
  );
  root.setAttribute("data-theme", resolveThemeModeKey(axes));
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const listeners = new Set<ThemeListener>();
const storedAxes = loadStoredAxes();

let currentAxes: ThemeAxes = {
  ...DEFAULT_THEME_AXES,
  ...storedAxes,
  overlayIntensity: clampNumber(
    storedAxes.overlayIntensity ?? DEFAULT_THEME_AXES.overlayIntensity,
    overlayIntensityRange.min,
    overlayIntensityRange.max,
  ),
  overlayOpacity: clampNumber(
    storedAxes.overlayOpacity ?? DEFAULT_THEME_AXES.overlayOpacity,
    overlayOpacityRange.min,
    overlayOpacityRange.max,
  ),
  tableSurfaceTone: (storedAxes.tableSurfaceTone ??
    DEFAULT_THEME_AXES.tableSurfaceTone) as TableSurfaceTone,
};

const notify = () => {
  listeners.forEach((listener) => listener(currentAxes));
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns a snapshot of the current theme axes. */
export const getThemeAxes = (): ThemeAxes => currentAxes;

/**
 * Applies a partial patch to the current theme axes.
 * Numeric overlay values are automatically clamped to valid ranges.
 * Persists to localStorage, applies DOM attributes, and notifies listeners.
 */
export const updateThemeAxes = (patch: Partial<ThemeAxes>): ThemeAxes => {
  const next: ThemeAxes = {
    ...currentAxes,
    ...patch,
    overlayIntensity: clampNumber(
      patch.overlayIntensity ?? currentAxes.overlayIntensity,
      overlayIntensityRange.min,
      overlayIntensityRange.max,
    ),
    overlayOpacity: clampNumber(
      patch.overlayOpacity ?? currentAxes.overlayOpacity,
      overlayOpacityRange.min,
      overlayOpacityRange.max,
    ),
    tableSurfaceTone: (patch.tableSurfaceTone ??
      currentAxes.tableSurfaceTone) as TableSurfaceTone,
    surfaceTone: (patch.surfaceTone ??
      currentAxes.surfaceTone) as ThemeSurfaceTone,
  };
  currentAxes = next;
  applyAxes(next);
  persistAxes(next);
  notify();
  return next;
};

/**
 * Registers a listener for theme changes.
 * The listener is immediately called with current axes.
 * Returns an unsubscribe function.
 */
export const subscribeThemeAxes = (listener: ThemeListener): (() => void) => {
  listeners.add(listener);
  listener(getThemeAxes());
  return () => {
    listeners.delete(listener);
  };
};

// ---------------------------------------------------------------------------
// Convenience setters
// ---------------------------------------------------------------------------

export const setAppearance = (appearance: ThemeAppearance) =>
  updateThemeAxes({ appearance });
export const setDensity = (density: ThemeDensity) =>
  updateThemeAxes({ density });
export const setRadius = (radius: ThemeRadius) => updateThemeAxes({ radius });
export const setElevation = (elevation: ThemeElevation) =>
  updateThemeAxes({ elevation });
export const setMotion = (motion: ThemeMotion) => updateThemeAxes({ motion });
export const setContrastRatio = (contrastRatio: ThemeContrastRatio) =>
  updateThemeAxes({ contrastRatio });
export const setTableSurfaceTone = (tableSurfaceTone: TableSurfaceTone) =>
  updateThemeAxes({ tableSurfaceTone });
export const setSurfaceTone = (surfaceTone: ThemeSurfaceTone) =>
  updateThemeAxes({ surfaceTone });
export const setOverlayIntensity = (overlayIntensity: number) =>
  updateThemeAxes({ overlayIntensity });
export const setOverlayOpacity = (overlayOpacity: number) =>
  updateThemeAxes({ overlayOpacity });

// ---------------------------------------------------------------------------
// Option constants
// ---------------------------------------------------------------------------

const themeContract = getThemeContract();

export const THEME_APPEARANCE_OPTIONS: ThemeAppearance[] = (
  ["light", "dark", "high-contrast"] as ThemeAppearance[]
).filter((option) => {
  const resolved = themeContract.aliases?.appearance?.[option];
  return Boolean(resolved && themeContract.modes?.[resolved]);
});

export const THEME_DENSITY_OPTIONS: ThemeDensity[] = [
  "comfortable",
  "compact",
];
export const THEME_RADIUS_OPTIONS: ThemeRadius[] = ["rounded", "sharp"];
export const THEME_ELEVATION_OPTIONS: ThemeElevation[] = ["raised", "flat"];
export const THEME_MOTION_OPTIONS: ThemeMotion[] = ["standard", "reduced"];
export const THEME_CONTRAST_RATIO_OPTIONS: ThemeContrastRatio[] = [
  "standard",
  "aa",
  "aaa",
];

// Initial DOM application
applyAxes(currentAxes);
