'use client';
/* ------------------------------------------------------------------ */
/*  ConnectedFormField — FormField that auto-binds to form context     */
/* ------------------------------------------------------------------ */

import React from 'react';
import { FormField } from '../components/form-field/FormField';
import { useFormField } from './useFormField';
import type { AccessLevel } from '../internal/access-controller';

/** Props for the ConnectedFormField component. */
export interface ConnectedFormFieldProps {
  /** Field name matching the form schema key. */
  name: string;
  /** Label text displayed above the input. */
  label?: React.ReactNode;
  /** Help text shown below the input. */
  help?: React.ReactNode;
  /** Whether the field is required. */
  required?: boolean;
  /** Whether the field is marked as optional. */
  optional?: boolean;
  /** Whether to use horizontal layout. */
  horizontal?: boolean;
  /** Custom HTML `for` attribute for the label. */
  htmlFor?: string;
  /** Additional CSS class name for the wrapper. */
  className?: string;
  /** Per-field access override (merged with form-level). */
  access?: AccessLevel;
  /** Child input element to auto-bind with form field props. */
  children: React.ReactElement;
}

/**
 * Enhanced FormField that reads form context and auto-binds error state.
 *
 * Wraps the existing `FormField` component — passes error from validation,
 * and injects `value`, `onChange`, `onBlur`, `disabled` into the child input.
 *
 * @example
 * ```tsx
 * <ConnectedFormField name="email" label="Email" required>
 *   <Input placeholder="john@example.com" />
 * </ConnectedFormField>
 * ```
 */
export const ConnectedFormField = React.forwardRef<HTMLDivElement, ConnectedFormFieldProps>(({
  name,
  label,
  help,
  required,
  optional,
  horizontal,
  htmlFor,
  className,
  access,
  children,
}, ref) => {
  const { fieldProps } = useFormField(name, access);

  // Clone child to inject field props
  const enhancedChild = React.cloneElement(children, {
    value: fieldProps.value,
    onChange: fieldProps.onChange,
    onBlur: fieldProps.onBlur,
    disabled: fieldProps.disabled,
    'aria-invalid': fieldProps['aria-invalid'],
  });

  return (
    <FormField
      ref={ref}
      label={label}
      error={fieldProps.error}
      help={help}
      required={required}
      optional={optional}
      horizontal={horizontal}
      htmlFor={htmlFor}
      disabled={fieldProps.disabled}
      className={className}
    >
      {enhancedChild}
    </FormField>
  );
});

ConnectedFormField.displayName = 'ConnectedFormField';

/** Type alias for ConnectedFormField ref. */
export type ConnectedFormFieldRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedFormField element. */
export type ConnectedFormFieldElement = HTMLElement;
/** Type alias for ConnectedFormField cssproperties. */
export type ConnectedFormFieldCSSProperties = React.CSSProperties;
