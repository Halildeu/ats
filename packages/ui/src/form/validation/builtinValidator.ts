/* ------------------------------------------------------------------ */
/*  Built-in Validator — rule-based validation without external deps    */
/*                                                                     */
/*  Ported from x-form-builder (upstream)/zodAdapter.ts and enhanced with    */
/*  i18n-ready message factory support.                                */
/* ------------------------------------------------------------------ */

import type {
  FieldDescriptor,
  FieldValidationRules,
  SchemaValidator,
} from './types';

function validateFieldValue(
  field: FieldDescriptor,
  value: unknown,
  allValues: Record<string, unknown>,
): string | null {
  // Required check
  if (field.required) {
    if (value === undefined || value === null || value === '') {
      return `${field.label} is required`;
    }
  }

  // Skip further checks for empty optional fields
  if (value === undefined || value === null || value === '') return null;

  const v: FieldValidationRules | undefined = field.validation;
  if (!v) return null;

  // String-length checks
  if (typeof value === 'string') {
    if (v.minLength !== undefined && value.length < v.minLength) {
      return `${field.label} must be at least ${v.minLength} characters`;
    }
    if (v.maxLength !== undefined && value.length > v.maxLength) {
      return `${field.label} must be at most ${v.maxLength} characters`;
    }
    if (v.pattern) {
      const re = new RegExp(v.pattern);
      if (!re.test(value)) {
        return v.patternMessage ?? `${field.label} format is invalid`;
      }
    }
  }

  // Numeric range checks
  if (
    typeof value === 'number' ||
    (typeof value === 'string' && !isNaN(Number(value)))
  ) {
    const num = Number(value);
    if (v.min !== undefined && num < v.min) {
      return `${field.label} must be at least ${v.min}`;
    }
    if (v.max !== undefined && num > v.max) {
      return `${field.label} must be at most ${v.max}`;
    }
  }

  // Custom validator
  if (v.custom) {
    return v.custom(value, allValues);
  }

  return null;
}

/**
 * Create a SchemaValidator from an array of field descriptors.
 *
 * This provides validation without any external library dependency.
 * For Zod-based validation, use `createZodValidator` instead.
 *
 * @example
 * ```ts
 * const validator = createSchemaValidator([
 *   { name: 'email', label: 'Email', required: true, validation: { pattern: '^[^@]+@[^@]+$' } },
 *   { name: 'age', label: 'Age', validation: { min: 0, max: 120 } },
 * ]);
 * ```
 */
export function createSchemaValidator(
  fields: FieldDescriptor[],
): SchemaValidator {
  const fieldMap = new Map<string, FieldDescriptor>();
  for (const field of fields) {
    fieldMap.set(field.name, field);
  }

  return {
    validate(values: Record<string, unknown>): Record<string, string> {
      const errors: Record<string, string> = {};
      for (const field of fields) {
        if (field.hidden) continue;
        const msg = validateFieldValue(field, values[field.name], values);
        if (msg) errors[field.name] = msg;
      }
      return errors;
    },

    validateField(
      fieldName: string,
      value: unknown,
      allValues: Record<string, unknown> = {},
    ): string | null {
      const field = fieldMap.get(fieldName);
      if (!field) return null;
      return validateFieldValue(field, value, allValues);
    },
  };
}
