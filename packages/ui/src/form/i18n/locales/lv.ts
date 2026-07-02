import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesLv: ErrorMessageMap = {
  required: (label) => `${label} ir obligāts`,
  minLength: (label, min) => `${label} jābūt vismaz ${min} rakstzīmēm`,
  maxLength: (label, max) => `${label} jābūt ne vairāk kā ${max} rakstzīmēm`,
  min: (label, min) => `${label} jābūt vismaz ${min}`,
  max: (label, max) => `${label} jābūt ne vairāk kā ${max}`,
  pattern: (label) => `${label} formāts ir nederīgs`,
  email: (label) => `${label} jābūt derīgai e-pasta adresei`,
  invalid: (label) => `${label} ir nederīgs`,
};
