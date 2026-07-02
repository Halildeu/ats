'use client';

import React, { forwardRef, useCallback } from 'react';
import { Checkbox, type CheckboxProps } from '../../primitives/checkbox/Checkbox';
import { useFormField } from '../useFormField';
import { cn } from '../../utils/cn';
import type { AccessLevel } from '../../internal/access-controller';

/** Form-connected checkbox that binds to a form field by name.
 * @example
 * ```tsx
 * <ConnectedCheckbox />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/connected-checkbox)
 */
export interface ConnectedCheckboxProps
  extends Omit<CheckboxProps, 'checked' | 'onChange' | 'onBlur'> {
  /** Form field name used to read/write the boolean value. */
  name: string;
  /** Access level that controls disabled/readonly/hidden state. */
  access?: AccessLevel;
  /** Label text displayed next to the checkbox. */
  label?: React.ReactNode;
  /** Whether the checkbox is disabled. */
  disabled?: boolean;
  /** Additional CSS class name. */
  className?: string;
  /** Size variant for the checkbox control. */
  size?: 'sm' | 'md';
}

/** Form-connected checkbox that auto-binds checked state, onChange, and onBlur to form context. */
export const ConnectedCheckbox = forwardRef<HTMLInputElement, ConnectedCheckboxProps>(
  function ConnectedCheckbox({ name, access, className, ...rest }, ref) {
    const field = useFormField(name, access);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.checked),
      [field.onChange],
    );

    return (
      <Checkbox
        ref={ref}
        {...rest}
        className={cn("border border-transparent", className)}
        checked={Boolean(field.value)}
        onChange={handleChange}
        onBlur={field.onBlur}
        disabled={field.fieldProps.disabled}
      />
    );
  },
);

ConnectedCheckbox.displayName = "ConnectedCheckbox";

/** Type alias for ConnectedCheckbox ref. */
export type ConnectedCheckboxRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedCheckbox element. */
export type ConnectedCheckboxElement = HTMLElement;
/** Type alias for ConnectedCheckbox cssproperties. */
export type ConnectedCheckboxCSSProperties = React.CSSProperties;
