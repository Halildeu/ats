/* ------------------------------------------------------------------ */
/*  LocaleProvider — locale + RTL context                              */
/* ------------------------------------------------------------------ */

import React, { createContext, useContext, useMemo } from "react";

export type Direction = "ltr" | "rtl";

export interface LocaleContextValue {
  locale: string;
  direction: Direction;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  direction: "ltr",
});

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Props for the LocaleProvider component.
 * @example
 * ```tsx
 * <LocaleProvider />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/locale-provider)
 */
export interface LocaleProviderProps {
  /** BCP 47 locale tag (e.g. "en", "tr", "ar"). @default "en" */
  locale?: string;
  /** Explicit text direction override; auto-detected from locale when omitted. */
  direction?: Direction;
  /** Content to render within the locale context. */
  children: React.ReactNode;
  /** Additional CSS class name for the wrapper element. */
  className?: string;
  /** HTML id for the wrapper element. */
  id?: string;
  /** Inline styles for the wrapper element. */
  style?: React.CSSProperties;
}

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/** Provides locale and text-direction context to the component subtree, auto-detecting RTL for Arabic, Hebrew, Farsi, and Urdu locales. */
export function LocaleProvider({
  locale = "en",
  direction,
  children,
}: LocaleProviderProps) {
  const resolvedDirection = direction ?? (RTL_LOCALES.has(locale) ? "rtl" : "ltr");

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, direction: resolvedDirection }),
    [locale, resolvedDirection],
  );

  return (
    <LocaleContext.Provider value={value}>
      <div dir={resolvedDirection}>{children}</div>
    </LocaleContext.Provider>
  );
}

LocaleProvider.displayName = "LocaleProvider";
