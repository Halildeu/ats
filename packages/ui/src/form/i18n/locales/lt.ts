import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesLt: ErrorMessageMap = {
  required: (label) => `${label} yra privalomas`,
  minLength: (label, min) => `${label} turi būti bent ${min} simbolių`,
  maxLength: (label, max) => `${label} turi būti ne daugiau ${max} simbolių`,
  min: (label, min) => `${label} turi būti bent ${min}`,
  max: (label, max) => `${label} turi būti ne daugiau ${max}`,
  pattern: (label) => `${label} formatas neteisingas`,
  email: (label) => `${label} turi būti galiojantis el. pašto adresas`,
  invalid: (label) => `${label} yra neteisingas`,
};
