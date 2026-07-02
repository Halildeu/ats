import React from "react";
import {
  resolveAccessState,
  withAccessGuard,
  stateAttrs,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/interaction-core";
import {
  FieldControlShell,
  buildDescribedBy,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldSlotClass,
  getFieldTone,
  type FieldDensity,
  type FieldSize,
} from "../_shared/FieldControlPrimitives";
import { Spinner } from "../spinner/Spinner";

/* ------------------------------------------------------------------ */
/*  TextInput — Full-featured text input with field shell               */
/*                                                                     */
/*  Supports: label, description, hint, error, character count,        */
/*  leading/trailing visuals, access control, density, controlled/     */
/*  uncontrolled value, forwardRef.                                    */
/* ------------------------------------------------------------------ */

export type InputSize = FieldSize;

/** Props for the Input component. */
export interface InputProps
  extends Omit<
      React.InputHTMLAttributes<HTMLInputElement>,
      "size" | "onChange" | "children" | "prefix"
    >,
    AccessControlledProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  size?: FieldSize;
  /** @deprecated Use `size` instead. Will be removed in v3.0.0. */
  inputSize?: FieldSize;
  density?: FieldDensity;
  leadingVisual?: React.ReactNode;
  trailingVisual?: React.ReactNode;
  /** Alias — same as leadingVisual */
  prefix?: React.ReactNode;
  /** Alias — same as trailingVisual */
  suffix?: React.ReactNode;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onValueChange?: (
    value: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  showCount?: boolean;
  fullWidth?: boolean;
  /** Show a loading spinner in the trailing slot and make the input readonly */
  loading?: boolean;
}

const getInitialValue = (
  value?: string | number | readonly string[],
  defaultValue?: string | number | readonly string[],
) => {
  if (value !== undefined && value !== null) return String(value);
  if (defaultValue !== undefined && defaultValue !== null)
    return String(defaultValue);
  return "";
};

/**
 * Full-featured text input with field shell, label, visuals, character count, and access control.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Email"
 *   placeholder="you@example.com"
 *   error={errors.email}
 *   onChange={handleChange}
 * />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/input)
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      id,
      value,
      defaultValue,
      type = "text",
      label,
      description,
      hint,
      error,
      size: sizeProp,
      inputSize,
      density = "comfortable",
      leadingVisual,
      trailingVisual,
      prefix,
      suffix,
      onChange,
      onValueChange,
      disabled = false,
      readOnly = false,
      required = false,
      maxLength,
      showCount = false,
      className,
      fullWidth = true,
      loading = false,
      access = "full",
      accessReason,
      ...props
    },
    forwardedRef,
  ) {
    const size = sizeProp ?? inputSize ?? "md";

    if (process.env.NODE_ENV !== "production" && inputSize !== undefined) {
      console.warn(
        '[DesignSystem] "Input" prop "inputSize" is deprecated. Use "size" instead. "inputSize" will be removed in v3.0.0.',
      );
    }

    const resolvedLeading = leadingVisual ?? prefix;
    const resolvedTrailing =
      trailingVisual ?? suffix ?? (loading ? <Spinner size="xs" label="Loading" /> : undefined);

    const accessState = resolveAccessState(access);
    const generatedId = React.useId();
    const inputId = id ?? `text-input-${generatedId}`;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const countId =
      showCount || maxLength !== undefined ? `${inputId}-count` : undefined;
    const describedBy = buildDescribedBy(
      descriptionId,
      error ? errorId : hintId,
      countId,
    );

    const [internalValue, setInternalValue] = React.useState(() =>
      getInitialValue(undefined, defaultValue),
    );
    const isControlled = value !== undefined;
    const currentValue = isControlled
      ? getInitialValue(value, undefined)
      : internalValue;

    const isReadonly = readOnly || loading || accessState.isReadonly;
    const resolvedDisabled = disabled || accessState.isDisabled;
    const interactionState: AccessLevel = resolvedDisabled
      ? "disabled"
      : isReadonly
        ? "readonly"
        : accessState.state;

    const tone = getFieldTone({
      invalid: Boolean(error),
      disabled: resolvedDisabled,
      readonly: isReadonly,
    });

    const countLabel =
      showCount || maxLength !== undefined
        ? `${currentValue.length}${maxLength !== undefined ? ` / ${maxLength}` : ""}`
        : undefined;

    const localRef = React.useRef<HTMLInputElement | null>(null);
    const assignRef = (node: HTMLInputElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const handleChange = withAccessGuard<React.ChangeEvent<HTMLInputElement>>(
      interactionState,
      (event) => {
        if (!isControlled) {
          setInternalValue(event.target.value);
        }
        onChange?.(event);
        onValueChange?.(event.target.value, event);
      },
      resolvedDisabled,
    );

    if (accessState.isHidden) {
      return null;
    }

    return (
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
        countLabel={countLabel}
        required={required}
        fullWidth={fullWidth}
      >
        <div
          className={getFieldFrameClass(
            size,
            tone,
            fullWidth,
            className,
            density,
          )}
          {...stateAttrs({
            access: interactionState,
            status: error ? "error" : undefined,
            disabled: resolvedDisabled,
            readonly: isReadonly,
            loading,
            component: "text-input",
          })}
          data-field-tone={tone}
          data-density={density}
          data-size={size}
          data-field-type="text-input"
          title={accessReason}
        >
          {resolvedLeading ? (
            <span className={getFieldSlotClass(size, density)}>
              {resolvedLeading}
            </span>
          ) : null}
          <input
            {...props}
            ref={assignRef}
            id={inputId}
            type={type}
            value={currentValue}
            disabled={resolvedDisabled}
            readOnly={isReadonly}
            required={required}
            maxLength={maxLength}
            aria-invalid={Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            aria-disabled={resolvedDisabled || isReadonly || undefined}
            aria-describedby={describedBy}
            className={getFieldInputClass(size, undefined, density)}
            onChange={handleChange}
          />
          {resolvedTrailing ? (
            <span className={getFieldSlotClass(size, density)}>
              {resolvedTrailing}
            </span>
          ) : null}
        </div>
        {countId ? (
          <span id={countId} className="sr-only">
            {countLabel}
          </span>
        ) : null}
      </FieldControlShell>
    );
  },
);

Input.displayName = "Input";

/** Alias for backward compatibility */
export const TextInput = Input;
