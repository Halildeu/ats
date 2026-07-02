import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesNl: ErrorMessageMap = {
  required: (label) => `${label} is verplicht`,
  minLength: (label, min) => `${label} moet minimaal ${min} tekens bevatten`,
  maxLength: (label, max) => `${label} mag maximaal ${max} tekens bevatten`,
  min: (label, min) => `${label} moet minimaal ${min} zijn`,
  max: (label, max) => `${label} mag maximaal ${max} zijn`,
  pattern: (label) => `${label} heeft een ongeldig formaat`,
  email: (label) => `${label} moet een geldig e-mailadres zijn`,
  invalid: (label) => `${label} is ongeldig`,
};
