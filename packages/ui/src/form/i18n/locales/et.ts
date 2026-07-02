import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesEt: ErrorMessageMap = {
  required: (label) => `${label} on kohustuslik`,
  minLength: (label, min) => `${label} peab olema vähemalt ${min} tähemärki`,
  maxLength: (label, max) => `${label} tohib olla kuni ${max} tähemärki`,
  min: (label, min) => `${label} peab olema vähemalt ${min}`,
  max: (label, max) => `${label} tohib olla kuni ${max}`,
  pattern: (label) => `${label} vorming on vigane`,
  email: (label) => `${label} peab olema kehtiv e-posti aadress`,
  invalid: (label) => `${label} on vigane`,
};
