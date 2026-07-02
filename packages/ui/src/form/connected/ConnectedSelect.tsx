'use client';

import React, { forwardRef, useCallback } from 'react';
import { Select, type SelectProps } from '../../primitives/select/Select';
import { useFormField } from '../useFormField';
import type { AccessLevel } from '../../internal/access-controller';

/** Form-connected select that binds to a form field by name.
 * @example
 * ```tsx
 * <ConnectedSelect />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/connected-select)
 */
export interface ConnectedSelectProps
  extends Omit<SelectProps, 'value' | 'onChange' | 'onBlur' | 'error'> {
  /** Form field name used to read/write the selected value. */
  name: string;
  /** Access level that controls disabled/readonly/hidden state. */
  access?: AccessLevel;
  /** Whether the select is disabled. */
  disabled?: boolean;
  /** Placeholder text shown when no option is selected. */
  placeholder?: string;
  /** Additional CSS class name. */
  className?: string;
  /** Size variant for the select control. */
  size?: 'sm' | 'md' | 'lg';
}

/** Form-connected select that auto-binds value, onChange, and error state to form context. */
export const ConnectedSelect = forwardRef<HTMLSelectElement, ConnectedSelectProps>(
  function ConnectedSelect({ name, access, ...rest }, ref) {
    const field = useFormField(name, access);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => field.onChange(e.target.value),
      [field.onChange],
    );

    return (
      <Select
        ref={ref}
        {...rest}
        value={(field.value as string) ?? ''}
        onChange={handleChange}
        onBlur={field.onBlur}
        error={field.error}
        disabled={field.fieldProps.disabled}
        aria-invalid={field.fieldProps['aria-invalid']}
      />
    );
  },
);

ConnectedSelect.displayName = "ConnectedSelect";

/** Type alias for ConnectedSelect ref. */
export type ConnectedSelectRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedSelect element. */
export type ConnectedSelectElement = HTMLElement;
/** Type alias for ConnectedSelect cssproperties. */
export type ConnectedSelectCSSProperties = React.CSSProperties;
