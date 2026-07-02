import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesTh: ErrorMessageMap = {
  required: (label) => `${label} จำเป็นต้องกรอก`,
  minLength: (label, min) => `${label} ต้องมีอย่างน้อย ${min} ตัวอักษร`,
  maxLength: (label, max) => `${label} ต้องมีไม่เกิน ${max} ตัวอักษร`,
  min: (label, min) => `${label} ต้องมีค่าอย่างน้อย ${min}`,
  max: (label, max) => `${label} ต้องมีค่าไม่เกิน ${max}`,
  pattern: (label) => `${label} มีรูปแบบไม่ถูกต้อง`,
  email: (label) => `${label} ต้องเป็นอีเมลที่ถูกต้อง`,
  invalid: (label) => `${label} ไม่ถูกต้อง`,
};
