import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesEs: ErrorMessageMap = {
  required: (label) => `${label} es obligatorio`,
  minLength: (label, min) => `${label} debe tener al menos ${min} caracteres`,
  maxLength: (label, max) => `${label} debe tener como máximo ${max} caracteres`,
  min: (label, min) => `${label} debe ser al menos ${min}`,
  max: (label, max) => `${label} debe ser como máximo ${max}`,
  pattern: (label) => `${label} tiene un formato inválido`,
  email: (label) => `${label} debe ser una dirección de correo válida`,
  invalid: (label) => `${label} no es válido`,
};
