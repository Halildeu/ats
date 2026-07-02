import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesFr: ErrorMessageMap = {
  required: (label) => `${label} est requis`,
  minLength: (label, min) => `${label} doit contenir au moins ${min} caractères`,
  maxLength: (label, max) => `${label} doit contenir au plus ${max} caractères`,
  min: (label, min) => `${label} doit être au moins ${min}`,
  max: (label, max) => `${label} doit être au plus ${max}`,
  pattern: (label) => `${label} a un format invalide`,
  email: (label) => `${label} doit être une adresse e-mail valide`,
  invalid: (label) => `${label} est invalide`,
};
