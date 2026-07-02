import { allLocales } from './locales';

/**
 * Returns the total number of supported locales (built-in tr/en + extended packs).
 */
export function getSupportedLocaleCount(): number {
  // 2 built-in (tr, en) + extended locale packs
  return 2 + Object.keys(allLocales).length;
}
