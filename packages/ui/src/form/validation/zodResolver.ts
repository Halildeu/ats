/* ------------------------------------------------------------------ */
/*  Zod Integration — createZodValidator + RHF-compatible zodResolver  */
/*                                                                     */
/*  Zod is an optional peer dependency. The caller passes their own    */
/*  constructed schema — we only use safeParse and error.issues.        */
/* ------------------------------------------------------------------ */

import type { SchemaValidator, ValidationResolver } from './types';

/* ------------------------------------------------------------------ */
/*  ZodLike type — avoids hard Zod dependency                          */
/* ------------------------------------------------------------------ */

interface ZodLikeIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

interface ZodLikeError {
  issues: ZodLikeIssue[];
}

interface ZodLikeResult {
  success: boolean;
  data?: unknown;
  error?: ZodLikeError;
}

interface ZodLikeSchema {
  safeParse(data: unknown): ZodLikeResult;
  shape?: Record<string, ZodLikeSchema>;
}

/* ------------------------------------------------------------------ */
/*  createZodValidator — SchemaValidator backed by a Zod schema        */
/* ------------------------------------------------------------------ */

/**
 * Create a SchemaValidator backed by a Zod schema.
 *
 * Works with any ZodObject — does not require the `zod` peer
 * dependency at the package level because the caller passes the
 * already-constructed schema.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { createZodValidator } from '@ats/ui/form';
 *
 * const schema = z.object({ name: z.string().min(1), age: z.number().min(0) });
 * const validator = createZodValidator(schema);
 * ```
 */
export function createZodValidator(zodSchema: ZodLikeSchema): SchemaValidator {
  return {
    validate(values: Record<string, unknown>): Record<string, string> {
      const result = zodSchema.safeParse(values);
      if (result.success) return {};
      const errors: Record<string, string> = {};
      for (const issue of result.error!.issues) {
        const path = issue.path.join('.');
        if (!errors[path]) errors[path] = issue.message;
      }
      return errors;
    },

    validateField(field: string, value: unknown): string | null {
      const fieldSchema = zodSchema.shape?.[field];
      if (!fieldSchema) return null;
      const result = fieldSchema.safeParse(value);
      return result.success
        ? null
        : result.error?.issues[0]?.message ?? 'Invalid';
    },
  };
}

/* ------------------------------------------------------------------ */
/*  zodResolver — react-hook-form compatible resolver                  */
/* ------------------------------------------------------------------ */

/**
 * Creates a react-hook-form compatible resolver from a Zod schema.
 *
 * Drop-in replacement for `@hookform/resolvers/zod` that follows the
 * same `Resolver` signature. Use when integrating with react-hook-form.
 *
 * @example
 * ```ts
 * import { useForm } from 'react-hook-form';
 * import { zodResolver } from '@ats/ui/form';
 * import { z } from 'zod';
 *
 * const schema = z.object({ name: z.string().min(1) });
 * const form = useForm({ resolver: zodResolver(schema) });
 * ```
 */
export function zodResolver<
  T extends Record<string, unknown> = Record<string, unknown>,
>(zodSchema: ZodLikeSchema): ValidationResolver<T> {
  return async (values: T) => {
    const result = zodSchema.safeParse(values);
    if (result.success) {
      return { values: result.data as T, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error!.issues) {
      const path = issue.path.join('.');
      if (!errors[path]) {
        errors[path] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {} as T, errors };
  };
}
