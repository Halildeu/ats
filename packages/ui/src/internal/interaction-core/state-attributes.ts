/* ------------------------------------------------------------------ */
/*  State Attributes — Standardized data attribute helpers             */
/*                                                                     */
/*  Provides a single source of truth for data-* attributes on         */
/*  interactive components. Supports both enum attributes (for CSS      */
/*  queries) and boolean attributes (for debug/test).                   */
/*                                                                     */
/*  Faz 1.1 — Data Attribute Standard                                  */
/* ------------------------------------------------------------------ */

import type { AccessLevel } from "../access-controller";

/* ---- Enum attribute value types ---- */

export type ComponentState =
  | "checked"
  | "unchecked"
  | "open"
  | "closed"
  | "active"
  | "inactive"
  | "expanded"
  | "collapsed"
  | "indeterminate";

export type ComponentStatus =
  | "idle"
  | "error"
  | "warning"
  | "success"
  | "loading";

/* ---- Attribute builder options ---- */

export type StateAttributeOptions = {
  /** Access level — maps to data-access */
  access?: AccessLevel;
  /** Component state — maps to data-state */
  state?: ComponentState;
  /** Validation/feedback status — maps to data-status */
  status?: ComponentStatus;
  /** Loading flag — maps to data-loading boolean */
  loading?: boolean;
  /** Disabled flag — maps to data-disabled boolean */
  disabled?: boolean;
  /** Readonly flag — maps to data-readonly boolean */
  readonly?: boolean;
  /** Error flag — maps to data-error boolean. Accepts any truthy value (boolean, string, ReactNode). */
  error?: boolean | string | unknown;
  /** Component name for debugging — maps to data-component */
  component?: string;
};

/* ---- Result type ---- */

export type StateAttributes = Record<string, string | boolean | undefined>;

/**
 * Generates standardized data-* attributes for a component.
 *
 * @example
 * ```tsx
 * <input {...stateAttrs({ access: "readonly", state: "checked", disabled: false })} />
 * // → data-access="readonly" data-state="checked"
 * ```
 */
export function stateAttrs(options: StateAttributeOptions): StateAttributes {
  const attrs: StateAttributes = {};

  // Enum attributes (for CSS queries — always string values)
  if (options.access && options.access !== "full") {
    attrs["data-access"] = options.access;
  }
  if (options.state) {
    attrs["data-state"] = options.state;
  }
  if (options.status && options.status !== "idle") {
    attrs["data-status"] = options.status;
  }

  // Boolean attributes (for debug/test — present or absent)
  if (options.disabled) {
    attrs["data-disabled"] = "";
  }
  if (options.readonly) {
    attrs["data-readonly"] = "";
  }
  if (options.loading) {
    attrs["data-loading"] = "";
  }
  if (options.error) {
    attrs["data-error"] = "";
  }

  // Debug attribute
  if (options.component) {
    attrs["data-component"] = options.component;
  }

  return attrs;
}

/**
 * CSS selector builder for data attributes.
 * Useful for building selectors in Tailwind or CSS-in-JS.
 *
 * @example
 * ```ts
 * stateSelector({ access: "disabled" }) // → '[data-access="disabled"]'
 * stateSelector({ loading: true })      // → '[data-loading]'
 * ```
 */
export function stateSelector(
  options: Partial<Pick<StateAttributeOptions, "access" | "state" | "status" | "disabled" | "readonly" | "loading" | "error">>
): string {
  const parts: string[] = [];

  if (options.access) parts.push(`[data-access="${options.access}"]`);
  if (options.state) parts.push(`[data-state="${options.state}"]`);
  if (options.status) parts.push(`[data-status="${options.status}"]`);
  if (options.disabled) parts.push("[data-disabled]");
  if (options.readonly) parts.push("[data-readonly]");
  if (options.loading) parts.push("[data-loading]");
  if (options.error) parts.push("[data-error]");

  return parts.join("");
}
