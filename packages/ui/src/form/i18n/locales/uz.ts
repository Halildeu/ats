import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesUz: ErrorMessageMap = {
  required: (label) => `${label} majburiy`,
  minLength: (label, min) => `${label} kamida ${min} ta belgidan iborat bo'lishi kerak`,
  maxLength: (label, max) => `${label} ko'pi bilan ${max} ta belgidan iborat bo'lishi kerak`,
  min: (label, min) => `${label} kamida ${min} bo'lishi kerak`,
  max: (label, max) => `${label} ko'pi bilan ${max} bo'lishi kerak`,
  pattern: (label) => `${label} formati noto'g'ri`,
  email: (label) => `${label} to'g'ri elektron pochta manzili bo'lishi kerak`,
  invalid: (label) => `${label} noto'g'ri`,
};
