import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesDa: ErrorMessageMap = {
  required: (label) => `${label} er påkrævet`,
  minLength: (label, min) => `${label} skal være mindst ${min} tegn`,
  maxLength: (label, max) => `${label} må højst være ${max} tegn`,
  min: (label, min) => `${label} skal være mindst ${min}`,
  max: (label, max) => `${label} må højst være ${max}`,
  pattern: (label) => `${label} har et ugyldigt format`,
  email: (label) => `${label} skal være en gyldig e-mailadresse`,
  invalid: (label) => `${label} er ugyldig`,
};
