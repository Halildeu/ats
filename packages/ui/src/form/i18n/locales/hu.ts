import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesHu: ErrorMessageMap = {
  required: (label) => `${label} megadása kötelező`,
  minLength: (label, min) => `${label} legalább ${min} karakter hosszú legyen`,
  maxLength: (label, max) => `${label} legfeljebb ${max} karakter hosszú legyen`,
  min: (label, min) => `${label} legalább ${min} legyen`,
  max: (label, max) => `${label} legfeljebb ${max} legyen`,
  pattern: (label) => `${label} formátuma érvénytelen`,
  email: (label) => `${label} érvényes e-mail cím legyen`,
  invalid: (label) => `${label} érvénytelen`,
};
