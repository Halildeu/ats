import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesCs: ErrorMessageMap = {
  required: (label) => `${label} je povinné`,
  minLength: (label, min) => `${label} musí mít alespoň ${min} znaků`,
  maxLength: (label, max) => `${label} může mít nejvýše ${max} znaků`,
  min: (label, min) => `${label} musí být alespoň ${min}`,
  max: (label, max) => `${label} může být nejvýše ${max}`,
  pattern: (label) => `${label} má neplatný formát`,
  email: (label) => `${label} musí být platná e-mailová adresa`,
  invalid: (label) => `${label} je neplatné`,
};
