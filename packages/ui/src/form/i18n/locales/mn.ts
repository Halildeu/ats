import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesMn: ErrorMessageMap = {
  required: (label) => `${label} заавал шаардлагатай`,
  minLength: (label, min) => `${label} хамгийн багадаа ${min} тэмдэгт байх ёстой`,
  maxLength: (label, max) => `${label} хамгийн ихдээ ${max} тэмдэгт байх ёстой`,
  min: (label, min) => `${label} хамгийн багадаа ${min} байх ёстой`,
  max: (label, max) => `${label} хамгийн ихдээ ${max} байх ёстой`,
  pattern: (label) => `${label} формат буруу байна`,
  email: (label) => `${label} зөв имэйл хаяг байх ёстой`,
  invalid: (label) => `${label} буруу байна`,
};
