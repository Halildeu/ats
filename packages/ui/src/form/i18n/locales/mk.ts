import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesMk: ErrorMessageMap = {
  required: (label) => `${label} е задолжително`,
  minLength: (label, min) => `${label} мора да содржи најмалку ${min} знаци`,
  maxLength: (label, max) => `${label} мора да содржи најмногу ${max} знаци`,
  min: (label, min) => `${label} мора да биде најмалку ${min}`,
  max: (label, max) => `${label} мора да биде најмногу ${max}`,
  pattern: (label) => `${label} има невалиден формат`,
  email: (label) => `${label} мора да биде валидна е-пошта`,
  invalid: (label) => `${label} е невалидно`,
};
