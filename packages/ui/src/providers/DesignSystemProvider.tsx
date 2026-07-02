/* ------------------------------------------------------------------ */
/*  DesignSystemProvider — Composes all design system providers        */
/*                                                                     */
/*  Single wrapper that sets up theme, locale, and direction.          */
/* ------------------------------------------------------------------ */

import React from "react";
import { ThemeProvider } from "./ThemeProvider";
import { LocaleProvider } from "./LocaleProvider";
import type { ThemeAxes } from "../theme/core/semantic-theme";
import type { Direction } from "./LocaleProvider";

/** Props for {@link DesignSystemProvider}.
 * @example
 * ```tsx
 * <DesignSystemProvider />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/design-system-provider)
 */
export interface DesignSystemProviderProps {
  /** Override default theme axes. */
  defaultTheme?: Partial<ThemeAxes>;
  /** Locale code (e.g. "en", "tr", "ar"). */
  locale?: string;
  /** Override auto-detected text direction. */
  direction?: Direction;
  /** Application content to wrap with design system providers. */
  children: React.ReactNode;
}

/** Root provider composing theme, locale, and direction for the entire design system. */
export function DesignSystemProvider({
  defaultTheme,
  locale = "en",
  direction,
  children,
}: DesignSystemProviderProps) {
  return (
    <ThemeProvider defaultAxes={defaultTheme}>
      <LocaleProvider locale={locale} direction={direction}>
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}

DesignSystemProvider.displayName = "DesignSystemProvider";

/** Type alias for DesignSystemProvider ref. */
export type DesignSystemProviderRef = React.Ref<HTMLElement>;
/** Type alias for DesignSystemProvider element. */
export type DesignSystemProviderElement = HTMLElement;
/** Type alias for DesignSystemProvider cssproperties. */
export type DesignSystemProviderCSSProperties = React.CSSProperties;
