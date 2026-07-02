import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesIt: ErrorMessageMap = {
  required: (label) => `${label} è obbligatorio`,
  minLength: (label, min) => `${label} deve contenere almeno ${min} caratteri`,
  maxLength: (label, max) => `${label} deve contenere al massimo ${max} caratteri`,
  min: (label, min) => `${label} deve essere almeno ${min}`,
  max: (label, max) => `${label} deve essere al massimo ${max}`,
  pattern: (label) => `${label} ha un formato non valido`,
  email: (label) => `${label} deve essere un indirizzo email valido`,
  invalid: (label) => `${label} non è valido`,
};
