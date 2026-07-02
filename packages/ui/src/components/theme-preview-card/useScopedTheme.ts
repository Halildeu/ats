import { useMemo } from "react";
import {
  THEME_ATTRIBUTE_MAP,
  type ThemeAxes,
} from "../../theme/core/semantic-theme";
import { getThemeAxes } from "../../theme/core/theme-controller";
import { lightTheme } from "../../theme/core/light";
import { darkTheme } from "../../theme/core/dark";
import type { SemanticTokenSet } from "../../tokens/semantic";

/* ------------------------------------------------------------------ */
/*  useScopedTheme — apply theme axes to a subtree container           */
/* ------------------------------------------------------------------ */

export type ScopedThemeResult = {
  /** Data-attribute spread for the scoped container div. */
  attrs: Record<string, string>;
  /** Inline style fallback (CSS variables) for when data-attribute
   *  scoping doesn't trigger CSS variable recalculation. */
  style: React.CSSProperties;
  /** The resolved full axes (merged with global defaults). */
  axes: ThemeAxes;
};

/**
 * Generates data-attributes and fallback inline styles for scoped
 * theme previews. Spread `attrs` on a container `<div>` so that
 * child elements inherit the scoped theme via CSS variables.
 *
 * If the design-token CSS rules only target `html[data-appearance]`,
 * the data-attribute approach won't cascade. In that case, also spread
 * `style` on the container to set CSS variables via inline styles.
 *
 * @example
 * ```tsx
 * const scoped = useScopedTheme({ appearance: 'dark', accent: 'violet' });
 * <div {...scoped.attrs} style={scoped.style}>
 *   <ThemePreviewCard />
 * </div>
 * ```
 */
export function useScopedTheme(
  overrides?: Partial<ThemeAxes> | null,
): ScopedThemeResult {
  return useMemo(() => {
    const globalAxes = getThemeAxes();
    const axes: ThemeAxes = overrides
      ? { ...globalAxes, ...overrides }
      : globalAxes;

    // Build data-attributes from THEME_ATTRIBUTE_MAP
    const attrs: Record<string, string> = {
      "data-component-scope": "theme-preview",
    };
    for (const [key, attrName] of Object.entries(THEME_ATTRIBUTE_MAP)) {
      const value = axes[key as keyof ThemeAxes];
      if (value !== undefined) {
        attrs[attrName] = String(value);
      }
    }

    // Build inline style fallback from static theme objects
    const themeObj: SemanticTokenSet =
      axes.appearance === "dark" || axes.appearance === "high-contrast"
        ? darkTheme
        : lightTheme;

    const style: React.CSSProperties = {
      "--surface-default": themeObj.surfaceDefault,
      "--surface-canvas": themeObj.surfaceCanvas,
      "--surface-muted": themeObj.surfaceMuted,
      "--surface-raised": themeObj.surfaceRaised,
      "--text-primary": themeObj.textPrimary,
      "--text-secondary": themeObj.textSecondary,
      "--text-disabled": themeObj.textDisabled,
      "--text-inverse": themeObj.textInverse,
      "--border-default": themeObj.borderDefault,
      "--border-subtle": themeObj.borderSubtle,
      "--border-strong": themeObj.borderStrong,
      "--action-primary": themeObj.actionPrimary,
      "--action-primary-hover": themeObj.actionPrimaryHover,
      "--action-primary-active": themeObj.actionPrimaryActive,
      "--action-secondary": themeObj.actionSecondary,
      "--state-success-bg": themeObj.stateSuccessBg,
      "--state-success-text": themeObj.stateSuccessText,
      "--state-warning-bg": themeObj.stateWarningBg,
      "--state-warning-text": themeObj.stateWarningText,
      "--state-danger-bg": themeObj.stateErrorBg,
      "--state-danger-text": themeObj.stateErrorText,
      "--state-info-bg": themeObj.stateInfoBg,
      "--state-info-text": themeObj.stateInfoText,
    } as React.CSSProperties;

    return { attrs, style, axes };
  }, [overrides]);
}
