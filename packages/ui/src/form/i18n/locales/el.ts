import type { ErrorMessageMap } from '../errorMessages';

export const errorMessagesEl: ErrorMessageMap = {
  required: (label) => `${label} είναι υποχρεωτικό`,
  minLength: (label, min) => `${label} πρέπει να έχει τουλάχιστον ${min} χαρακτήρες`,
  maxLength: (label, max) => `${label} πρέπει να έχει το πολύ ${max} χαρακτήρες`,
  min: (label, min) => `${label} πρέπει να είναι τουλάχιστον ${min}`,
  max: (label, max) => `${label} πρέπει να είναι το πολύ ${max}`,
  pattern: (label) => `${label} έχει μη έγκυρη μορφή`,
  email: (label) => `${label} πρέπει να είναι έγκυρη διεύθυνση email`,
  invalid: (label) => `${label} δεν είναι έγκυρο`,
};
