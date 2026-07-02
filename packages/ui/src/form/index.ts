'use client';
/* ------------------------------------------------------------------ */
/*  @ats/ui/form — Form Validation Adapter                  */
/*                                                                     */
/*  Provides schema-driven form validation with support for both       */
/*  standalone mode (no external deps) and react-hook-form integration.*/
/* ------------------------------------------------------------------ */

// --- Context ---
export { useFormContext, FormContext } from './FormContext';
export type { FormContextValue } from './FormContext';

// --- Hooks ---
export { useForm } from './useForm';
export type { UseFormOptions, UseFormReturn } from './useForm';

export { useFormField } from './useFormField';
export type { UseFormFieldReturn } from './useFormField';

// --- Validation ---
export {
  createSchemaValidator,
  createZodValidator,
  zodResolver,
} from './validation';
export type {
  SchemaValidator,
  ValidationResolver,
  FieldValidationRules,
  FieldDescriptor,
} from './validation';

// --- Connected components ---
export { ConnectedFormField } from './ConnectedFormField';
export type { ConnectedFormFieldProps } from './ConnectedFormField';

export {
  ConnectedInput,
  ConnectedSelect,
  ConnectedCheckbox,
  ConnectedTextarea,
  ConnectedRadio,
} from './connected';
export type {
  ConnectedInputProps,
  ConnectedSelectProps,
  ConnectedCheckboxProps,
  ConnectedTextareaProps,
  ConnectedRadioProps,
} from './connected';

// --- RHF adapter ---
export { createRHFAdapter, RHFFormProvider } from './adapters';
export type { RHFAdapterOptions } from './adapters';

// --- i18n ---
export {
  defaultErrorMessages,
  getErrorMessages,
  errorMessagesTr,
  errorMessagesEn,
} from './i18n';
export type { ErrorMessageMap } from './i18n';
export { useFormLocale } from './i18n';
