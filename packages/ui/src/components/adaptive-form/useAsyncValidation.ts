'use client';
import { useCallback, useRef } from 'react';

export interface AsyncValidator {
  field: string;
  validate: (value: unknown, allValues: Record<string, unknown>) => Promise<string | null>;
  debounceMs?: number;
}

export function useAsyncValidation(
  validators: AsyncValidator[],
  onError: (field: string, error: string | null) => void,
) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const validateField = useCallback(
    (field: string, value: unknown, allValues: Record<string, unknown>) => {
      const validator = validators.find(v => v.field === field);
      if (!validator) return;

      // Clear existing timer
      const existing = timers.current.get(field);
      if (existing) clearTimeout(existing);

      const delay = validator.debounceMs ?? 300;
      const timer = setTimeout(async () => {
        try {
          const error = await validator.validate(value, allValues);
          onError(field, error);
        } catch {
          onError(field, 'Validation failed');
        }
      }, delay);

      timers.current.set(field, timer);
    },
    [validators, onError],
  );

  const cleanup = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  return { validateField, cleanup };
}
