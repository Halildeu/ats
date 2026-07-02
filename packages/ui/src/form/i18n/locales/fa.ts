import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesFa: ErrorMessageMap = {
  required: (label) => `${label} الزامی است`,
  minLength: (label, min) => `${label} باید حداقل ${min} کاراکتر باشد`,
  maxLength: (label, max) => `${label} باید حداکثر ${max} کاراکتر باشد`,
  min: (label, min) => `${label} باید حداقل ${min} باشد`,
  max: (label, max) => `${label} باید حداکثر ${max} باشد`,
  pattern: (label) => `فرمت ${label} نامعتبر است`,
  email: (label) => `${label} باید یک آدرس ایمیل معتبر باشد`,
  invalid: (label) => `${label} نامعتبر است`,
};
