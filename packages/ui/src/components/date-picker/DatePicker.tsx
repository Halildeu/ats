import React from "react";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import {
  buildDescribedBy,
  FieldControlShell,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldTone,
  type FieldSize,
} from "../../primitives/_shared/FieldControlPrimitives";
import { Text } from "../../primitives/text/Text";

export interface DatePickerMessages {
  emptyValueLabel?: string;
}

/** Props for the DatePicker component. */
export interface DatePickerProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "children">,
    AccessControlledProps {
  /** Field label displayed above the input. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the input. */
  hint?: React.ReactNode;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** @deprecated Use `error` instead. Whether the input is in an invalid state. */
  invalid?: boolean;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Callback fired when the date value changes. */
  onValueChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Whether the input spans the full container width. */
  fullWidth?: boolean;
  /** Locale-specific message overrides. */
  messages?: DatePickerMessages;
}

/**
 * Native date input wrapped in the field control shell with label, description, and validation.
 *
 * @example
 * ```tsx
 * <DatePicker
 *   label="Start date"
 *   value={startDate}
 *   onChange={handleChange}
 *   error={errors.startDate}
 * />
 * ```
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  {
    id,
    label,
    description,
    hint,
    error,
    invalid = false,
    size = "md",
    onChange,
    onValueChange,
    disabled = false,
    required = false,
    className,
    fullWidth = true,
    messages,
    access = "full",
    accessReason,
    value,
    defaultValue,
    min,
    max,
    ...props
  },
  forwardedRef,
) {
  if (process.env.NODE_ENV !== "production" && invalid !== undefined && invalid !== false) {
    console.warn(
      '[DesignSystem] "DatePicker" prop "invalid" is deprecated. Use "error" instead. "invalid" will be removed in v3.0.0.',
    );
  }

  const accessState = resolveAccessState(access);
  const generatedId = React.useId();
  const inputId = id ?? `date-picker-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = buildDescribedBy(descriptionId, error ? errorId : hintId);
  const isReadonly = accessState.isReadonly;
  const isDisabled = disabled || accessState.isDisabled;
  const tone = getFieldTone({ invalid: invalid || Boolean(error), disabled: isDisabled, readonly: isReadonly });
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() => `${defaultValue ?? ""}`);
  const currentValue = isControlled ? `${value ?? ""}` : internalValue;
  const emptyValueLabel = messages?.emptyValueLabel ?? "Tarih secin";

  React.useEffect(() => {
    if (!isControlled) return;
    setInternalValue(`${value ?? ""}`);
  }, [isControlled, value]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadonly) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const nextValue = event.target.value;
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onChange?.(event);
    onValueChange?.(nextValue, event);
  };

  if (accessState.isHidden) {
    return null;
  }

  return (
    <FieldControlShell
      inputId={inputId}
      label={label}
      description={description}
      hint={hint}
      error={error}
      required={required}
      fullWidth={fullWidth}
      data-access-state={accessState.state}
    >
      <div className={getFieldFrameClass(size, tone, fullWidth, className)}>
        <input
          {...props}
          ref={forwardedRef}
          id={inputId}
          type="date"
          value={currentValue}
          min={min}
          max={max}
          disabled={isDisabled}
          required={required}
          aria-invalid={invalid || Boolean(error) || undefined}
          aria-readonly={isReadonly || undefined}
          aria-disabled={isDisabled || isReadonly || undefined}
          aria-describedby={describedBy}
          className={getFieldInputClass(size, "absolute inset-0 opacity-0 cursor-pointer")}
          onChange={handleChange}
        />
        <Text
          as="span"
          variant={currentValue ? "muted" : "secondary"}
          className="pointer-events-none flex-1 truncate tabular-nums"
          title={accessReason}
        >
          {currentValue
            ? new Date(currentValue + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })
            : emptyValueLabel}
        </Text>
        <svg className="pointer-events-none h-4 w-4 shrink-0 text-text-secondary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
        </svg>
      </div>
    </FieldControlShell>
  );
});

DatePicker.displayName = "DatePicker";

export default DatePicker;
