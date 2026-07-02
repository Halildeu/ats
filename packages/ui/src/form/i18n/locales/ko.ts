import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesKo: ErrorMessageMap = {
  required: (label) => `${label}은(는) 필수입니다`,
  minLength: (label, min) => `${label}은(는) 최소 ${min}자 이상이어야 합니다`,
  maxLength: (label, max) => `${label}은(는) 최대 ${max}자까지 입력할 수 있습니다`,
  min: (label, min) => `${label}은(는) ${min} 이상이어야 합니다`,
  max: (label, max) => `${label}은(는) ${max} 이하여야 합니다`,
  pattern: (label) => `${label}의 형식이 올바르지 않습니다`,
  email: (label) => `${label}은(는) 유효한 이메일 주소여야 합니다`,
  invalid: (label) => `${label}이(가) 유효하지 않습니다`,
};
