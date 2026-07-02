import { useCallback, useEffect, useState } from "react";
import { semanticColorTokens } from "../../tokens/color";
import { getThemeAxes, subscribeThemeAxes } from "../../theme/core/theme-controller";
import type { ThemeAxes } from "../../theme/core/semantic-theme";

/* ------------------------------------------------------------------ */
/*  Token Snapshot — resolved CSS variable values grouped by category  */
/* ------------------------------------------------------------------ */

export type TokenCategory = "surface" | "text" | "border" | "action" | "state";

export type ThemeTokenSnapshot = {
  surface: {
    default: string;
    canvas: string;
    muted: string;
    raised: string;
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
    inverse: string;
  };
  border: {
    default: string;
    subtle: string;
    strong: string;
  };
  action: {
    primary: string;
    primaryHover: string;
    primaryActive: string;
    secondary: string;
  };
  state: {
    successBg: string;
    successText: string;
    warningBg: string;
    warningText: string;
    errorBg: string;
    errorText: string;
    infoBg: string;
    infoText: string;
  };
  axes: ThemeAxes;
};

/* ------------------------------------------------------------------ */
/*  CSS variable → snapshot mapping                                    */
/* ------------------------------------------------------------------ */

function readTokensFromElement(el: HTMLElement): ThemeTokenSnapshot | null {
  const style = getComputedStyle(el);
  const read = (cssVar: string): string =>
    style.getPropertyValue(cssVar).trim();

  const surface = {
    default: read(semanticColorTokens["surface-default"]),
    canvas: read(semanticColorTokens["surface-canvas"]),
    muted: read(semanticColorTokens["surface-muted"]),
    raised: read(semanticColorTokens["surface-raised"]),
  };

  // If all surface values are empty, CSS variables are not available (SSR / jsdom)
  if (Object.values(surface).every((v) => !v)) return null;

  return {
    surface,
    text: {
      primary: read(semanticColorTokens["text-primary"]),
      secondary: read(semanticColorTokens["text-secondary"]),
      disabled: read(semanticColorTokens["text-disabled"]),
      inverse: read(semanticColorTokens["text-inverse"]),
    },
    border: {
      default: read(semanticColorTokens["border-default"]),
      subtle: read(semanticColorTokens["border-subtle"]),
      strong: read(semanticColorTokens["border-strong"]),
    },
    action: {
      primary: read(semanticColorTokens["action-primary"]),
      primaryHover: read(semanticColorTokens["action-primary-hover"]),
      primaryActive: read(semanticColorTokens["action-primary-active"]),
      secondary: read(semanticColorTokens["action-secondary"]),
    },
    state: {
      successBg: read(semanticColorTokens["state-success-bg"]),
      successText: read(semanticColorTokens["state-success-text"]),
      warningBg: read(semanticColorTokens["state-warning-bg"]),
      warningText: read(semanticColorTokens["state-warning-text"]),
      errorBg: read(semanticColorTokens["state-error-bg"]),
      errorText: read(semanticColorTokens["state-error-text"]),
      infoBg: read(semanticColorTokens["state-info-bg"]),
      infoText: read(semanticColorTokens["state-info-text"]),
    },
    axes: getThemeAxes(),
  };
}

/* ------------------------------------------------------------------ */
/*  Flat token list (for iteration in diff / swatch views)             */
/* ------------------------------------------------------------------ */

export type FlatToken = {
  category: TokenCategory;
  name: string;
  cssVar: string;
  value: string;
};

export function flattenTokens(snapshot: ThemeTokenSnapshot): FlatToken[] {
  const result: FlatToken[] = [];
  const categoryMap: Record<TokenCategory, Record<string, string>> = {
    surface: snapshot.surface,
    text: snapshot.text,
    border: snapshot.border,
    action: snapshot.action,
    state: snapshot.state,
  };

  for (const [category, tokens] of Object.entries(categoryMap)) {
    for (const [name, value] of Object.entries(tokens)) {
      const key = `${category}-${name.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      const cssVar =
        semanticColorTokens[key as keyof typeof semanticColorTokens] ??
        `--${key}`;
      result.push({
        category: category as TokenCategory,
        name,
        cssVar,
        value,
      });
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Reads live CSS custom property values from the DOM and returns a
 * categorized snapshot. Re-reads automatically when the global theme
 * axes change (appearance, density, accent, etc.).
 *
 * @param scopeRef  Element to read from. Defaults to `document.documentElement`.
 * @param fallback  Static fallback for SSR / test environments.
 */
export function useThemeTokens(
  scopeRef?: React.RefObject<HTMLElement | null>,
  fallback?: ThemeTokenSnapshot | null,
): ThemeTokenSnapshot | null {
  const [snapshot, setSnapshot] = useState<ThemeTokenSnapshot | null>(() => {
    if (typeof window === "undefined") return fallback ?? null;
    const el = scopeRef?.current ?? document.documentElement;
    return readTokensFromElement(el) ?? fallback ?? null;
  });

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = scopeRef?.current ?? document.documentElement;
    const next = readTokensFromElement(el);
    if (next) setSnapshot(next);
  }, [scopeRef]);

  // Re-read when theme axes change
  useEffect(() => {
    refresh();
    const unsubscribe = subscribeThemeAxes(refresh);
    return unsubscribe;
  }, [refresh]);

  // Re-read when scopeRef element changes (for scoped previews)
  useEffect(() => {
    if (!scopeRef?.current) return;
    const observer = new MutationObserver(refresh);
    observer.observe(scopeRef.current, {
      attributes: true,
      attributeFilter: ["data-appearance", "data-accent", "data-density", "style"],
    });
    return () => observer.disconnect();
  }, [scopeRef, refresh]);

  return snapshot;
}
