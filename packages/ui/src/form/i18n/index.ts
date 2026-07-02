export {
  defaultErrorMessages,
  getErrorMessages,
  errorMessagesTr,
  errorMessagesEn,
} from './errorMessages';
export type { ErrorMessageMap } from './errorMessages';
export { useFormLocale } from './useFormLocale';
export { allLocales } from './locales';

/**
 * Returns the total number of supported locales (built-in + extended packs).
 */
export { getSupportedLocaleCount } from './localeCount';
