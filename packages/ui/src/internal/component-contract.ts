/**
 * Component Contract — Unified API standard for all design system components.
 *
 * Every public component SHOULD extend or implement these contracts
 * to ensure consistent API surface across the library.
 */

import type { SlotPropsMap } from './slot-utils';

/** Standard size scale used across all sizable components */
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Standard density levels */
export type ComponentDensity = 'compact' | 'comfortable' | 'spacious';

/** Standard status indicators */
export type ComponentStatus = 'idle' | 'loading' | 'error' | 'success' | 'warning';

/** Standard visual variants */
export type ComponentVariant = 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

/**
 * Base props that every interactive component should accept.
 * This ensures consumers have a predictable API regardless of component.
 */
export interface InteractiveComponentProps {
  /** Visual size of the component */
  size?: ComponentSize;
  /** Density controls spacing/padding */
  density?: ComponentDensity;
  /** Additional CSS classes */
  className?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Test identifier */
  'data-testid'?: string;
}

/**
 * Props for form-field components (Input, Select, Checkbox, etc.)
 */
export interface FormFieldComponentProps extends InteractiveComponentProps {
  /** Field label */
  label?: React.ReactNode;
  /** Helper text below the field */
  description?: React.ReactNode;
  /** Error state — boolean or error message string */
  error?: boolean | string;
  /** Whether the field is read-only */
  readOnly?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Required field indicator */
  required?: boolean;
}

/**
 * Props for overlay components (Dialog, Modal, Popover, etc.)
 */
export interface OverlayComponentProps {
  /** Whether the overlay is open */
  open: boolean;
  /** Callback when overlay should close */
  onClose: () => void;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * API Compliance audit helper.
 * Returns which standard props a component is missing.
 */
export function auditComponentContract(
  componentName: string,
  props: Record<string, unknown>,
  contract: 'interactive' | 'form-field' | 'overlay'
): string[] {
  const missing: string[] = [];

  const interactiveRequired = ['className', 'disabled', 'data-testid'];
  const formFieldRequired = [...interactiveRequired, 'label', 'error', 'readOnly'];
  const overlayRequired = ['open', 'onClose', 'closeOnEscape', 'className'];

  const required = contract === 'form-field' ? formFieldRequired
    : contract === 'overlay' ? overlayRequired
    : interactiveRequired;

  for (const prop of required) {
    if (!(prop in props)) {
      missing.push(prop);
    }
  }

  return missing;
}

/**
 * Standard slot-aware component props.
 *
 * Extend this interface to give any compound component a consistent
 * slots/slotProps API surface for sub-element customization.
 *
 * @example
 * interface ButtonProps extends SlottableComponentProps<
 *   { root: React.ElementType; startIcon: React.ElementType },
 *   { root: React.HTMLAttributes<HTMLButtonElement>; startIcon: React.HTMLAttributes<HTMLSpanElement> }
 * > {
 *   children: React.ReactNode;
 * }
 */
export interface SlottableComponentProps<
  Slots extends Record<string, React.ElementType> = Record<string, React.ElementType>,
  SlotProps extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>,
> {
  /** Override the underlying element/component used for each named slot */
  slots?: Partial<Slots>;
  /** Additional props forwarded to each named slot element */
  slotProps?: SlotPropsMap<SlotProps>;
}
