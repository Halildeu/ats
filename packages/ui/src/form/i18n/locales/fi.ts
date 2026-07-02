import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesFi: ErrorMessageMap = {
  required: (label) => `${label} on pakollinen`,
  minLength: (label, min) => `${label} täytyy olla vähintään ${min} merkkiä`,
  maxLength: (label, max) => `${label} saa olla enintään ${max} merkkiä`,
  min: (label, min) => `${label} täytyy olla vähintään ${min}`,
  max: (label, max) => `${label} saa olla enintään ${max}`,
  pattern: (label) => `${label} on virheellisessä muodossa`,
  email: (label) => `${label} tulee olla kelvollinen sähköpostiosoite`,
  invalid: (label) => `${label} on virheellinen`,
};
