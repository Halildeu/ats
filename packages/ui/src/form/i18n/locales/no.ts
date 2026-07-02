import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesNo: ErrorMessageMap = {
  required: (label) => `${label} er påkrevd`,
  minLength: (label, min) => `${label} må være minst ${min} tegn`,
  maxLength: (label, max) => `${label} kan være maks ${max} tegn`,
  min: (label, min) => `${label} må være minst ${min}`,
  max: (label, max) => `${label} kan være maks ${max}`,
  pattern: (label) => `${label} har et ugyldig format`,
  email: (label) => `${label} må være en gyldig e-postadresse`,
  invalid: (label) => `${label} er ugyldig`,
};
