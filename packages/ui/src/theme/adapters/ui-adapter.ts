/* ------------------------------------------------------------------ */
/*  UI Adapter — token → CSS custom property mapping                   */
/*                                                                     */
/*  Converts a SemanticTokenSet into CSS custom properties that can    */
/*  be injected on <html> or a scoped container element.               */
/* ------------------------------------------------------------------ */

import type { SemanticTokenSet } from "../../tokens/semantic";

const TOKEN_TO_CSS_VAR: Record<keyof SemanticTokenSet, string> = {
  surfaceDefault: "--surface-default",
  surfaceCanvas: "--surface-canvas",
  surfaceMuted: "--surface-muted",
  surfaceRaised: "--surface-raised",

  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textDisabled: "--text-disabled",
  textInverse: "--text-inverse",

  borderDefault: "--border-default",
  borderSubtle: "--border-subtle",
  borderStrong: "--border-strong",

  actionPrimary: "--action-primary",
  actionPrimaryHover: "--action-primary-hover",
  actionPrimaryActive: "--action-primary-active",
  actionSecondary: "--action-secondary",

  stateSuccessBg: "--state-success-bg",
  stateSuccessText: "--state-success-text",
  stateWarningBg: "--state-warning-bg",
  stateWarningText: "--state-warning-text",
  stateErrorBg: "--state-error-bg",
  stateErrorText: "--state-error-text",
  stateInfoBg: "--state-info-bg",
  stateInfoText: "--state-info-text",

  focusRing: "--focus-ring",
};

/**
 * Generates a CSS string from a semantic token set.
 *
 * @example
 * const css = tokenSetToCss(lightTheme);
 * // ":root { --surface-default: #ffffff; ... }"
 */
export function tokenSetToCss(
  tokens: SemanticTokenSet,
  selector = ":root",
): string {
  const vars = Object.entries(TOKEN_TO_CSS_VAR)
    .map(([key, cssVar]) => `  ${cssVar}: ${tokens[key as keyof SemanticTokenSet]};`)
    .join("\n");

  return `${selector} {\n${vars}\n}`;
}

/**
 * Applies a token set directly to an element's inline styles.
 */
export function applyTokenSet(
  tokens: SemanticTokenSet,
  element?: HTMLElement,
): void {
  const target =
    element ??
    (typeof document !== "undefined" ? document.documentElement : undefined);

  if (!target) return;

  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS_VAR)) {
    target.style.setProperty(cssVar, tokens[key as keyof SemanticTokenSet]);
  }
}
