import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesRu: ErrorMessageMap = {
  required: (label) => `${label} обязательно для заполнения`,
  minLength: (label, min) => `${label} должно содержать не менее ${min} символов`,
  maxLength: (label, max) => `${label} должно содержать не более ${max} символов`,
  min: (label, min) => `${label} должно быть не менее ${min}`,
  max: (label, max) => `${label} должно быть не более ${max}`,
  pattern: (label) => `${label} имеет неверный формат`,
  email: (label) => `${label} должно быть действительным адресом электронной почты`,
  invalid: (label) => `${label} недействительно`,
};
