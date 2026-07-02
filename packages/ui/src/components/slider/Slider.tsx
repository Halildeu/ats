import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import {
  buildDescribedBy,
  FieldControlShell,
  getFieldFrameClass,
  getFieldTone,
  type FieldSize,
} from "../../primitives/_shared/FieldControlPrimitives";
import { Text } from "../../primitives/text/Text";

/** Props for the Slider component. */
export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "children">,
    AccessControlledProps {
  /** Field label displayed above the slider. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the slider. */
  hint?: React.ReactNode;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** @deprecated Use `error` instead. Whether the slider is in an invalid state. */
  invalid?: boolean;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Callback fired when the slider value changes. */
  onValueChange?: (value: number, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Whether the slider spans the full container width. */
  fullWidth?: boolean;
  /** Label displayed at the minimum end of the track. */
  minLabel?: React.ReactNode;
  /** Label displayed at the maximum end of the track. */
  maxLabel?: React.ReactNode;
  /** Custom formatter for the displayed value. */
  valueFormatter?: (value: number) => React.ReactNode;
}

const toNumericValue = (value: string | number | readonly string[] | undefined, fallback: number) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/**
 * Range slider input with min/max labels, value formatter, and field control shell integration.
 *
 * @example
 * ```tsx
 * <Slider
 *   label="Volume"
 *   min={0}
 *   max={100}
 *   value={volume}
 *   onValueChange={setVolume}
 *   valueFormatter={(v) => `${v}%`}
 * />
 * ```
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
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
    access = "full",
    accessReason,
    min = 0,
    max = 100,
    step = 1,
    value,
    defaultValue,
    minLabel,
    maxLabel,
    valueFormatter,
    ...props
  },
  forwardedRef,
) {
  if (process.env.NODE_ENV !== "production" && invalid !== undefined && invalid !== false) {
    console.warn(
      '[DesignSystem] "Slider" prop "invalid" is deprecated. Use "error" instead. "invalid" will be removed in v3.0.0.',
    );
  }

  const accessState = resolveAccessState(access);
  const generatedId = React.useId();
  const inputId = id ?? `slider-${generatedId}`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = buildDescribedBy(descriptionId, error ? errorId : hintId);
  const isReadonly = accessState.isReadonly;
  const isDisabled = disabled || accessState.isDisabled;
  const tone = getFieldTone({ invalid: invalid || Boolean(error), disabled: isDisabled, readonly: isReadonly });
  const isControlled = value !== undefined;
  const resolvedMin = Number(min);
  const resolvedMax = Number(max);
  const [internalValue, setInternalValue] = React.useState(() => toNumericValue(defaultValue, resolvedMin));
  const currentValue = isControlled ? toNumericValue(value, resolvedMin) : internalValue;

  React.useEffect(() => {
    if (!isControlled) return;
    setInternalValue(toNumericValue(value, resolvedMin));
  }, [isControlled, resolvedMin, value]);

  const formattedValue = valueFormatter ? valueFormatter(currentValue) : `${currentValue}`;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadonly) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const nextValue = Number(event.target.value);
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
      <div className="flex flex-col gap-3">
        <div className={getFieldFrameClass(size, tone, fullWidth, className)}>
          <input
            {...props}
            ref={forwardedRef}
            id={inputId}
            type="range"
            min={min}
            max={max}
            step={step}
            value={currentValue}
            disabled={isDisabled}
            required={required}
            aria-invalid={invalid || Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            aria-disabled={isDisabled || isReadonly || undefined}
            aria-describedby={describedBy}
            title={accessReason}
            className={cn(
              "min-w-0 flex-1 accent-accent-primary bg-transparent",
              isReadonly ? "cursor-default" : isDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
            )}
            onChange={handleChange}
          />
          <Text
            as="span"
            className="shrink-0 rounded-full border border-border-default bg-[var(--surface-canvas)] px-3 py-1 text-xs font-semibold tabular-nums text-text-primary"
          >
            {formattedValue}
          </Text>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-text-secondary">
          <span>{minLabel ?? resolvedMin}</span>
          <span>{maxLabel ?? resolvedMax}</span>
        </div>
      </div>
    </FieldControlShell>
  );
});

Slider.displayName = "Slider";

export default Slider;

/** Type alias for Slider ref. */
export type SliderRef = React.Ref<HTMLElement>;
/** Type alias for Slider element. */
export type SliderElement = HTMLElement;
/** Type alias for Slider cssproperties. */
export type SliderCSSProperties = React.CSSProperties;
