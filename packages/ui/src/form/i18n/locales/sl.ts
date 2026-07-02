import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSl: ErrorMessageMap = {
  required: (label) => `${label} je obvezno`,
  minLength: (label, min) => `${label} mora vsebovati vsaj ${min} znakov`,
  maxLength: (label, max) => `${label} lahko vsebuje največ ${max} znakov`,
  min: (label, min) => `${label} mora biti vsaj ${min}`,
  max: (label, max) => `${label} lahko znaša največ ${max}`,
  pattern: (label) => `${label} ima neveljavno obliko`,
  email: (label) => `${label} mora biti veljaven e-poštni naslov`,
  invalid: (label) => `${label} ni veljavno`,
};
