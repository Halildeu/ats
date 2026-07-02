import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesAz: ErrorMessageMap = {
  required: (label) => `${label} tələb olunur`,
  minLength: (label, min) => `${label} ən azı ${min} simvol olmalıdır`,
  maxLength: (label, max) => `${label} ən çoxu ${max} simvol olmalıdır`,
  min: (label, min) => `${label} ən azı ${min} olmalıdır`,
  max: (label, max) => `${label} ən çoxu ${max} olmalıdır`,
  pattern: (label) => `${label} formatı yanlışdır`,
  email: (label) => `${label} düzgün e-poçt ünvanı olmalıdır`,
  invalid: (label) => `${label} yanlışdır`,
};
