import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  AdaptiveForm — Intelligent adaptive form engine                    */
/*                                                                     */
/*  A form that adapts layout, field visibility and validation based   */
/*  on user input and context. Progressive disclosure, conditional     */
/*  fields, inline validation, and auto-focus.                         */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

export type FormFieldOption = {
  label: string;
  value: string;
};

export type FormFieldValidation = {
  pattern?: string;
  min?: number;
  max?: number;
  message?: string;
};

export type FormFieldDependency = {
  field: string;
  value: unknown;
};

export type FormField = {
  key: string;
  type:
    | "text"
    | "number"
    | "select"
    | "date"
    | "checkbox"
    | "radio"
    | "textarea"
    | "file";
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  dependsOn?: FormFieldDependency;
  validation?: FormFieldValidation;
  defaultValue?: unknown;
  span?: 1 | 2;
};

export type FormLayout = "vertical" | "horizontal" | "inline";
export type FormSize = "sm" | "md" | "lg";

/** Props for the AdaptiveForm component.
 * @example
 * ```tsx
 * <AdaptiveForm />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/adaptive-form)
 */
export interface AdaptiveFormProps extends AccessControlledProps {
  /** Field definitions describing the form schema. */
  fields: FormField[];
  /** Controlled form values keyed by field key. */
  values?: Record<string, unknown>;
  /** Callback fired when any field value changes. */
  onValuesChange?: (values: Record<string, unknown>) => void;
  /** Callback fired on form submission with validated values. */
  onSubmit?: (values: Record<string, unknown>) => void;
  /** Layout direction for form fields. */
  layout?: FormLayout;
  /** Number of grid columns for the form layout. */
  columns?: 1 | 2;
  /** Size variant for input controls. */
  size?: FormSize;
  /** Label for the submit button. */
  submitLabel?: string;
  /** Label for the reset button. */
  resetLabel?: string;
  /** Whether to show the reset button. */
  showReset?: boolean;
  /** Whether to show loading skeleton placeholders. */
  loading?: boolean;
  /** Additional CSS class name. */
  className?: string;
}

/* ---- Constants ---- */

const SIZE_CLASSES: Record<FormSize, { input: string; label: string; text: string }> = {
  sm: { input: "px-2 py-1 text-xs", label: "text-xs", text: "text-xs" },
  md: { input: "px-3 py-2 text-sm", label: "text-sm", text: "text-sm" },
  lg: { input: "px-4 py-3 text-base", label: "text-base", text: "text-sm" },
};

const INPUT_BASE =
  "w-full rounded-lg border border-border-subtle bg-[var(--surface-default-bg))] text-text-primary outline-hidden transition-colors placeholder:text-text-secondary/60 focus:border-[var(--selection-outline))] focus:ring-1 focus:ring-[var(--selection-outline))]";

const ERROR_CLASS = "border-[var(--danger-color))] focus:border-[var(--danger-color))] focus:ring-[var(--danger-color))]";

const SKELETON_PULSE =
  "animate-pulse rounded-lg bg-surface-muted";

/* ---- Helpers ---- */

const isDependencyMet = (
  dep: FormFieldDependency | undefined,
  values: Record<string, unknown>,
): boolean => {
  if (!dep) return true;
  const actual = values[dep.field];
  if (Array.isArray(dep.value)) {
    return dep.value.includes(actual);
  }
  // Boolean / truthy check
  if (dep.value === true) return Boolean(actual);
  if (dep.value === false) return !actual;
  return actual === dep.value;
};

const validateField = (
  field: FormField,
  value: unknown,
): string | null => {
  if (field.required && (value === undefined || value === null || value === "")) {
    return `${field.label} zorunludur`;
  }
  if (field.validation) {
    const v = field.validation;
    if (v.pattern && typeof value === "string") {
      const regex = new RegExp(v.pattern);
      if (!regex.test(value)) {
        return v.message ?? `${field.label} gecersiz format`;
      }
    }
    if (v.min !== undefined && typeof value === "number" && value < v.min) {
      return v.message ?? `${field.label} en az ${v.min} olmalidir`;
    }
    if (v.max !== undefined && typeof value === "number" && value > v.max) {
      return v.message ?? `${field.label} en fazla ${v.max} olmalidir`;
    }
    if (v.min !== undefined && typeof value === "string" && value.length < v.min) {
      return v.message ?? `${field.label} en az ${v.min} karakter olmalidir`;
    }
    if (v.max !== undefined && typeof value === "string" && value.length > v.max) {
      return v.message ?? `${field.label} en fazla ${v.max} karakter olmalidir`;
    }
  }
  return null;
};

/* ---- Sub-components ---- */

const FieldRenderer: React.FC<{
  field: FormField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  error?: string | null;
  size: FormSize;
  disabled: boolean;
}> = ({ field, value, onChange, error, size, disabled }) => {
  const sc = SIZE_CLASSES[size];
  const hasError = Boolean(error);
  const inputCls = cn(INPUT_BASE, sc.input, hasError && ERROR_CLASS);
  const id = `af-${field.key}`;

  const handleChange = (val: unknown) => onChange(field.key, val);

  switch (field.type) {
    case "text":
    case "date":
      return (
        <input
          id={id}
          type={field.type}
          value={(value as string) ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
          className={inputCls}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      );

    case "number":
      return (
        <input
          id={id}
          type="number"
          value={(value as number) ?? ""}
          onChange={(e) =>
            handleChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
          min={field.validation?.min}
          max={field.validation?.max}
          className={inputCls}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      );

    case "select":
      return (
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          required={field.required}
          className={inputCls}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        >
          <option value="">{field.placeholder ?? "Seciniz"}</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "textarea":
      return (
        <textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
          rows={4}
          className={cn(inputCls, "resize-y")}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      );

    case "checkbox":
      return (
        <label className="inline-flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded-xs border-border-subtle text-[var(--action-primary-bg))] focus:ring-[var(--selection-outline))]"
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
          />
          <span className={cn(sc.text, "text-text-primary")}>
            {field.label}
          </span>
        </label>
      );

    case "radio":
      return (
        <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`${id}-label`}>
          {field.options?.map((opt) => (
            <label key={opt.value} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name={field.key}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => handleChange(opt.value)}
                disabled={disabled}
                className="h-4 w-4 border-border-subtle text-[var(--action-primary-bg))] focus:ring-[var(--selection-outline))]"
              />
              <span className={cn(sc.text, "text-text-primary")}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      );

    case "file":
      return (
        <input
          id={id}
          type="file"
          onChange={(e) => handleChange(e.target.files)}
          disabled={disabled}
          className={cn(
            sc.input,
            "w-full cursor-pointer rounded-lg border border-border-subtle bg-[var(--surface-default-bg))] text-text-secondary file:me-3 file:rounded-md file:border-0 file:bg-[var(--action-primary-bg))] file:px-3 file:py-1 file:text-xs file:font-medium file:text-text-inverse",
          )}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
        />
      );

    default:
      return null;
  }
};

/* ---- Main Component ---- */

/** Intelligent adaptive form that adjusts layout, field visibility, and validation based on user input and context. */
export const AdaptiveForm = React.forwardRef<HTMLDivElement, AdaptiveFormProps>(({
  fields,
  values: controlledValues,
  onValuesChange,
  onSubmit,
  layout = "vertical",
  columns = 1,
  size = "md",
  submitLabel = "Gonder",
  resetLabel = "Sifirla",
  showReset = false,
  loading = false,
  className,
  access = "full",
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  /* Internal state */
  const [internalValues, setInternalValues] = useState<Record<string, unknown>>(
    () => {
      const defaults: Record<string, unknown> = {};
      fields.forEach((f) => {
        if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
      });
      return defaults;
    },
  );

  const currentValues = controlledValues ?? internalValues;

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);

  const handleValueChange = useCallback(
    (key: string, value: unknown) => {
      const next = { ...currentValues, [key]: value };
      if (!controlledValues) setInternalValues(next);
      onValuesChange?.(next);

      /* Mark touched */
      setTouched((prev) => {
        const n = new Set(prev);
        n.add(key);
        return n;
      });

      /* Validate on change if touched */
      const field = fields.find((f) => f.key === key);
      if (field) {
        const err = validateField(field, value);
        setErrors((prev) => ({ ...prev, [key]: err }));
      }
    },
    [controlledValues, currentValues, fields, onValuesChange],
  );

  const handleReset = useCallback(() => {
    const defaults: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
    });
    if (!controlledValues) setInternalValues(defaults);
    onValuesChange?.(defaults);
    setErrors({});
    setTouched(new Set());
  }, [controlledValues, fields, onValuesChange]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      /* Validate all visible fields */
      const visibleFields = fields.filter((f) =>
        isDependencyMet(f.dependsOn, currentValues),
      );
      const newErrors: Record<string, string | null> = {};
      let hasErrors = false;
      visibleFields.forEach((f) => {
        const err = validateField(f, currentValues[f.key]);
        newErrors[f.key] = err;
        if (err) hasErrors = true;
      });
      setErrors(newErrors);
      setTouched(new Set(visibleFields.map((f) => f.key)));
      if (!hasErrors) onSubmit?.(currentValues);
    },
    [currentValues, fields, onSubmit],
  );

  /* Visible fields */
  const visibleFields = useMemo(
    () => fields.filter((f) => isDependencyMet(f.dependsOn, currentValues)),
    [fields, currentValues],
  );

  const isDisabled = accessState.isDisabled || accessState.isReadonly;
  const sc = SIZE_CLASSES[size];

  /* Loading skeleton */
  if (loading) {
    return (
      <div
        className={cn("flex flex-col gap-4", className)}
        data-component="adaptive-form"
        data-access-state={accessState.state}
        aria-busy="true"
        title={accessReason}
      >
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className={cn(SKELETON_PULSE, "h-4 w-24")} />
            <div className={cn(SKELETON_PULSE, "h-10 w-full")} />
          </div>
        ))}
        <div className={cn(SKELETON_PULSE, "h-10 w-28")} />
      </div>
    );
  }

  const gridClass = "grid gap-4";
  const gridStyle = columns === 2
    ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }
    : { gridTemplateColumns: "1fr" };

  const isInline = layout === "inline";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={cn(
        isInline ? "flex flex-wrap items-end gap-4" : "flex flex-col gap-4",
        className,
      )}
      data-component="adaptive-form"
      data-access-state={accessState.state}
      data-layout={layout}
      noValidate
      title={accessReason}
    >
      <div className={isInline ? "flex flex-wrap items-end gap-4" : gridClass} style={isInline ? undefined : gridStyle}>
        {visibleFields.map((field) => {
          const id = `af-${field.key}`;
          const error =
            touched.has(field.key) ? errors[field.key] ?? null : null;
          const spanClass = "col-span-1";
          const fieldStyle =
            field.span === 2 && columns === 2
              ? { gridColumn: "1 / -1" }
              : undefined;

          const isCheckbox = field.type === "checkbox";

          return (
            <div
              key={field.key}
              className={cn(
                isInline ? "" : spanClass,
                "transition-all duration-(--motion-duration-medium)",
              )}
              style={isInline ? undefined : fieldStyle}
              data-field-key={field.key}
              data-field-visible="true"
            >
              {/* Label (skip for checkbox — it renders its own) */}
              {!isCheckbox && (
                <label
                  htmlFor={id}
                  id={`${id}-label`}
                  className={cn(
                    sc.label,
                    "mb-1 block font-medium text-text-primary",
                  )}
                >
                  {field.label}
                  {field.required && (
                    <span className="ms-0.5 text-[var(--danger-color))]">
                      *
                    </span>
                  )}
                </label>
              )}

              {/* Description */}
              {field.description && !isCheckbox && (
                <p
                  className={cn(
                    sc.text,
                    "mb-1 text-text-secondary",
                  )}
                >
                  {field.description}
                </p>
              )}

              {/* Field */}
              <FieldRenderer
                field={field}
                value={currentValues[field.key]}
                onChange={handleValueChange}
                error={error}
                size={size}
                disabled={isDisabled}
              />

              {/* Error message */}
              {error && (
                <p
                  id={`${id}-error`}
                  className="mt-1 text-xs text-[var(--danger-color))]"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className={cn("flex items-center gap-3", isInline ? "" : "pt-2")}>
        <button
          type="submit"
          disabled={isDisabled}
          className={cn(
            "rounded-lg bg-[var(--action-primary-bg))] font-medium text-text-inverse transition-colors hover:bg-accent-primary-hover disabled:opacity-50",
            sc.input,
          )}
        >
          {submitLabel}
        </button>
        {showReset && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isDisabled}
            className={cn(
              "rounded-lg border border-border-subtle font-medium text-text-primary transition-colors hover:bg-surface-muted disabled:opacity-50",
              sc.input,
            )}
          >
            {resetLabel}
          </button>
        )}
      </div>
    </form>
  );
});

AdaptiveForm.displayName = "AdaptiveForm";

export default AdaptiveForm;
