'use client';
/* ------------------------------------------------------------------ */
/*  useFormField — per-field hook for form context binding              */
/*                                                                     */
/*  Returns value, error, touched, dirty and a fieldProps spread        */
/*  object ready for design-system input components.                    */
/* ------------------------------------------------------------------ */

import { useCallback, useMemo } from 'react';
import {
  resolveAccessState,
  type AccessLevel,
} from '../internal/access-controller';
import { useFormContext } from './FormContext';

export interface UseFormFieldReturn {
  value: unknown;
  error: string | null;
  touched: boolean;
  dirty: boolean;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  /** Spread onto design-system field components. */
  fieldProps: {
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    error: string | null;
    disabled: boolean;
    'aria-invalid': boolean;
  };
}

/**
 * Resolve effective access: form-level × field-level → most restrictive wins.
 */
const ACCESS_RANK: Record<AccessLevel, number> = {
  hidden: 0,
  disabled: 1,
  readonly: 2,
  full: 3,
};

function mostRestrictive(a: AccessLevel, b?: AccessLevel): AccessLevel {
  if (!b) return a;
  return ACCESS_RANK[a] <= ACCESS_RANK[b] ? a : b;
}

/**
 * Per-field hook. Reads form context and returns props ready to spread.
 *
 * @example
 * ```tsx
 * function NameField() {
 *   const { fieldProps } = useFormField('name');
 *   return <Input label="Name" {...fieldProps} />;
 * }
 * ```
 */
export function useFormField(
  name: string,
  fieldAccess?: AccessLevel,
): UseFormFieldReturn {
  const ctx = useFormContext();

  const value = ctx.values[name];
  const error = ctx.errors[name] ?? null;
  const isTouched = ctx.touched[name] ?? false;
  const isDirty = ctx.dirtyFields[name] ?? false;

  // Show error only after field is touched (or after submit attempt)
  const visibleError = isTouched ? error : null;

  // Access control: form-level × field-level
  const effectiveAccess = mostRestrictive(ctx.access, fieldAccess);
  const accessState = resolveAccessState(effectiveAccess);

  const onChange = useCallback(
    (nextValue: unknown) => {
      if (accessState.isDisabled || accessState.isReadonly) return;
      ctx.setFieldValue(name, nextValue);
    },
    [name, ctx.setFieldValue, accessState.isDisabled, accessState.isReadonly],
  );

  const onBlur = useCallback(() => {
    ctx.setFieldTouched(name, true);
  }, [name, ctx.setFieldTouched]);

  const fieldProps = useMemo(
    () => ({
      value,
      onChange,
      onBlur,
      error: visibleError,
      disabled: accessState.isDisabled,
      'aria-invalid': visibleError !== null,
    }),
    [value, onChange, onBlur, visibleError, accessState.isDisabled],
  );

  return {
    value,
    error: visibleError,
    touched: isTouched,
    dirty: isDirty,
    onChange,
    onBlur,
    fieldProps,
  };
}
