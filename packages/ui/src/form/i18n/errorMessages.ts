/* ------------------------------------------------------------------ */
/*  Default Error Messages — TR/EN with factory pattern                */
/*  Extended with 50+ locale packs via ./locales                       */
/* ------------------------------------------------------------------ */

import { allLocales } from './locales';

export interface ErrorMessageMap {
  required: (label: string) => string;
  minLength: (label: string, min: number) => string;
  maxLength: (label: string, max: number) => string;
  min: (label: string, min: number) => string;
  max: (label: string, max: number) => string;
  pattern: (label: string) => string;
  email: (label: string) => string;
  invalid: (label: string) => string;
}

export const errorMessagesTr: ErrorMessageMap = {
  required: (label) => `${label} zorunludur`,
  minLength: (label, min) => `${label} en az ${min} karakter olmalıdır`,
  maxLength: (label, max) => `${label} en fazla ${max} karakter olmalıdır`,
  min: (label, min) => `${label} en az ${min} olmalıdır`,
  max: (label, max) => `${label} en fazla ${max} olmalıdır`,
  pattern: (label) => `${label} formatı geçersiz`,
  email: (label) => `${label} geçerli bir e-posta adresi olmalıdır`,
  invalid: (label) => `${label} geçersiz`,
};

export const errorMessagesEn: ErrorMessageMap = {
  required: (label) => `${label} is required`,
  minLength: (label, min) => `${label} must be at least ${min} characters`,
  maxLength: (label, max) => `${label} must be at most ${max} characters`,
  min: (label, min) => `${label} must be at least ${min}`,
  max: (label, max) => `${label} must be at most ${max}`,
  pattern: (label) => `${label} format is invalid`,
  email: (label) => `${label} must be a valid email address`,
  invalid: (label) => `${label} is invalid`,
};

const localeMap: Record<string, ErrorMessageMap> = {
  tr: errorMessagesTr,
  en: errorMessagesEn,
  ...allLocales,
};

/**
 * Get error message map for a locale. Falls back to English.
 */
export function getErrorMessages(locale: string): ErrorMessageMap {
  return localeMap[locale] ?? localeMap.en;
}

/** Default error messages (English). */
export const defaultErrorMessages = errorMessagesEn;
