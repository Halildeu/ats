import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesUk: ErrorMessageMap = {
  required: (label) => `${label} є обов'язковим`,
  minLength: (label, min) => `${label} повинно містити щонайменше ${min} символів`,
  maxLength: (label, max) => `${label} повинно містити не більше ${max} символів`,
  min: (label, min) => `${label} повинно бути не менше ${min}`,
  max: (label, max) => `${label} повинно бути не більше ${max}`,
  pattern: (label) => `${label} має невірний формат`,
  email: (label) => `${label} повинно бути дійсною адресою електронної пошти`,
  invalid: (label) => `${label} є недійсним`,
};
