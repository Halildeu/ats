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
/*  Checkbox                                                           */
/* ------------------------------------------------------------------ */

export type CheckboxSize = 'sm' | 'md' | 'lg';

/** Props for the Checkbox component. */
export interface CheckboxProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>,
    AccessControlledProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Component size */
  size?: CheckboxSize;
  /** @deprecated Use `size` instead. Will be removed in v3.0.0. */
  checkboxSize?: CheckboxSize;
  /** Initial checked state for uncontrolled mode. Ignored when `checked` is provided. */
  defaultChecked?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
  error?: boolean | string | React.ReactNode;
  /** Density controls gap and text size */
  density?: 'compact' | 'comfortable' | 'spacious';
  /** Visual variant — "card" wraps the checkbox in a bordered card container */
  variant?: 'default' | 'card';
  /** Show a loading indicator on the checkbox; makes it non-interactive */
  loading?: boolean;
}

const boxSizes: Record<CheckboxSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export type CheckboxDensity = 'compact' | 'comfortable' | 'spacious';

const densityStyles: Record<CheckboxDensity, { gap: string; text: string }> = {
  compact: { gap: 'gap-1.5', text: 'text-xs' },
  comfortable: { gap: 'gap-2.5', text: 'text-sm' },
  spacious: { gap: 'gap-3.5', text: 'text-base' },
};

const iconSizes: Record<CheckboxSize, string> = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
};

/**
 * Boolean toggle with label, description, indeterminate state, and card variant.
 *
 * @example
 * ```tsx
 * <Checkbox
 *   label="Accept terms and conditions"
 *   checked={accepted}
 *   onChange={(e) => setAccepted(e.target.checked)}
 * />
 * ```
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      size: sizeProp,
      checkboxSize: checkboxSizeProp,
      defaultChecked: defaultCheckedProp,
      indeterminate = false,
      error = false,
      density = 'comfortable',
      variant = 'default',
      loading = false,
      disabled,
      checked: checkedProp,
      className,
      id: externalId,
      onChange,
      access = 'full',
      accessReason,
      ...rest
    },
    ref,
  ) => {
    const checkboxSize = sizeProp ?? checkboxSizeProp ?? 'md';

    if (process.env.NODE_ENV !== 'production' && checkboxSizeProp !== undefined) {
      console.warn(
        '[DesignSystem] "Checkbox" prop "checkboxSize" is deprecated. Use "size" instead. "checkboxSize" will be removed in v3.0.0.',
      );
    }

    const autoId = useId();
    const id = externalId ?? autoId;

    // Uncontrolled mode: track internal checked state when `checked` prop is not provided
    const [internalChecked, setInternalChecked] = useState(defaultCheckedProp ?? false);
    const isControlled = checkedProp !== undefined;
    const checked = isControlled ? checkedProp : internalChecked;

    const accessState = resolveAccessState(access);

    if (accessState.isHidden) return null;

    const isDisabled = disabled || loading || accessState.isDisabled;
    const isReadonly = accessState.isReadonly;

    const innerRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        if (el) el.indeterminate = indeterminate;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
      },
      [ref, indeterminate],
    );

    const rawChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setInternalChecked(e.target.checked);
      }
      onChange?.(e);
    };

    // For readonly: HTML checkbox readOnly doesn't block clicks.
    // Use withAccessGuard to actively preventDefault + stopPropagation.
    const guardedChange = withAccessGuard<React.ChangeEvent<HTMLInputElement>>(
      access,
      rawChange,
      disabled,
    );

    // Block label click delegation for readonly/disabled
    const handleLabelClick =
      isReadonly || isDisabled
        ? (e: React.MouseEvent) => {
            e.preventDefault();
          }
        : undefined;

    const isActive = checked || indeterminate;

    const isCard = variant === 'card';

    return (
      <label
        htmlFor={isReadonly ? undefined : id}
        onClick={handleLabelClick}
        className={cn(
          'inline-flex cursor-pointer items-start',
          densityStyles[density].gap,
          isDisabled && 'cursor-not-allowed opacity-50',
          isReadonly && 'cursor-default opacity-70',
          isCard &&
            'rounded-lg border px-3 py-2.5 transition-colors duration-(--motion-duration-fast)',
          isCard &&
            (checked
              ? 'border-action-primary bg-[var(--action-primary-soft)]'
              : 'border-border-default bg-transparent'),
          className,
        )}
        title={accessReason}
        {...stateAttrs({
          access,
          state: indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked',
          disabled: isDisabled,
          readonly: isReadonly,
          error,
          loading,
          component: 'checkbox',
        })}
        aria-readonly={isReadonly || undefined}
      >
        <span className="relative mt-0.5 flex items-center justify-center">
          <input
            ref={innerRef}
            id={id}
            type="checkbox"
            checked={checked}
            disabled={isDisabled}
            aria-invalid={Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            onChange={guardedChange}
            onClick={isReadonly ? (e) => e.preventDefault() : undefined}
            // PR-10: `peer` is required for the proxy span's
            // `peer-focus-visible:` rules below to fire.
            className="peer sr-only"
            {...rest}
          />
          <span
            className={cn(
              'flex items-center justify-center rounded-xs border-2 transition-colors duration-(--motion-duration-fast)',
              boxSizes[checkboxSize],
              isActive
                ? 'border-action-primary bg-action-primary'
                : error
                  ? 'border-state-danger-text bg-transparent'
                  : 'border-border-default bg-transparent',
              // PR-10: visible focus ring on the proxy span when the
              // sr-only input has :focus-visible (keyboard nav). The
              // input is the immediate previous sibling and carries
              // the `peer` class — Tailwind's peer-* variants require
              // both.
              peerFocusVisibleRingClass('ring'),
            )}
            aria-hidden
          >
            {loading ? (
              <svg
                className={cn('animate-spin text-text-secondary', iconSizes[checkboxSize])}
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
            ) : isActive ? (
              <svg
                className={cn('text-text-inverse', iconSizes[checkboxSize])}
                viewBox="0 0 12 12"
                fill="none"
              >
                {indeterminate ? (
                  <path d="M2.5 6h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <path
                    d="M2.5 6L5 8.5l4.5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
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

Checkbox.displayName = 'Checkbox';
