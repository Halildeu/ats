import React, { forwardRef, useState } from "react";
import {
  resolveAccessState,
  withAccessGuard,
  stateAttrs,
  guardAria,
  type AccessControlledProps,
} from "../../internal/interaction-core";
import { cn } from "../../utils/cn";
import type { SlotProps } from "../_shared/slot-types";

/* ------------------------------------------------------------------ */
/*  Select — Native select wrapper with consistent styling             */
/* ------------------------------------------------------------------ */

export type SelectSize = "sm" | "md" | "lg";
export type SelectDensity = "compact" | "comfortable" | "spacious";

const selectDensityStyles: Record<SelectDensity, string> = {
  compact: "py-1 text-xs",
  comfortable: "",
  spacious: "py-3 text-base",
};

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectSlot = "root" | "trigger" | "listbox" | "option";

/** Props for the Select component. */
export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size">,
    AccessControlledProps {
  /** Component size */
  size?: SelectSize;
  /** @deprecated Use `size` instead. Will be removed in v3.0.0. */
  selectSize?: SelectSize;
  options: SelectOption[];
  /** Initial selected value for uncontrolled mode. Ignored when `value` is provided. */
  defaultValue?: string;
  /** Placeholder (first disabled option) */
  placeholder?: string;
  error?: boolean | string | React.ReactNode;
  fullWidth?: boolean;
  /** Show a loading spinner replacing the chevron and disable the select */
  loading?: boolean;

  /** Density controls vertical padding and text size */
  density?: SelectDensity;

  /** Override props (className, style, etc.) on internal slot elements */
  slotProps?: SlotProps<SelectSlot>;
}

const sizeStyles: Record<SelectSize, string> = {
  sm: "h-8 text-xs px-2.5 pe-8",
  md: "h-9 text-sm px-3 pe-9",
  lg: "h-11 text-base px-3.5 pe-10",
};

/**
 * Native select dropdown with consistent styling, placeholder, loading state, and access control.
 *
 * @example
 * ```tsx
 * <Select
 *   options={[{ value: 'tr', label: 'Turkey' }, { value: 'us', label: 'USA' }]}
 *   placeholder="Select a country"
 *   onChange={handleChange}
 * />
 * ```
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      size: sizeProp,
      selectSize,
      options,
      defaultValue: defaultValueProp,
      placeholder,
      error = false,
      fullWidth = true,
      loading = false,
      disabled,
      className,
      value: valueProp,
      onChange,
      density = "comfortable",
      access = "full",
      accessReason,
      slotProps,
      ...rest
    },
    ref,
  ) => {
    const resolvedSize = sizeProp ?? selectSize ?? "md";

    if (process.env.NODE_ENV !== "production" && selectSize !== undefined) {
      console.warn(
        '[DesignSystem] "Select" prop "selectSize" is deprecated. Use "size" instead. "selectSize" will be removed in v3.0.0.',
      );
    }

    // Uncontrolled mode: track internal value when `value` prop is not provided
    const [internalValue, setInternalValue] = useState(defaultValueProp ?? "");
    const isControlled = valueProp !== undefined;
    const currentValue = isControlled ? valueProp : internalValue;

    const accessState = resolveAccessState(access);

    if (accessState.isHidden) return null;

    const isDisabled = disabled || loading || accessState.isDisabled;
    const isReadonly = accessState.isReadonly;

    const rawChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    // For readonly: block interaction via access guard
    const guardedChange = withAccessGuard<React.ChangeEvent<HTMLSelectElement>>(
      access,
      rawChange,
      disabled,
    );

    return (
      <div
        {...slotProps?.root}
        className={cn("relative", fullWidth && "w-full", slotProps?.root?.className)}
        title={accessReason}
        {...stateAttrs({
          access,
          disabled: isDisabled,
          readonly: isReadonly,
          error: Boolean(error),
          loading,
          component: "select",
        })}
      >
        <select
          ref={ref}
          disabled={isDisabled}
          value={currentValue}
          onChange={guardedChange}
          aria-invalid={Boolean(error) || undefined}
          {...guardAria({ access, disabled: isDisabled })}
          className={cn(
            "appearance-none rounded-lg border transition-colors duration-(--motion-duration-fast)",
            "bg-surface-default text-text-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isReadonly && "cursor-default opacity-70",
            "outline-hidden",
            error
              ? "border-state-danger-text focus:ring-2 focus:ring-state-danger-text/20"
              : "border-border-default focus:border-action-primary focus:ring-2 focus:ring-action-primary/20",
            sizeStyles[resolvedSize],
            density !== "comfortable" && selectDensityStyles[density],
            fullWidth && "w-full",
            className,
            slotProps?.trigger?.className,
          )}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Chevron icon or loading spinner */}
        {loading ? (
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-secondary"
            viewBox="0 0 24 24"
            fill="none"
            role="status"
            aria-label="Loading"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";
