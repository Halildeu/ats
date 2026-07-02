/* ------------------------------------------------------------------ */
/*  ThemeProvider — theme switching, persistence, CSS var injection     */
/*                                                                     */
/*  Wraps the imperative theme-controller into a React context so      */
/*  any component can read / write the current theme axes.             */
/* ------------------------------------------------------------------ */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ThemeAxes, ThemeAppearance, ThemeDensity } from "../theme/core/semantic-theme";
import { DEFAULT_THEME_AXES, THEME_ATTRIBUTE_MAP } from "../theme/core/semantic-theme";
import { resolveThemeModeKey } from "../theme/core/theme-contract";

/* ---------- Storage ---------- */

const STORAGE_KEY = "themeAxes";

function loadStoredAxes(): Partial<ThemeAxes> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ThemeAxes>) : {};
  } catch {
    return {};
  }
}

function persistAxes(axes: ThemeAxes) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(axes));
  } catch {
    /* ignore */
  }
}

/* ---------- DOM application ---------- */

function applyAxesToDom(axes: ThemeAxes) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;

  for (const [key, attr] of Object.entries(THEME_ATTRIBUTE_MAP)) {
    root.setAttribute(attr, String(axes[key as keyof ThemeAxes]));
  }

  const isDark = axes.appearance === "dark" || axes.appearance === "high-contrast";
  root.setAttribute("data-mode", isDark ? "dark" : "light");
  root.setAttribute("data-theme", resolveThemeModeKey(axes));
  root.style.setProperty("--overlay-intensity", String(axes.overlayIntensity));
  root.style.setProperty("--overlay-opacity", (axes.overlayOpacity / 100).toString());
}

/* ---------- Context ---------- */

/** Value exposed by the theme context to consumers.
 * @example
 * ```tsx
 * <ThemeProvider />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/theme-provider)
 */
export interface ThemeContextValue {
  /** Current resolved theme axes. */
  axes: ThemeAxes;
  /** Merge a partial patch into the current theme axes. */
  update: (patch: Partial<ThemeAxes>) => void;
  /** Switch the appearance mode (e.g. light, dark, high-contrast). */
  setAppearance: (v: ThemeAppearance) => void;
  /** Switch the density level (e.g. compact, comfortable). */
  setDensity: (v: ThemeDensity) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/* ---------- Provider ---------- */

/** Props for {@link ThemeProvider}. */
export interface ThemeProviderProps {
  /** Override default axes (merged with stored and default values). */
  defaultAxes?: Partial<ThemeAxes>;
  /** Application content to wrap with the theme context. */
  children: React.ReactNode;
}

/** Theme context provider with persistent axis storage and CSS variable injection. */
export function ThemeProvider({ defaultAxes, children }: ThemeProviderProps) {
  const [axes, setAxes] = useState<ThemeAxes>(() => ({
    ...DEFAULT_THEME_AXES,
    ...defaultAxes,
    ...loadStoredAxes(),
  }));

  const update = useCallback((patch: Partial<ThemeAxes>) => {
    setAxes((prev) => {
      const next = { ...prev, ...patch };
      applyAxesToDom(next);
      persistAxes(next);
      return next;
    });
  }, []);

  const setAppearance = useCallback(
    (v: ThemeAppearance) => update({ appearance: v }),
    [update],
  );

  const setDensity = useCallback(
    (v: ThemeDensity) => update({ density: v }),
    [update],
  );

  // Apply on mount
  useEffect(() => {
    applyAxesToDom(axes);
  }, []); // mount-only: axes applied once on initial render

  const value = useMemo<ThemeContextValue>(
    () => ({ axes, update, setAppearance, setDensity }),
    [axes, update, setAppearance, setDensity],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

ThemeProvider.displayName = "ThemeProvider";
