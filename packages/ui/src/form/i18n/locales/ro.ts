import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesRo: ErrorMessageMap = {
  required: (label) => `${label} este obligatoriu`,
  minLength: (label, min) => `${label} trebuie să aibă cel puțin ${min} caractere`,
  maxLength: (label, max) => `${label} trebuie să aibă cel mult ${max} caractere`,
  min: (label, min) => `${label} trebuie să fie cel puțin ${min}`,
  max: (label, max) => `${label} trebuie să fie cel mult ${max}`,
  pattern: (label) => `${label} are un format invalid`,
  email: (label) => `${label} trebuie să fie o adresă de e-mail validă`,
  invalid: (label) => `${label} este invalid`,
};
