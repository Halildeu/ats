import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesDe: ErrorMessageMap = {
  required: (label) => `${label} ist erforderlich`,
  minLength: (label, min) => `${label} muss mindestens ${min} Zeichen lang sein`,
  maxLength: (label, max) => `${label} darf höchstens ${max} Zeichen lang sein`,
  min: (label, min) => `${label} muss mindestens ${min} sein`,
  max: (label, max) => `${label} darf höchstens ${max} sein`,
  pattern: (label) => `${label} hat ein ungültiges Format`,
  email: (label) => `${label} muss eine gültige E-Mail-Adresse sein`,
  invalid: (label) => `${label} ist ungültig`,
};
