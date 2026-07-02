import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSr: ErrorMessageMap = {
  required: (label) => `${label} je obavezno`,
  minLength: (label, min) => `${label} mora imati najmanje ${min} karaktera`,
  maxLength: (label, max) => `${label} može imati najviše ${max} karaktera`,
  min: (label, min) => `${label} mora biti najmanje ${min}`,
  max: (label, max) => `${label} može biti najviše ${max}`,
  pattern: (label) => `${label} ima nevažeći format`,
  email: (label) => `${label} mora biti ispravna email adresa`,
  invalid: (label) => `${label} nije ispravno`,
};
