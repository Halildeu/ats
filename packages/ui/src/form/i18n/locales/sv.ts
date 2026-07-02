import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSv: ErrorMessageMap = {
  required: (label) => `${label} är obligatoriskt`,
  minLength: (label, min) => `${label} måste vara minst ${min} tecken`,
  maxLength: (label, max) => `${label} får vara högst ${max} tecken`,
  min: (label, min) => `${label} måste vara minst ${min}`,
  max: (label, max) => `${label} får vara högst ${max}`,
  pattern: (label) => `${label} har ett ogiltigt format`,
  email: (label) => `${label} måste vara en giltig e-postadress`,
  invalid: (label) => `${label} är ogiltigt`,
};
