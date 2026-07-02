import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesZh: ErrorMessageMap = {
  required: (label) => `${label}是必填项`,
  minLength: (label, min) => `${label}至少需要${min}个字符`,
  maxLength: (label, max) => `${label}最多不能超过${max}个字符`,
  min: (label, min) => `${label}不能小于${min}`,
  max: (label, max) => `${label}不能大于${max}`,
  pattern: (label) => `${label}格式不正确`,
  email: (label) => `${label}必须是有效的电子邮件地址`,
  invalid: (label) => `${label}无效`,
};
