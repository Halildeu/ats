import React, { forwardRef, useId, useState } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  withAccessGuard,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { stateAttrs, hasFocusVisibleRingClass, guardAria } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Switch — Toggle control                                            */
/* ------------------------------------------------------------------ */

export type SwitchSize = 'sm' | 'md' | 'lg';

export type SwitchVariant = 'default' | 'destructive';

export type SwitchDensity = 'compact' | 'comfortable' | 'spacious';

/** Props for the Switch component. */
export interface SwitchProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>,
    AccessControlledProps {
  /** Label text */
  label?: string;
  /** Description below label */
  description?: string;
  /** Component size */
  size?: SwitchSize;
  /** @deprecated Use `size` instead. Will be removed in v3.0.0. */
  switchSize?: SwitchSize;
  /** Visual variant — "destructive" uses error color when checked */
  variant?: SwitchVariant;
  /** Density controls scale of the switch */
  density?: SwitchDensity;
  /** Initial checked state for uncontrolled mode. Ignored when `checked` is provided. */
  defaultChecked?: boolean;
  /** Checked state (controlled) */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Error state — sets aria-invalid when truthy */
  error?: boolean | string | React.ReactNode;
  /** Show a loading indicator on the thumb; makes the switch non-interactive */
  loading?: boolean;
}

const switchDensityStyles: Record<SwitchDensity, string> = {
  compact: 'scale-75',
  comfortable: '',
  spacious: 'scale-110',
};

const trackSizes: Record<SwitchSize, string> = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
  lg: 'h-6 w-11',
};

const thumbSizes: Record<SwitchSize, { base: string; translate: string }> = {
  sm: { base: 'h-3 w-3', translate: 'translate-x-3' },
  md: { base: 'h-4 w-4', translate: 'translate-x-4' },
  lg: { base: 'h-5 w-5', translate: 'translate-x-5' },
};

/**
 * Toggle switch control with label, description, destructive variant, and loading state.
 *
 * @example
 * ```tsx
 * <Switch
 *   label="Enable notifications"
 *   checked={enabled}
 *   onCheckedChange={setEnabled}
 * />
 * ```
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      label,
      description,
      size: sizeProp,
      switchSize,
      variant = 'default',
      density = 'comfortable',
      defaultChecked: defaultCheckedProp,
      checked: checkedProp,
      onCheckedChange,
      error = false,
      loading = false,
      disabled,
      className,
      id: externalId,
      access = 'full',
      accessReason,
      ...rest
    },
    ref,
  ) => {
    const resolvedSize = sizeProp ?? switchSize ?? 'md';

    if (process.env.NODE_ENV !== 'production' && switchSize !== undefined) {
      console.warn(
        '[DesignSystem] "Switch" prop "switchSize" is deprecated. Use "size" instead. "switchSize" will be removed in v3.0.0.',
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

    // For readonly: HTML checkbox readOnly doesn't block clicks.
    // Use withAccessGuard to actively preventDefault + stopPropagation.
    const guardedChange = withAccessGuard<React.ChangeEvent<HTMLInputElement>>(
      access,
      (e) => {
        if (!isControlled) {
          setInternalChecked(e.target.checked);
        }
        onCheckedChange?.(e.target.checked);
      },
      disabled,
    );

    // Block label click delegation for readonly/disabled
    const handleLabelClick =
      isReadonly || isDisabled
        ? (e: React.MouseEvent) => {
            e.preventDefault();
          }
        : undefined;

    return (
      <label
        htmlFor={isReadonly ? undefined : id}
        onClick={handleLabelClick}
        className={cn(
          'inline-flex cursor-pointer items-start gap-3',
          isDisabled && 'cursor-not-allowed opacity-50',
          isReadonly && 'cursor-default opacity-70',
          // PR-10: has(:focus-visible), not focus-visible. The visual
          // touch target is this <label>, but the focused element is
          // the sr-only <input> child. `focus-visible:` would never
          // fire on the label (label isn't focused). `focus-within:`
          // would over-fire (mouse clicks also focus the input).
          // `has-[:focus-visible]:` is the strictly-correct rule —
          // ring lights up only when a descendant matches the
          // keyboard-focus heuristic.
          hasFocusVisibleRingClass('ring'),
          className,
        )}
        title={accessReason}
        {...stateAttrs({
          access,
          state: checked ? 'checked' : 'unchecked',
          disabled: isDisabled,
          readonly: isReadonly,
          error: Boolean(error),
          loading,
          component: 'switch',
        })}
        aria-readonly={isReadonly || undefined}
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={isDisabled}
          aria-invalid={Boolean(error) || undefined}
          {...guardAria({ access, disabled: isDisabled })}
          onChange={guardedChange}
          onClick={isReadonly ? (e) => e.preventDefault() : undefined}
          className="sr-only"
          {...rest}
        />
        <span
          className={cn(
            'relative inline-flex shrink-0 rounded-full transition-colors duration-(--motion-duration-medium)',
            trackSizes[resolvedSize],
            density !== 'comfortable' && switchDensityStyles[density],
            isDisabled && 'cursor-not-allowed',
            isReadonly && 'cursor-default',
            !isDisabled && !isReadonly && 'cursor-pointer',
          )}
          style={{
            backgroundColor: checked
              ? variant === 'destructive'
                ? 'var(--state-error-text)'
                : 'var(--action-primary)'
              : 'var(--border-default)',
          }}
          aria-hidden
        >
          <span
            className={cn(
              'pointer-events-none inline-flex items-center justify-center rounded-full bg-surface-default shadow-xs transition-[translate] duration-(--motion-duration-medium)',
              thumbSizes[resolvedSize].base,
              'translate-y-0.5 translate-x-0.5',
              checked && thumbSizes[resolvedSize].translate,
            )}
          >
            {loading && (
              <svg
                className="animate-spin text-text-secondary"
                style={{ width: '60%', height: '60%' }}
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
            )}
          </span>
        </span>
        {(label || description) && (
          <span className="flex flex-col">
            {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
            {description && <span className="text-xs text-text-secondary">{description}</span>}
          </span>
        )}
      </label>
    );
  },
);

Switch.displayName = 'Switch';
