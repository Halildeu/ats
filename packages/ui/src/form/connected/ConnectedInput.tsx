'use client';

import React, { forwardRef, useCallback } from 'react';
import { Input, type InputProps } from '../../primitives/input/Input';
import { useFormField } from '../useFormField';
import type { AccessLevel } from '../../internal/access-controller';

/** Props for the ConnectedInput component.
 * @example
 * ```tsx
 * <ConnectedInput />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/connected-input)
 */
export interface ConnectedInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'onValueChange' | 'onBlur' | 'error'> {
  /** Field name matching the form schema key. */
  name: string;
  /** Per-field access override. */
  access?: AccessLevel;
  /** Placeholder text shown when the input is empty. */
  placeholder?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Size variant for the input control. */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS class name. */
  className?: string;
}

/**
 * Input pre-wired to form context via `onValueChange`.
 */
export const ConnectedInput = forwardRef<HTMLInputElement, ConnectedInputProps>(
  function ConnectedInput({ name, access, ...rest }, ref) {
    const field = useFormField(name, access);

    const handleValueChange = useCallback(
      (value: string) => field.onChange(value),
      [field.onChange],
    );

    return (
      <Input
        ref={ref}
        {...rest}
        value={(field.value as string) ?? ''}
        onValueChange={handleValueChange}
        onBlur={field.onBlur}
        error={field.error}
        disabled={field.fieldProps.disabled}
        aria-invalid={field.fieldProps['aria-invalid']}
      />
    );
  },
);

ConnectedInput.displayName = "ConnectedInput";

/** Type alias for ConnectedInput ref. */
export type ConnectedInputRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedInput element. */
export type ConnectedInputElement = HTMLElement;
/** Type alias for ConnectedInput cssproperties. */
export type ConnectedInputCSSProperties = React.CSSProperties;
