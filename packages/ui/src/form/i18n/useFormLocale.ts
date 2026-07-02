/* ------------------------------------------------------------------ */
/*  useFormLocale — reads LocaleProvider and returns error messages     */
/* ------------------------------------------------------------------ */

import { useMemo } from 'react';
import { useLocale } from '../../providers/LocaleProvider';
import { getErrorMessages, type ErrorMessageMap } from './errorMessages';

/**
 * Returns the error message map for the current locale.
 *
 * Reads from `LocaleProvider` context. Falls back to English
 * if the locale is not supported.
 *
 * @param overrides — partial overrides merged on top of locale defaults
 */
export function useFormLocale(
  overrides?: Partial<ErrorMessageMap>,
): ErrorMessageMap {
  const { locale } = useLocale();

  return useMemo(() => {
    const base = getErrorMessages(locale);
    if (!overrides) return base;
    return { ...base, ...overrides };
  }, [locale, overrides]);
}
