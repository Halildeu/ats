import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesKa: ErrorMessageMap = {
  required: (label) => `${label} სავალდებულოა`,
  minLength: (label, min) => `${label} უნდა შეიცავდეს მინიმუმ ${min} სიმბოლოს`,
  maxLength: (label, max) => `${label} უნდა შეიცავდეს მაქსიმუმ ${max} სიმბოლოს`,
  min: (label, min) => `${label} უნდა იყოს მინიმუმ ${min}`,
  max: (label, max) => `${label} უნდა იყოს მაქსიმუმ ${max}`,
  pattern: (label) => `${label} ფორმატი არასწორია`,
  email: (label) => `${label} უნდა იყოს სწორი ელ-ფოსტის მისამართი`,
  invalid: (label) => `${label} არასწორია`,
};
