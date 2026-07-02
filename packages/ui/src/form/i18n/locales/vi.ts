import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesVi: ErrorMessageMap = {
  required: (label) => `${label} là bắt buộc`,
  minLength: (label, min) => `${label} phải có ít nhất ${min} ký tự`,
  maxLength: (label, max) => `${label} không được vượt quá ${max} ký tự`,
  min: (label, min) => `${label} phải ít nhất là ${min}`,
  max: (label, max) => `${label} không được vượt quá ${max}`,
  pattern: (label) => `${label} có định dạng không hợp lệ`,
  email: (label) => `${label} phải là địa chỉ email hợp lệ`,
  invalid: (label) => `${label} không hợp lệ`,
};
