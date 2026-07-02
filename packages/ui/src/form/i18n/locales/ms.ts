import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesMs: ErrorMessageMap = {
  required: (label) => `${label} diperlukan`,
  minLength: (label, min) => `${label} mesti sekurang-kurangnya ${min} aksara`,
  maxLength: (label, max) => `${label} mesti tidak melebihi ${max} aksara`,
  min: (label, min) => `${label} mesti sekurang-kurangnya ${min}`,
  max: (label, max) => `${label} mesti tidak melebihi ${max}`,
  pattern: (label) => `Format ${label} tidak sah`,
  email: (label) => `${label} mesti alamat e-mel yang sah`,
  invalid: (label) => `${label} tidak sah`,
};
