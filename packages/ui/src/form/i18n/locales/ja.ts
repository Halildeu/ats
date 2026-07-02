import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesJa: ErrorMessageMap = {
  required: (label) => `${label}は必須です`,
  minLength: (label, min) => `${label}は${min}文字以上で入力してください`,
  maxLength: (label, max) => `${label}は${max}文字以内で入力してください`,
  min: (label, min) => `${label}は${min}以上である必要があります`,
  max: (label, max) => `${label}は${max}以下である必要があります`,
  pattern: (label) => `${label}の形式が正しくありません`,
  email: (label) => `${label}は有効なメールアドレスである必要があります`,
  invalid: (label) => `${label}が無効です`,
};
