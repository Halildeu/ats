'use client';

import React, { forwardRef } from 'react';
import { useFormField } from '../useFormField';
import type { AccessLevel } from '../../internal/access-controller';

/** Props for the ConnectedTextarea component.
 * @example
 * ```tsx
 * <ConnectedTextarea />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/connected-textarea)
 */
export interface ConnectedTextareaProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange' | 'onBlur'
  > {
  /** Field name used to bind to form context. */
  name: string;
  /** Access level controlling the field's interactivity. */
  access?: AccessLevel;
  /** Accessible label for the textarea. */
  label?: string;
  /** Placeholder text shown when the textarea is empty. */
  placeholder?: string;
  /** Whether the textarea is disabled. */
  disabled?: boolean;
  /** Additional CSS class name. */
  className?: string;
  /** Number of visible text rows. */
  rows?: number;
}

/**
 * Textarea pre-wired to form context.
 * Uses a native textarea since design-system doesn't have a Textarea primitive.
 */
export const ConnectedTextarea = forwardRef<
  HTMLTextAreaElement,
  ConnectedTextareaProps
>(function ConnectedTextarea({ name, access, label, ...rest }, ref) {
  const { fieldProps } = useFormField(name, access);

  return (
    <textarea
      ref={ref}
      {...rest}
      value={(fieldProps.value as string) ?? ''}
      onChange={(e) => fieldProps.onChange(e.target.value)}
      onBlur={fieldProps.onBlur}
      disabled={fieldProps.disabled}
      aria-invalid={fieldProps['aria-invalid']}
      aria-label={label}
    />
  );
});

ConnectedTextarea.displayName = "ConnectedTextarea";

/** Type alias for ConnectedTextarea ref. */
export type ConnectedTextareaRef = React.Ref<HTMLElement>;
/** Type alias for ConnectedTextarea element. */
export type ConnectedTextareaElement = HTMLElement;
/** Type alias for ConnectedTextarea cssproperties. */
export type ConnectedTextareaCSSProperties = React.CSSProperties;
