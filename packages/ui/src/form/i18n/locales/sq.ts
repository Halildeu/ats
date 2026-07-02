import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSq: ErrorMessageMap = {
  required: (label) => `${label} është i detyrueshëm`,
  minLength: (label, min) => `${label} duhet të ketë të paktën ${min} karaktere`,
  maxLength: (label, max) => `${label} duhet të ketë më së shumti ${max} karaktere`,
  min: (label, min) => `${label} duhet të jetë të paktën ${min}`,
  max: (label, max) => `${label} duhet të jetë më së shumti ${max}`,
  pattern: (label) => `${label} ka format të pavlefshëm`,
  email: (label) => `${label} duhet të jetë adresë e vlefshme emaili`,
  invalid: (label) => `${label} nuk është i vlefshëm`,
};
