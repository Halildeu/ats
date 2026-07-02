import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesKk: ErrorMessageMap = {
  required: (label) => `${label} міндетті`,
  minLength: (label, min) => `${label} кемінде ${min} таңба болуы керек`,
  maxLength: (label, max) => `${label} ең көбі ${max} таңба болуы керек`,
  min: (label, min) => `${label} кемінде ${min} болуы керек`,
  max: (label, max) => `${label} ең көбі ${max} болуы керек`,
  pattern: (label) => `${label} пішімі жарамсыз`,
  email: (label) => `${label} жарамды электрондық пошта мекенжайы болуы керек`,
  invalid: (label) => `${label} жарамсыз`,
};
