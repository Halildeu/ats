import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesHi: ErrorMessageMap = {
  required: (label) => `${label} आवश्यक है`,
  minLength: (label, min) => `${label} कम से कम ${min} अक्षर होने चाहिए`,
  maxLength: (label, max) => `${label} अधिकतम ${max} अक्षर होने चाहिए`,
  min: (label, min) => `${label} कम से कम ${min} होना चाहिए`,
  max: (label, max) => `${label} अधिकतम ${max} होना चाहिए`,
  pattern: (label) => `${label} का प्रारूप अमान्य है`,
  email: (label) => `${label} एक मान्य ईमेल पता होना चाहिए`,
  invalid: (label) => `${label} अमान्य है`,
};
