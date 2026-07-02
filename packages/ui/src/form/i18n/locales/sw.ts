import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesSw: ErrorMessageMap = {
  required: (label) => `${label} inahitajika`,
  minLength: (label, min) => `${label} lazima iwe na angalau herufi ${min}`,
  maxLength: (label, max) => `${label} lazima iwe na herufi ${max} au chini`,
  min: (label, min) => `${label} lazima iwe angalau ${min}`,
  max: (label, max) => `${label} lazima iwe ${max} au chini`,
  pattern: (label) => `Muundo wa ${label} si sahihi`,
  email: (label) => `${label} lazima iwe anwani ya barua pepe halali`,
  invalid: (label) => `${label} si sahihi`,
};
