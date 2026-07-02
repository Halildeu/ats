import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesHr: ErrorMessageMap = {
  required: (label) => `${label} je obavezno`,
  minLength: (label, min) => `${label} mora sadržavati najmanje ${min} znakova`,
  maxLength: (label, max) => `${label} smije sadržavati najviše ${max} znakova`,
  min: (label, min) => `${label} mora biti najmanje ${min}`,
  max: (label, max) => `${label} smije biti najviše ${max}`,
  pattern: (label) => `${label} ima nevažeći format`,
  email: (label) => `${label} mora biti valjana adresa e-pošte`,
  invalid: (label) => `${label} nije valjano`,
};
