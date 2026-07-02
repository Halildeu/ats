'use client';
/* ------------------------------------------------------------------ */
/*  RHF Adapter — bridges react-hook-form state into FormContext        */
/*                                                                     */
/*  Allows MFEs using react-hook-form to use ConnectedFormField and    */
/*  Connected components seamlessly.                                    */
/* ------------------------------------------------------------------ */

import React from 'react';
import type { AccessLevel } from '../../internal/access-controller';
import { FormContext, type FormContextValue } from '../FormContext';

/**
 * Minimal shape of react-hook-form's useForm return.
 * Avoids importing RHF types — we depend on the public API shape only.
 */
interface RHFFormLike {
  watch: () => Record<string, unknown>;
  getValues: () => Record<string, unknown>;
  setValue: (name: string, value: unknown, options?: { shouldValidate?: boolean }) => void;
  formState: {
    errors: Record<string, { message?: string } | undefined>;
    touchedFields: Record<string, boolean | undefined>;
    dirtyFields: Record<string, boolean | undefined>;
    isSubmitting: boolean;
    isValid: boolean;
    isDirty: boolean;
  };
  trigger: (name?: string) => Promise<boolean>;
  reset: (values?: Record<string, unknown>) => void;
}

export interface RHFAdapterOptions {
  /** react-hook-form's useForm() return value. */
  rhfForm: RHFFormLike;
  /** Form-level access control. */
  access?: AccessLevel;
  /** Validation mode. */
  mode?: 'onBlur' | 'onChange' | 'onSubmit';
}

/**
 * Create a FormContextValue from react-hook-form state.
 *
 * Wrap your form with `<FormProvider value={createRHFAdapter(opts)}>` to
 * enable ConnectedFormField and Connected components with RHF state.
 *
 * @example
 * ```tsx
 * import { useForm } from 'react-hook-form';
 * import { FormContext, createRHFAdapter, ConnectedInput } from '@ats/ui/form';
 *
 * const form = useForm({ resolver: zodResolver(schema) });
 * const adapter = createRHFAdapter({ rhfForm: form });
 *
 * <FormContext.Provider value={adapter}>
 *   <ConnectedInput name="email" label="Email" />
 * </FormContext.Provider>
 * ```
 */
export function createRHFAdapter({
  rhfForm,
  access = 'full',
  mode = 'onBlur',
}: RHFAdapterOptions): FormContextValue {
  const { formState } = rhfForm;

  // Map RHF errors to flat string map
  const errors: Record<string, string> = {};
  for (const [key, err] of Object.entries(formState.errors)) {
    if (err?.message) errors[key] = err.message;
  }

  // Map RHF touched to boolean map
  const touched: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(formState.touchedFields)) {
    if (val) touched[key] = true;
  }

  // Map RHF dirty to boolean map
  const dirtyFields: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(formState.dirtyFields)) {
    if (val) dirtyFields[key] = true;
  }

  return {
    values: rhfForm.getValues(),
    errors,
    touched,
    dirtyFields,
    access,
    mode,
    setFieldValue: (name, value) => rhfForm.setValue(name, value, { shouldValidate: mode === 'onChange' }),
    setFieldTouched: () => { /* RHF manages touch automatically */ },
    setFieldError: () => { /* RHF manages errors via resolver */ },
    clearFieldError: () => { /* RHF manages errors via resolver */ },
    validateField: (name) => {
      rhfForm.trigger(name);
      return errors[name] ?? null;
    },
    validateForm: () => {
      rhfForm.trigger();
      return errors;
    },
    reset: (values) => rhfForm.reset(values),
    isValid: formState.isValid,
    isDirty: formState.isDirty,
    isSubmitting: formState.isSubmitting,
    validator: null,
  };
}

/**
 * Convenience component: FormProvider pre-configured with RHF adapter.
 */
export function RHFFormProvider({
  rhfForm,
  access,
  mode,
  children,
}: RHFAdapterOptions & { children: React.ReactNode }) {
  const contextValue = createRHFAdapter({ rhfForm, access, mode });
  return React.createElement(FormContext.Provider, { value: contextValue }, children);
}

RHFFormProvider.displayName = 'RHFFormProvider';
