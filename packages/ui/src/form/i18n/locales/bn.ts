import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesBn: ErrorMessageMap = {
  required: (label) => `${label} আবশ্যক`,
  minLength: (label, min) => `${label} কমপক্ষে ${min} অক্ষর হতে হবে`,
  maxLength: (label, max) => `${label} সর্বাধিক ${max} অক্ষর হতে পারে`,
  min: (label, min) => `${label} কমপক্ষে ${min} হতে হবে`,
  max: (label, max) => `${label} সর্বাধিক ${max} হতে পারে`,
  pattern: (label) => `${label} এর বিন্যাস অবৈধ`,
  email: (label) => `${label} একটি বৈধ ইমেল ঠিকানা হতে হবে`,
  invalid: (label) => `${label} অবৈধ`,
};
