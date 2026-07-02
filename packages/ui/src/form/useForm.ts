'use client';
/* ------------------------------------------------------------------ */
/*  useForm — standalone form state hook                                */
/*                                                                     */
/*  Provides form state management without react-hook-form.             */
/*  Returns a FormProvider that injects context for useFormField.        */
/*                                                                     */
/*  Performance: callbacks use refs to avoid stale closures and         */
/*  unnecessary re-renders. Only the changed field triggers update.     */
/* ------------------------------------------------------------------ */

import { useCallback, useMemo, useRef, useState } from 'react';
import React from 'react';
import type { AccessLevel } from '../internal/access-controller';
import type { SchemaValidator } from './validation/types';
import { FormContext, type FormContextValue } from './FormContext';

export interface UseFormOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  defaultValues: T;
  validator?: SchemaValidator;
  mode?: 'onBlur' | 'onChange' | 'onSubmit';
  access?: AccessLevel;
}

export interface UseFormReturn<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirtyFields: Record<string, boolean>;
  setFieldValue: (name: string, value: unknown) => void;
  setFieldTouched: (name: string, isTouched?: boolean) => void;
  validateField: (name: string) => string | null;
  validateForm: () => Record<string, string>;
  handleSubmit: (
    onSubmit: (values: T) => void | Promise<void>,
  ) => (e?: React.FormEvent) => void;
  reset: (nextValues?: Partial<T>) => void;
  isValid: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  FormProvider: React.FC<{ children: React.ReactNode }>;
}

export function useForm<
  T extends Record<string, unknown> = Record<string, unknown>,
>(options: UseFormOptions<T>): UseFormReturn<T> {
  const { defaultValues, validator, mode = 'onBlur', access = 'full' } = options;

  const defaultsRef = useRef(defaultValues);
  const [values, setValues] = useState<T>({ ...defaultValues });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for stable callbacks — avoids re-creating closures on every render
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Dirty tracking
  const dirtyFields = useMemo(() => {
    const dirty: Record<string, boolean> = {};
    for (const key of Object.keys(values)) {
      if (values[key] !== defaultsRef.current[key]) {
        dirty[key] = true;
      }
    }
    return dirty;
  }, [values]);

  const isDirty = Object.keys(dirtyFields).length > 0;
  const isValid = Object.keys(errors).length === 0;

  // Stable validation helpers — read from refs, no values dependency
  const validateFieldInternal = useCallback(
    (name: string, currentValues: Record<string, unknown>): string | null => {
      const v = validatorRef.current;
      if (!v) return null;
      return v.validateField(name, currentValues[name], currentValues);
    },
    [],
  );

  const setErrorForField = useCallback(
    (name: string, msg: string | null) => {
      setErrors((prev) => {
        if (msg) {
          if (prev[name] === msg) return prev; // no change
          return { ...prev, [name]: msg };
        }
        if (!(name in prev)) return prev; // no change
        const next = { ...prev };
        delete next[name];
        return next;
      });
    },
    [],
  );

  // Stable setFieldValue — no values/validator/mode in dependency
  const setFieldValue = useCallback(
    (name: string, value: unknown) => {
      setValues((prev) => {
        if (prev[name] === value) return prev; // skip no-op
        return { ...prev, [name]: value };
      });
      // Validate in onChange mode — run after state update via ref
      if (modeRef.current === 'onChange') {
        // Use a microtask to read the updated values ref after React batches
        const nextValues = { ...valuesRef.current, [name]: value };
        const msg = validateFieldInternal(name, nextValues);
        setErrorForField(name, msg);
      }
    },
    [validateFieldInternal, setErrorForField],
  );

  // Stable setFieldTouched — reads values from ref
  const setFieldTouched = useCallback(
    (name: string, isTouched = true) => {
      setTouched((prev) => {
        if (prev[name] === isTouched) return prev;
        return { ...prev, [name]: isTouched };
      });
      if (modeRef.current === 'onBlur') {
        const msg = validateFieldInternal(name, valuesRef.current);
        setErrorForField(name, msg);
      }
    },
    [validateFieldInternal, setErrorForField],
  );

  // Public validation methods
  const runValidateField = useCallback(
    (name: string): string | null => {
      const msg = validateFieldInternal(name, valuesRef.current);
      setErrorForField(name, msg);
      return msg;
    },
    [validateFieldInternal, setErrorForField],
  );

  const runValidateForm = useCallback((): Record<string, string> => {
    const v = validatorRef.current;
    if (!v) return {};
    const result = v.validate(valuesRef.current);
    setErrors(result);
    return result;
  }, []);

  const setFieldError = useCallback((name: string, error: string) => {
    setErrorForField(name, error);
  }, [setErrorForField]);

  const clearFieldError = useCallback((name: string) => {
    setErrorForField(name, null);
  }, [setErrorForField]);

  // Submit — reads values from ref for stability
  const handleSubmit = useCallback(
    (onSubmit: (values: T) => void | Promise<void>) => {
      return async (e?: React.FormEvent) => {
        e?.preventDefault();

        const currentValues = valuesRef.current as T;

        // Touch all fields
        const allTouched: Record<string, boolean> = {};
        for (const key of Object.keys(currentValues)) {
          allTouched[key] = true;
        }
        setTouched(allTouched);

        // Validate
        const v = validatorRef.current;
        const formErrors = v ? v.validate(currentValues) : {};
        setErrors(formErrors);

        if (Object.keys(formErrors).length > 0) return;

        setIsSubmitting(true);
        try {
          await onSubmit(currentValues);
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [],
  );

  // Reset
  const reset = useCallback(
    (nextValues?: Partial<T>) => {
      const resetTo = nextValues
        ? { ...defaultsRef.current, ...nextValues }
        : { ...defaultsRef.current };
      setValues(resetTo as T);
      setErrors({});
      setTouched({});
      setIsSubmitting(false);
    },
    [],
  );

  // Context value
  const contextValue = useMemo<FormContextValue>(
    () => ({
      values,
      errors,
      touched,
      dirtyFields,
      access,
      mode,
      setFieldValue,
      setFieldTouched,
      setFieldError,
      clearFieldError,
      validateField: runValidateField,
      validateForm: runValidateForm,
      reset: reset as (nextValues?: Record<string, unknown>) => void,
      isValid,
      isDirty,
      isSubmitting,
      validator: validator ?? null,
    }),
    [
      values, errors, touched, dirtyFields, access, mode,
      setFieldValue, setFieldTouched, setFieldError, clearFieldError,
      runValidateField, runValidateForm, reset, isValid, isDirty, isSubmitting,
      validator,
    ],
  );

  // FormProvider — stable reference as long as contextValue doesn't change
  const FormProvider = useMemo(() => {
    const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      React.createElement(FormContext.Provider, { value: contextValue }, children);
    Provider.displayName = 'FormProvider';
    return Provider;
  }, [contextValue]);

  return {
    values,
    errors,
    touched,
    dirtyFields,
    setFieldValue,
    setFieldTouched,
    validateField: runValidateField,
    validateForm: runValidateForm,
    handleSubmit,
    reset,
    isValid,
    isDirty,
    isSubmitting,
    FormProvider,
  };
}
