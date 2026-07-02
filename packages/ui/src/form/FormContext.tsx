'use client';
/* ------------------------------------------------------------------ */
/*  FormContext — form-level state context + provider                   */
/* ------------------------------------------------------------------ */

import { createContext, useContext } from 'react';
import type { AccessLevel } from '../internal/access-controller';
import type { SchemaValidator } from './validation/types';

export interface FormContextValue {
  /** Current field values keyed by field name. */
  values: Record<string, unknown>;
  /** Validation error messages keyed by field name. */
  errors: Record<string, string>;
  /** Whether each field has been interacted with. */
  touched: Record<string, boolean>;
  /** Whether each field has been modified from its initial value. */
  dirtyFields: Record<string, boolean>;
  /** Global access level applied to all form fields. */
  access: AccessLevel;
  /** Validation trigger strategy. */
  mode: 'onBlur' | 'onChange' | 'onSubmit';
  /** Set a single field's value. */
  setFieldValue: (name: string, value: unknown) => void;
  /** Mark a field as touched or untouched. */
  setFieldTouched: (name: string, isTouched?: boolean) => void;
  /** Set a validation error for a field. */
  setFieldError: (name: string, error: string) => void;
  /** Clear the validation error for a field. */
  clearFieldError: (name: string) => void;
  /** Validate a single field and return its error or null. */
  validateField: (name: string) => string | null;
  /** Validate all fields and return the errors map. */
  validateForm: () => Record<string, string>;
  /** Reset the form to initial or provided values. */
  reset: (nextValues?: Record<string, unknown>) => void;
  /** Whether all fields pass validation. */
  isValid: boolean;
  /** Whether any field has been modified. */
  isDirty: boolean;
  /** Whether the form is currently submitting. */
  isSubmitting: boolean;
  /** Optional schema validator instance. */
  validator: SchemaValidator | null;
}

const FormContext = createContext<FormContextValue | null>(null);
FormContext.displayName = 'FormContext';

/**
 * Read form context. Throws if used outside a FormProvider.
   * @example
   * ```tsx
   * <FormContext />
   * ```
   * @since 1.0.0
   * @see [Docs](https://design.mfe.dev/components/form-context)
  
 */
export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) {
    throw new Error(
      'useFormContext must be used within a <FormProvider>. ' +
        'Wrap your form with the FormProvider returned by useForm() or pass one explicitly.',
    );
  }
  return ctx;
}

export { FormContext };

/** Props interface for FormContext provider consumers. */
export interface FormContextProps extends FormContextValue {}
/** Form field name type. */
export type FormFieldName = string;
/** Form validation mode type. */
export type FormValidationMode = 'onBlur' | 'onChange' | 'onSubmit';
