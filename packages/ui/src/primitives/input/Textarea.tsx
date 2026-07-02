import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";
import {
  FieldControlShell,
  buildDescribedBy,
  getFieldFrameClass,
  getFieldInputClass,
  getFieldSlotClass,
  getFieldTone,
  type FieldSize,
} from "../_shared/FieldControlPrimitives";

/* ------------------------------------------------------------------ */
/*  TextArea — Multi-line text input with field shell                   */
/*                                                                     */
/*  Supports: label, description, hint, error, character count,        */
/*  leading/trailing visuals, access control, auto-resize,             */
/*  controlled/uncontrolled value, forwardRef.                         */
/* ------------------------------------------------------------------ */

export type TextAreaResize = "vertical" | "none" | "auto";

/** Props for the Textarea component.
 * @example
 * ```tsx
 * <Textarea />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/textarea)
 */
export interface TextareaProps
  extends Omit<
      React.TextareaHTMLAttributes<HTMLTextAreaElement>,
      "onChange" | "children"
    >,
    AccessControlledProps {
  /** Field label displayed above the textarea. */
  label?: React.ReactNode;
  /** Descriptive text below the label. */
  description?: React.ReactNode;
  /** Help text displayed below the textarea. */
  hint?: React.ReactNode;
  /** Error message that activates the invalid state. */
  error?: React.ReactNode;
  /** Size variant of the field control. */
  size?: FieldSize;
  /** Visual element rendered before the text area. */
  leadingVisual?: React.ReactNode;
  /** Visual element rendered after the text area. */
  trailingVisual?: React.ReactNode;
  /** Native change event handler. */
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  /** Callback fired with the new string value on change. */
  onValueChange?: (
    value: string,
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  /** Whether to display a character count indicator. */
  showCount?: boolean;
  /** Whether the textarea spans the full container width. */
  fullWidth?: boolean;
  /** Resize behavior of the textarea. */
  resize?: TextAreaResize;
  /** Show a loading indicator and disable editing */
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

/** Multi-line text input with field shell, auto-resize, character count, and access control. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      id,
      value,
      defaultValue,
      label,
      description,
      hint,
      error,
      size = "md",
      leadingVisual,
      trailingVisual,
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
      rows = 4,
      resize = "vertical",
      style,
      ...props
    },
    forwardedRef,
  ) {
    const resolvedResize = resize;

    const accessState = resolveAccessState(access);
    const generatedId = React.useId();
    const inputId = id ?? `text-area-${generatedId}`;
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

    const isReadonly = readOnly || accessState.isReadonly;
    const resolvedDisabled = disabled || loading || accessState.isDisabled;
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

    const localRef = React.useRef<HTMLTextAreaElement | null>(null);
    const assignRef = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    React.useEffect(() => {
      if (resolvedResize !== "auto" || !localRef.current) {
        return;
      }
      const node = localRef.current;
      node.style.height = "0px";
      node.style.height = `${Math.max(node.scrollHeight, rows * 24)}px`;
    }, [currentValue, resolvedResize, rows]);

    const handleChange = withAccessGuard<
      React.ChangeEvent<HTMLTextAreaElement>
    >(
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
          className={cn(getFieldFrameClass(size, tone, fullWidth, className), "relative")}
          data-access-state={accessState.state}
          data-field-tone={tone}
          data-size={size}
          data-field-type="text-area"
          data-loading={loading || undefined}
          title={accessReason}
        >
          {leadingVisual ? (
            <span className={getFieldSlotClass(size)}>{leadingVisual}</span>
          ) : null}
          <textarea
            {...props}
            ref={assignRef}
            id={inputId}
            value={currentValue}
            disabled={resolvedDisabled}
            readOnly={isReadonly}
            required={required}
            rows={rows}
            maxLength={maxLength}
            aria-invalid={Boolean(error) || undefined}
            aria-readonly={isReadonly || undefined}
            aria-disabled={resolvedDisabled || isReadonly || undefined}
            aria-describedby={describedBy}
            data-resize={resolvedResize}
            className={getFieldInputClass(size, "resize-none leading-7")}
            onChange={handleChange}
            style={{
              ...style,
              resize: resolvedResize === "auto" ? "none" : resolvedResize,
              minHeight: `${rows * 1.5}rem`,
            }}
          />
          {trailingVisual ? (
            <span className={getFieldSlotClass(size)}>{trailingVisual}</span>
          ) : null}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center rounded-xs bg-surface-default/60">
              <svg
                className="h-5 w-5 animate-spin text-text-secondary"
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
            </span>
          )}
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

Textarea.displayName = "Textarea";

/** Alias for backward compatibility */
export const TextArea = Textarea;
