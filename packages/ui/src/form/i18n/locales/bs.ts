import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesBs: ErrorMessageMap = {
  required: (label) => `${label} je obavezno`,
  minLength: (label, min) => `${label} mora sadržavati najmanje ${min} znakova`,
  maxLength: (label, max) => `${label} može sadržavati najviše ${max} znakova`,
  min: (label, min) => `${label} mora biti najmanje ${min}`,
  max: (label, max) => `${label} može biti najviše ${max}`,
  pattern: (label) => `${label} ima nevažeći format`,
  email: (label) => `${label} mora biti ispravna email adresa`,
  invalid: (label) => `${label} nije ispravno`,
};
