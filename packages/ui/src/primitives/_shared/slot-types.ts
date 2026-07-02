import type React from "react";

/**
 * SlotProps — Enables styling/attribute overrides on internal parts of
 * compound components.
 *
 * Follows the MUI slotProps / Base UI slots pattern:
 *
 * @example
 * <Tabs
 *   slotProps={{
 *     list: { className: 'bg-surface-muted rounded-lg' },
 *     trigger: { className: 'font-bold' },
 *     content: { className: 'p-6' },
 *   }}
 * />
 *
 * className values are merged via `cn()` with the component's defaults.
 * All other HTML attributes are spread onto the corresponding element.
 */
export type SlotProps<Slots extends string> = Partial<
  Record<Slots, React.HTMLAttributes<HTMLElement>>
>;
