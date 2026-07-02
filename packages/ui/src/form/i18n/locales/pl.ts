import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesPl: ErrorMessageMap = {
  required: (label) => `${label} jest wymagane`,
  minLength: (label, min) => `${label} musi mieć co najmniej ${min} znaków`,
  maxLength: (label, max) => `${label} może mieć maksymalnie ${max} znaków`,
  min: (label, min) => `${label} musi wynosić co najmniej ${min}`,
  max: (label, max) => `${label} może wynosić maksymalnie ${max}`,
  pattern: (label) => `${label} ma nieprawidłowy format`,
  email: (label) => `${label} musi być prawidłowym adresem e-mail`,
  invalid: (label) => `${label} jest nieprawidłowe`,
};
