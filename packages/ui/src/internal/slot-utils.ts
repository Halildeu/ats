import React from 'react';

/**
 * Slot configuration for compound components.
 * Allows consumers to customize sub-elements without breaking encapsulation.
 *
 * @example
 * <Button
 *   slotProps={{
 *     root: { className: 'custom-root' },
 *     startIcon: { className: 'icon-lg' },
 *     label: { 'data-testid': 'btn-label' },
 *   }}
 * />
 */

/** Merge two className strings, filtering falsy values */
export function mergeClassNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Deep merge slot props with component defaults. Consumer props win. */
export function resolveSlotProps<T extends Record<string, unknown>>(
  defaultProps: T,
  slotProps?: Partial<T>,
): T {
  if (!slotProps) return defaultProps;

  const merged = { ...defaultProps } as Record<string, unknown>;

  for (const key of Object.keys(slotProps)) {
    const consumerVal = (slotProps as Record<string, unknown>)[key];
    const defaultVal = merged[key];

    if (key === 'className') {
      merged[key] = mergeClassNames(defaultVal as string, consumerVal as string);
    } else if (key === 'style' && typeof defaultVal === 'object' && typeof consumerVal === 'object') {
      merged[key] = { ...(defaultVal as object), ...(consumerVal as object) };
    } else if (consumerVal !== undefined) {
      merged[key] = consumerVal;
    }
  }

  return merged as T;
}

/**
 * Type helper for defining slot props in component interfaces.
 *
 * @example
 * interface ButtonProps {
 *   slotProps?: SlotPropsMap<{
 *     root: React.HTMLAttributes<HTMLButtonElement>;
 *     startIcon: React.HTMLAttributes<HTMLSpanElement>;
 *     label: React.HTMLAttributes<HTMLSpanElement>;
 *   }>;
 * }
 */
export type SlotPropsMap<T extends Record<string, Record<string, unknown>>> = {
  [K in keyof T]?: Partial<T[K]>;
};

/**
 * Type helper for defining slot component overrides.
 *
 * @example
 * interface ButtonProps {
 *   slots?: SlotComponentMap<{
 *     root: React.ElementType;
 *     startIcon: React.ElementType;
 *   }>;
 * }
 */
export type SlotComponentMap<T extends Record<string, React.ElementType>> = {
  [K in keyof T]?: T[K];
};

/**
 * Render a slot element, supporting component override via `slots` prop.
 * Falls back to defaultComponent if no override is provided.
 */
export function renderSlot<P extends Record<string, unknown>>(
  defaultComponent: React.ElementType,
  overrideComponent: React.ElementType | undefined,
  props: P,
  children?: React.ReactNode,
): React.ReactElement {
  const Component = overrideComponent ?? defaultComponent;
  return React.createElement(Component, props as React.Attributes & Record<string, unknown>, children);
}
