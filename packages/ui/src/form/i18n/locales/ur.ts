import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesUr: ErrorMessageMap = {
  required: (label) => `${label} ضروری ہے`,
  minLength: (label, min) => `${label} کم از کم ${min} حروف ہونے چاہییں`,
  maxLength: (label, max) => `${label} زیادہ سے زیادہ ${max} حروف ہونے چاہییں`,
  min: (label, min) => `${label} کم از کم ${min} ہونا چاہیے`,
  max: (label, max) => `${label} زیادہ سے زیادہ ${max} ہونا چاہیے`,
  pattern: (label) => `${label} کی شکل غلط ہے`,
  email: (label) => `${label} ایک درست ای میل پتہ ہونا چاہیے`,
  invalid: (label) => `${label} غلط ہے`,
};
