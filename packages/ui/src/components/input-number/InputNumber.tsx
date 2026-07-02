import React from "react";
import { cn } from "../../utils/cn";
import {
  FieldControlShell,
  buildDescribedBy,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldSlotClass,
  getFieldTone,
  type FieldSize,
} from "../../primitives/_shared/FieldControlPrimitives";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  InputNumber — Numeric input with increment/decrement buttons       */
/*                                                                     */
/*  Supports: label, description, hint, error, prefix, suffix,        */
/*  min/max clamping, step, precision, keyboard arrows, forwardRef.   */
/* ------------------------------------------------------------------ */

/** Props for the InputNumber component.
 * @example
 * ```tsx
 * <InputNumber />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/input-number)
 */
export interface InputNumberProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "size" | "onChange" | "value" | "defaultValue" | "type" | "prefix"
  >,
    AccessControlledProps {
  /** Controlled numeric value. */
  value?: number | null;
  /** Initial value for uncontrolled mode. */
  defaultValue?: number | null;
  /** Callback fired when the numeric value changes. */
  onChange?: (value: number | null) => void;
  /** Minimum allowed value. */
  min?: number;
  /** Maximum allowed value. */
  max?: number;
  /** Increment/decrement step amount. */
  step?: number;
  /** Number of decimal places to display */
  precision?: number;
  /** Content rendered before the input. */
  prefix?: React.ReactNode;
  /** Content rendered after the input. */
  suffix?: React.ReactNode;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Whether the input is read-only. */
  readOnly?: boolean;
  /** Whether the input is in an invalid state. */
  invalid?: boolean;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** Field label displayed above the input. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the input. */
  hint?: React.ReactNode;
  /** Whether the field is required. */
  required?: boolean;
  /** Whether the input spans the full container width. */
  fullWidth?: boolean;
  /** Placeholder text shown when empty. */
  placeholder?: string;
  /** Additional CSS class name. */
  className?: string;
}

const clampValue = (
  val: number,
  min?: number,
  max?: number,
): number => {
  let result = val;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
};

const roundToPrecision = (val: number, precision?: number): number => {
  if (precision === undefined || precision < 0) return val;
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
};

const formatValue = (val: number | null, precision?: number): string => {
  if (val === null || val === undefined) return "";
  if (precision !== undefined && precision >= 0) {
    return val.toFixed(precision);
  }
  return String(val);
};

/** Numeric input with increment/decrement buttons, min/max clamping, step, and decimal precision. */
export const InputNumber = React.forwardRef<HTMLInputElement, InputNumberProps>(
  function InputNumber(
    {
      id,
      value,
      defaultValue,
      onChange,
      min,
      max,
      step = 1,
      precision,
      prefix,
      suffix,
      size = "md",
      disabled = false,
      readOnly = false,
      invalid = false,
      error,
      label,
      description,
      hint,
      required = false,
      fullWidth = true,
      placeholder,
      className,
      access,
      accessReason,
      ...props
    },
    forwardedRef,
  ) {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;
    const generatedId = React.useId();
    const inputId = id ?? `input-number-${generatedId}`;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = buildDescribedBy(
      descriptionId,
      error ? errorId : hintId,
    );

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<number | null>(
      () => (defaultValue !== undefined && defaultValue !== null ? defaultValue : null),
    );
    const [inputText, setInputText] = React.useState<string>(() =>
      formatValue(
        defaultValue !== undefined && defaultValue !== null ? defaultValue : null,
        precision,
      ),
    );
    const [isFocused, setIsFocused] = React.useState(false);

    const currentValue = isControlled ? (value ?? null) : internalValue;

    // Sync inputText when controlled value changes and not focused
    React.useEffect(() => {
      if (isControlled && !isFocused) {
        setInputText(formatValue(value ?? null, precision));
      }
    }, [isControlled, value, precision, isFocused]);

    const tone = getFieldTone({
      invalid: invalid || Boolean(error),
      disabled,
      readonly: readOnly,
    });

    const localRef = React.useRef<HTMLInputElement | null>(null);
    const assignRef = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const emitChange = React.useCallback(
      (nextValue: number | null) => {
        if (!isControlled) {
          setInternalValue(nextValue);
        }
        onChange?.(nextValue);
      },
      [isControlled, onChange],
    );

    const stepValue = React.useCallback(
      (direction: 1 | -1, multiplier: number = 1) => {
        if (disabled || readOnly) return;

        const base = currentValue ?? 0;
        const delta = step * multiplier * direction;
        let next = roundToPrecision(base + delta, precision);
        next = clampValue(next, min, max);
        emitChange(next);
        setInputText(formatValue(next, precision));
      },
      [currentValue, step, precision, min, max, disabled, readOnly, emitChange],
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || readOnly) return;

      const raw = event.target.value;
      setInputText(raw);

      if (raw === "" || raw === "-") {
        emitChange(null);
        return;
      }

      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const rounded = roundToPrecision(parsed, precision);
        emitChange(rounded);
      }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      if (currentValue !== null) {
        const clamped = clampValue(currentValue, min, max);
        const rounded = roundToPrecision(clamped, precision);
        if (rounded !== currentValue) {
          emitChange(rounded);
        }
        setInputText(formatValue(rounded, precision));
      } else {
        setInputText("");
      }
      props.onBlur?.(event);
    };

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      props.onFocus?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        stepValue(1, event.shiftKey ? 10 : 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        stepValue(-1, event.shiftKey ? 10 : 1);
      }
      props.onKeyDown?.(event);
    };

    const isDecrementDisabled =
      disabled || readOnly || (min !== undefined && currentValue !== null && currentValue <= min);
    const isIncrementDisabled =
      disabled || readOnly || (max !== undefined && currentValue !== null && currentValue >= max);

    const stepBtnClass = (isDisabled: boolean) =>
      cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-md text-xs font-bold transition select-none",
        "text-text-secondary hover:text-text-primary hover:bg-surface-muted",
        "active:bg-border-subtle",
        isDisabled && "pointer-events-none opacity-40",
      );

    return (
      <div className={cn(accessState.isDisabled && "pointer-events-none opacity-50")} title={accessReason}>
      <FieldControlShell
        inputId={inputId}
        label={label}
        description={
          description ? (
            <span id={descriptionId}>{description}</span>
          ) : undefined
        }
        hint={
          !error && hint ? <span id={hintId}>{hint}</span> : undefined
        }
        error={
          error ? <span id={errorId}>{error}</span> : undefined
        }
        required={required}
        fullWidth={fullWidth}
        data-access-state={accessState.state}
      >
        <div
          className={getFieldFrameClass(size, tone, fullWidth, className)}
          data-field-tone={tone}
          data-size={size}
          data-field-type="input-number"
        >
          {prefix ? (
            <span className={getFieldSlotClass(size)}>
              {prefix}
            </span>
          ) : null}
          <input
            {...props}
            ref={assignRef}
            id={inputId}
            type="text"
            inputMode="decimal"
            value={inputText}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
            placeholder={placeholder}
            role="spinbutton"
            aria-valuenow={currentValue ?? undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-invalid={invalid || Boolean(error) || undefined}
            aria-readonly={readOnly || undefined}
            aria-disabled={disabled || undefined}
            aria-describedby={describedBy}
            className={getFieldInputClass(size)}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
          />
          {suffix ? (
            <span className={getFieldSlotClass(size)}>
              {suffix}
            </span>
          ) : null}
          <span className="inline-flex flex-col items-center justify-center gap-0.5">
            <button
              type="button"
              tabIndex={-1}
              disabled={isIncrementDisabled}
              aria-label="Increment"
              className={stepBtnClass(isIncrementDisabled)}
              onClick={() => stepValue(1)}
              onMouseDown={(e) => e.preventDefault()}
            >
              +
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={isDecrementDisabled}
              aria-label="Decrement"
              className={stepBtnClass(isDecrementDisabled)}
              onClick={() => stepValue(-1)}
              onMouseDown={(e) => e.preventDefault()}
            >
              &minus;
            </button>
          </span>
        </div>
      </FieldControlShell>
      </div>
    );
  },
);

InputNumber.displayName = "InputNumber";

/** Type alias for InputNumber ref. */
export type InputNumberRef = React.Ref<HTMLElement>;
/** Type alias for InputNumber element. */
export type InputNumberElement = HTMLElement;
/** Type alias for InputNumber cssproperties. */
export type InputNumberCSSProperties = React.CSSProperties;
