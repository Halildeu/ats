import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesBg: ErrorMessageMap = {
  required: (label) => `${label} е задължително`,
  minLength: (label, min) => `${label} трябва да съдържа поне ${min} символа`,
  maxLength: (label, max) => `${label} трябва да съдържа най-много ${max} символа`,
  min: (label, min) => `${label} трябва да бъде поне ${min}`,
  max: (label, max) => `${label} трябва да бъде най-много ${max}`,
  pattern: (label) => `${label} има невалиден формат`,
  email: (label) => `${label} трябва да бъде валиден имейл адрес`,
  invalid: (label) => `${label} е невалидно`,
};
