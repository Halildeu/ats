'use client';

import React, { forwardRef } from 'react';
import { Radio, type RadioProps } from '../../primitives/radio/Radio';
import { useFormField } from '../useFormField';
import { cn } from '../../utils/cn';
import type { AccessLevel } from '../../internal/access-controller';

/** Form-connected radio button that binds to a form field by name.
 * @example
 * ```tsx
 * <ConnectedRadio />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/connected-radio)
 */
export interface ConnectedRadioProps
  extends Omit<RadioProps, 'checked' | 'onChange' | 'onBlur'> {
  /** Form field name used to read/write the selected radio value. */
  name: string;
  /** The value this radio option represents. */
  radioValue: string;
  /** Access level that controls disabled/readonly/hidden state. */
  access?: AccessLevel;
  /** Label text displayed next to the radio button. */
  label?: string;
  /** Whether the radio button is disabled. */
  disabled?: boolean;
  /** Additional CSS class name. */
  className?: string;
}

/** Form-connected radio button that auto-binds checked state and onChange to form context. */
export const ConnectedRadio = forwardRef<HTMLInputElement, ConnectedRadioProps>(
  function ConnectedRadio({ name, radioValue, access, className, ...rest }, ref) {
    const { fieldProps } = useFormField(name, access);

    return (
      <Radio
        ref={ref}
        {...rest}
        className={cn("border border-transparent", className)}
        checked={fieldProps.value === radioValue}
        onChange={() => fieldProps.onChange(radioValue)}
        onBlur={fieldProps.onBlur}
        disabled={fieldProps.disabled}
      />
    );
  },
);

ConnectedRadio.displayName = "ConnectedRadio";

/** Type alias for ConnectedRadio ref. */
export type ConnectedRadioRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedRadio element. */
export type ConnectedRadioElement = HTMLElement;
/** Type alias for ConnectedRadio cssproperties. */
export type ConnectedRadioCSSProperties = React.CSSProperties;
