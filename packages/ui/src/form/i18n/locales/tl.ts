import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesTl: ErrorMessageMap = {
  required: (label) => `${label} ay kinakailangan`,
  minLength: (label, min) => `${label} ay dapat may hindi bababa sa ${min} na character`,
  maxLength: (label, max) => `${label} ay dapat may hindi hihigit sa ${max} na character`,
  min: (label, min) => `${label} ay dapat hindi bababa sa ${min}`,
  max: (label, max) => `${label} ay dapat hindi hihigit sa ${max}`,
  pattern: (label) => `${label} ay may di-wastong format`,
  email: (label) => `${label} ay dapat isang wastong email address`,
  invalid: (label) => `${label} ay di-wasto`,
};
