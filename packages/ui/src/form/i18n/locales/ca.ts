import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesCa: ErrorMessageMap = {
  required: (label) => `${label} és obligatori`,
  minLength: (label, min) => `${label} ha de tenir com a mínim ${min} caràcters`,
  maxLength: (label, max) => `${label} ha de tenir com a màxim ${max} caràcters`,
  min: (label, min) => `${label} ha de ser com a mínim ${min}`,
  max: (label, max) => `${label} ha de ser com a màxim ${max}`,
  pattern: (label) => `${label} té un format no vàlid`,
  email: (label) => `${label} ha de ser una adreça de correu electrònic vàlida`,
  invalid: (label) => `${label} no és vàlid`,
};
