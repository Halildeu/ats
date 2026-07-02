import React, { forwardRef, useId, useState } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  withAccessGuard,
  stateAttrs,
  peerFocusVisibleRingClass,
  type AccessControlledProps,
} from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Radio — Single-select option within a RadioGroup                   */
/* ------------------------------------------------------------------ */

export type RadioSize = 'sm' | 'md' | 'lg';

/** Props for the Radio component. */
export interface RadioProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>,
    AccessControlledProps {
  label?: string;
  description?: string;
  /** Component size */
  size?: RadioSize;
  /** @deprecated Use `size` instead. Will be removed in v3.0.0. */
  radioSize?: RadioSize;
  /** Density controls gap and text size */
  density?: 'compact' | 'comfortable' | 'spacious';
  error?: boolean | string | React.ReactNode;
  /** Show a loading indicator on the radio; makes it non-interactive */
  loading?: boolean;
}

export type RadioDensity = 'compact' | 'comfortable' | 'spacious';

const densityStyles: Record<RadioDensity, { gap: string; text: string }> = {
  compact: { gap: 'gap-1.5', text: 'text-xs' },
  comfortable: { gap: 'gap-2.5', text: 'text-sm' },
  spacious: { gap: 'gap-3.5', text: 'text-base' },
};

const dotSizes: Record<RadioSize, { outer: string; inner: string }> = {
  sm: { outer: 'h-3.5 w-3.5', inner: 'h-1.5 w-1.5' },
  md: { outer: 'h-4 w-4', inner: 'h-2 w-2' },
  lg: { outer: 'h-5 w-5', inner: 'h-2.5 w-2.5' },
};

/**
 * Single-select radio option with label, description, density control, and loading state.
 *
 * @example
 * ```tsx
 * <RadioGroup name="plan" value={plan} onChange={setPlan}>
 *   <Radio value="free" label="Free" description="Up to 5 users" />
 *   <Radio value="pro" label="Pro" description="Unlimited users" />
 * </RadioGroup>
 * ```
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      label,
      description,
      size: sizeProp,
      radioSize,
      density = 'comfortable',
      error = false,
      loading = false,
      disabled,
      checked,
      className,
      id: externalId,
      access = 'full',
      accessReason,
      ...rest
    },
    ref,
  ) => {
    const resolvedSize = sizeProp ?? radioSize ?? 'md';

    if (process.env.NODE_ENV !== 'production' && radioSize !== undefined) {
      console.warn(
        '[DesignSystem] "Radio" prop "radioSize" is deprecated. Use "size" instead. "radioSize" will be removed in v3.0.0.',
      );
    }

    const autoId = useId();
    const id = externalId ?? autoId;
    const accessState = resolveAccessState(access);

    if (accessState.isHidden) return null;

    const isDisabled = disabled || loading || accessState.isDisabled;
    const isReadonly = accessState.isReadonly;

    // For readonly: HTML radio readOnly doesn't block clicks.
    // Use withAccessGuard to actively preventDefault + stopPropagation.
    const guardedChange = withAccessGuard<React.ChangeEvent<HTMLInputElement>>(
      access,
      rest.onChange,
      disabled,
    );

    // Block label click delegation for readonly/disabled
    const handleLabelClick =
      isReadonly || isDisabled
        ? (e: React.MouseEvent) => {
            e.preventDefault();
          }
        : undefined;

    // Strip onChange from rest so guardedChange takes over
    const { onChange: _onChange, ...restWithoutChange } = rest;

    return (
      <label
        htmlFor={isReadonly ? undefined : id}
        onClick={handleLabelClick}
        className={cn(
          'inline-flex cursor-pointer items-start',
          densityStyles[density].gap,
          isDisabled && 'cursor-not-allowed opacity-50',
          isReadonly && 'cursor-default opacity-70',
          className,
        )}
        title={accessReason}
        {...stateAttrs({
          access,
          state: checked ? 'checked' : 'unchecked',
          disabled: isDisabled,
          readonly: isReadonly,
          error,
          loading,
          component: 'radio',
        })}
        aria-readonly={isReadonly || undefined}
      >
        <span className="relative mt-0.5 flex items-center justify-center">
          <input
            ref={ref}
            id={id}
            type="radio"
            checked={checked}
            disabled={isDisabled}
            aria-invalid={Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            onChange={guardedChange}
            onClick={isReadonly ? (e) => e.preventDefault() : undefined}
            // PR-10: `peer` is required for the proxy span's
            // `peer-focus-visible:` rules below to fire (same pattern
            // as Checkbox).
            className="peer sr-only"
            {...restWithoutChange}
          />
          <span
            className={cn(
              'flex items-center justify-center rounded-full border-2 transition-colors duration-(--motion-duration-fast)',
              dotSizes[resolvedSize].outer,
              checked
                ? 'border-action-primary'
                : error
                  ? 'border-state-danger-text'
                  : 'border-border-default',
              // PR-10: visible focus ring on the proxy span when the
              // sr-only input has :focus-visible (keyboard nav).
              peerFocusVisibleRingClass('ring'),
            )}
            aria-hidden
          >
            {loading ? (
              <svg
                className={cn('animate-spin text-text-secondary', dotSizes[resolvedSize].inner)}
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path
                  d="M14 8a6 6 0 00-6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : checked ? (
              <span
                className={cn('rounded-full bg-action-primary', dotSizes[resolvedSize].inner)}
              />
            ) : null}
          </span>
        </span>
        {(label || description) && (
          <span className="flex flex-col">
            {label && (
              <span className={cn(densityStyles[density].text, 'font-medium text-text-primary')}>
                {label}
              </span>
            )}
            {description && <span className="text-xs text-text-secondary">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);

Radio.displayName = 'Radio';

/* ------------------------------------------------------------------ */
/*  RadioGroup — Manages a set of Radio buttons                        */
/* ------------------------------------------------------------------ */

export interface RadioGroupProps {
  name: string;
  value?: string;
  /** Initial selected value for uncontrolled mode. Ignored when `value` is provided. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  className?: string;
  children: React.ReactNode;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value: valueProp,
  defaultValue,
  onChange,
  direction = 'vertical',
  className,
  children,
}) => {
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const isControlled = valueProp !== undefined;
  const currentValue = isControlled ? valueProp : internalValue;

  const handleChange = (childValue: string) => {
    if (!isControlled) {
      setInternalValue(childValue);
    }
    onChange?.(childValue);
  };

  return (
    <div
      role="radiogroup"
      className={cn(
        'flex',
        direction === 'vertical' ? 'flex-col gap-2.5' : 'flex-row flex-wrap gap-4',
        className,
      )}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<RadioProps>(child)) return child;
        return React.cloneElement(child, {
          name,
          checked: child.props.value === currentValue,
          onChange: () => handleChange(child.props.value as string),
        });
      })}
    </div>
  );
};

RadioGroup.displayName = 'RadioGroup';
