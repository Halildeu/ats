import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSk: ErrorMessageMap = {
  required: (label) => `${label} je povinné`,
  minLength: (label, min) => `${label} musí mať aspoň ${min} znakov`,
  maxLength: (label, max) => `${label} môže mať najviac ${max} znakov`,
  min: (label, min) => `${label} musí byť aspoň ${min}`,
  max: (label, max) => `${label} môže byť najviac ${max}`,
  pattern: (label) => `${label} má neplatný formát`,
  email: (label) => `${label} musí byť platná e-mailová adresa`,
  invalid: (label) => `${label} je neplatné`,
};
