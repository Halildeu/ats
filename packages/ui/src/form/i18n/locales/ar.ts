import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesAr: ErrorMessageMap = {
  required: (label) => `${label} مطلوب`,
  minLength: (label, min) => `${label} يجب أن يحتوي على ${min} أحرف على الأقل`,
  maxLength: (label, max) => `${label} يجب ألا يتجاوز ${max} حرفاً`,
  min: (label, min) => `${label} يجب أن يكون ${min} على الأقل`,
  max: (label, max) => `${label} يجب ألا يتجاوز ${max}`,
  pattern: (label) => `${label} بتنسيق غير صالح`,
  email: (label) => `${label} يجب أن يكون عنوان بريد إلكتروني صالح`,
  invalid: (label) => `${label} غير صالح`,
};
