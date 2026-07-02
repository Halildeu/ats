import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesPt: ErrorMessageMap = {
  required: (label) => `${label} é obrigatório`,
  minLength: (label, min) => `${label} deve ter pelo menos ${min} caracteres`,
  maxLength: (label, max) => `${label} deve ter no máximo ${max} caracteres`,
  min: (label, min) => `${label} deve ser pelo menos ${min}`,
  max: (label, max) => `${label} deve ser no máximo ${max}`,
  pattern: (label) => `${label} tem um formato inválido`,
  email: (label) => `${label} deve ser um endereço de e-mail válido`,
  invalid: (label) => `${label} é inválido`,
};
