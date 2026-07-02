import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesHe: ErrorMessageMap = {
  required: (label) => `${label} הוא שדה חובה`,
  minLength: (label, min) => `${label} חייב להכיל לפחות ${min} תווים`,
  maxLength: (label, max) => `${label} יכול להכיל לכל היותר ${max} תווים`,
  min: (label, min) => `${label} חייב להיות לפחות ${min}`,
  max: (label, max) => `${label} חייב להיות לכל היותר ${max}`,
  pattern: (label) => `${label} בפורמט לא תקין`,
  email: (label) => `${label} חייב להיות כתובת דוא"ל תקינה`,
  invalid: (label) => `${label} אינו תקין`,
};
