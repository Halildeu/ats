import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesId: ErrorMessageMap = {
  required: (label) => `${label} wajib diisi`,
  minLength: (label, min) => `${label} harus memiliki minimal ${min} karakter`,
  maxLength: (label, max) => `${label} harus memiliki maksimal ${max} karakter`,
  min: (label, min) => `${label} harus minimal ${min}`,
  max: (label, max) => `${label} harus maksimal ${max}`,
  pattern: (label) => `Format ${label} tidak valid`,
  email: (label) => `${label} harus berupa alamat email yang valid`,
  invalid: (label) => `${label} tidak valid`,
};
