import React, { useId } from "react";
import { cn } from "../../utils/cn";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  FormField — Composed form control wrapper                          */
/*                                                                     */
/*  Wraps any input with label, help text, error message, and          */
/*  required/optional indicators.                                      */
/* ------------------------------------------------------------------ */

export interface FormFieldProps extends AccessControlledProps {
  /** Field label */
  label?: React.ReactNode;
  /** Help text below the input */
  help?: React.ReactNode;
  /** Error message — also sets error state on input */
  error?: React.ReactNode;
  /** Mark as required */
  required?: boolean;
  /** Mark as optional (mutually exclusive with required) */
  optional?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Horizontal layout */
  horizontal?: boolean;
  /** Custom ID for the input */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Composed form control wrapper with label, help text, error message, and required/optional indicators.
 *
 * @example
 * ```tsx
 * <FormField label="Username" error={errors.username} required>
 *   <Input value={username} onChange={handleChange} />
 * </FormField>
 * ```
 */
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(({
  label,
  help,
  error,
  required = false,
  optional = false,
  disabled = false,
  horizontal = false,
  htmlFor: externalId,
  className,
  children,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const autoId = useId();
  const id = externalId ?? autoId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div
      ref={ref}
      data-access-state={accessState.state}
      className={cn(
        horizontal ? "flex items-start gap-4" : "flex flex-col gap-1.5",
        disabled && "opacity-60",
        accessState.isDisabled && "pointer-events-none opacity-50",
        className,
      )}
      title={accessReason}
    >
      {label && (
        <label
          htmlFor={id}
          className={cn(
            "text-sm font-medium text-text-primary",
            horizontal && "mt-2 w-32 shrink-0",
          )}
        >
          {label}
          {required && (
            <span className="ms-0.5 text-state-danger-text" aria-hidden>
              *
            </span>
          )}
          {optional && (
            <span className="ms-1 text-xs font-normal text-[var(--text-disabled)]">
              (optional)
            </span>
          )}
        </label>
      )}

      <div className="min-w-0 flex-1">
        {/* Inject id and aria attributes into child input */}
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          const isNativeElement = typeof (child as React.ReactElement).type === "string";
          const injectedProps: Record<string, unknown> = {
            id,
            "aria-describedby": error ? errorId : help ? helpId : undefined,
            "aria-invalid": error ? true : undefined,
            disabled,
          };
          // Only pass `error` to custom React components — native DOM elements
          // don't recognise it and React warns about it.
          if (!isNativeElement) {
            injectedProps.error = error ? true : undefined;
          }
          return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, injectedProps);
        })}

        {/* Error message */}
        {error && (
          <p id={errorId} className="mt-1.5 flex items-center gap-1 text-xs text-state-danger-text" role="alert">
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zM8 11a1 1 0 100 2 1 1 0 000-2z" />
            </svg>
            {error}
          </p>
        )}

        {/* Help text */}
        {!error && help && (
          <p id={helpId} className="mt-1.5 text-xs text-text-secondary">
            {help}
          </p>
        )}
      </div>
    </div>
  );
});

FormField.displayName = "FormField";

/** Type alias for FormField ref. */
export type FormFieldRef = React.Ref<HTMLElement>;
/** Type alias for FormField element. */
export type FormFieldElement = HTMLElement;
/** Type alias for FormField cssproperties. */
export type FormFieldCSSProperties = React.CSSProperties;
