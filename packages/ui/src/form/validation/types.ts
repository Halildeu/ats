/* ------------------------------------------------------------------ */
/*  Form Validation Types — library-agnostic abstractions              */
/* ------------------------------------------------------------------ */

/**
 * Library-agnostic validation abstraction.
 *
 * Consumers can provide a Zod-backed, Yup-backed, or fully custom
 * implementation — the form hooks only depend on this interface.
 */
export interface SchemaValidator {
  /** Validate all fields. Returns map of field name → error message. Empty = valid. */
  validate(values: Record<string, unknown>): Record<string, string>;
  /** Validate a single field. Returns error message or null. */
  validateField(
    field: string,
    value: unknown,
    allValues?: Record<string, unknown>,
  ): string | null;
}

/**
 * react-hook-form compatible resolver signature.
 *
 * Follows the `Resolver` type from `@hookform/resolvers` so our
 * `zodResolver` works as a drop-in for `useForm({ resolver })`.
 */
export type ValidationResolver<
  T extends Record<string, unknown> = Record<string, unknown>,
> = (
  values: T,
  context?: unknown,
  options?: {
    criteriaMode?: string;
    fields?: Record<string, unknown>;
  },
) => Promise<{
  values: T;
  errors: Record<string, { type: string; message: string }>;
}>;

/** Built-in validation rules for a single field. */
export interface FieldValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  custom?: (
    value: unknown,
    formData: Record<string, unknown>,
  ) => string | null;
}

/** Minimal field descriptor for the built-in validator. */
export interface FieldDescriptor {
  name: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  validation?: FieldValidationRules;
}
