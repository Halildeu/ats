import React, { useState, useCallback, useRef, useId } from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Segmented — Multi-mode segmented control                           */
/*                                                                     */
/*  Appearances: default · outline · ghost                             */
/*  Supports: single/multiple selection, roving tabindex,              */
/*            icons, badges, descriptions, controlled/uncontrolled     */
/* ------------------------------------------------------------------ */

/* ---- Public types ------------------------------------------------ */

export interface SegmentedItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  description?: React.ReactNode;
  dataTestId?: string;
  disabled?: boolean;
  itemClassName?: string;
  activeClassName?: string;
  badgeClassName?: string;
}

export interface SegmentedClasses {
  root?: string;
  list?: string;
  item?: string;
  activeItem?: string;
  content?: string;
  icon?: string;
  label?: string;
  badge?: string;
  description?: string;
}

export interface SegmentedProps extends AccessControlledProps {
  /** Array of segment items to render. */
  items: SegmentedItem[];
  /** Controlled selected value(s). */
  value?: string | string[];
  /** Default selected value(s) for uncontrolled mode. */
  defaultValue?: string | string[];
  /** Callback fired when the selection changes. */
  onValueChange?: (nextValue: string | string[]) => void;
  /** Callback fired when a segment item is clicked. */
  onItemClick?: (
    value: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  /** Whether single or multiple segments can be selected. @default "single" */
  selectionMode?: "single" | "multiple";
  /** Size variant for the segment buttons. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Layout orientation of the segment group. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** @deprecated Use `variant` instead. Visual appearance style. */
  appearance?: "default" | "outline" | "ghost";
  /** Visual style variant for the segmented control. */
  variant?: "default" | "outline" | "ghost";
  /** Border radius shape of the container and items. @default "rounded" */
  shape?: "rounded" | "pill";
  /** Position of item icons relative to the label. @default "start" */
  iconPosition?: "start" | "end" | "top";
  /** Whether deselecting all items is allowed. @default false */
  allowEmptySelection?: boolean;
  /** Whether the control spans the full container width. */
  fullWidth?: boolean;
  /** Accessible label for the segment group. */
  ariaLabel?: string;
  /** Custom CSS class overrides for internal elements. */
  classes?: SegmentedClasses;
  /** Additional CSS class name for the root element. */
  className?: string;
}

/* ---- Helper: next-value resolution -------------------------------
   
 * @example
 * ```tsx
 * <Segmented />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/segmented)
 */
export function resolveSegmentedNextValue(
  currentValue: string | string[],
  itemValue: string,
  selectionMode: "single" | "multiple",
  options?: { allowEmptySelection?: boolean },
): string | string[] {
  const allowEmpty = options?.allowEmptySelection ?? false;

  if (selectionMode === "single") {
    const current = Array.isArray(currentValue)
      ? currentValue[0] ?? ""
      : currentValue;
    if (current === itemValue) {
      return allowEmpty ? "" : current;
    }
    return itemValue;
  }

  // multiple
  const arr = Array.isArray(currentValue) ? currentValue : [currentValue];
  if (arr.includes(itemValue)) {
    const next = arr.filter((v) => v !== itemValue);
    if (next.length === 0 && !allowEmpty) return arr;
    return next;
  }
  return [...arr, itemValue];
}

/* ---- Preset factory ---------------------------------------------- */

export interface SegmentedPreset {
  size: "sm" | "md" | "lg";
  variant: "default" | "outline" | "ghost";
  /** @deprecated Use `variant` instead. Will be removed in v3.0.0. */
  appearance: "default" | "outline" | "ghost";
  shape: "rounded" | "pill";
  iconPosition?: "start" | "end" | "top";
}

export function createSegmentedPreset(
  kind: "toolbar" | "filter_bar" | "pill_tabs",
): SegmentedPreset {
  switch (kind) {
    case "toolbar":
      return { size: "sm", variant: "outline", appearance: "outline", shape: "rounded" };
    case "filter_bar":
      return { size: "sm", variant: "ghost", appearance: "ghost", shape: "pill" };
    case "pill_tabs":
      return { size: "md", variant: "default", appearance: "default", shape: "pill" };
  }
}

/* ---- Style maps -------------------------------------------------- */

const sizeStyles: Record<"sm" | "md" | "lg", string> = {
  sm: "text-xs px-2 py-1",
  md: "text-sm px-3 py-1.5",
  lg: "text-base px-4 py-2",
};

const shapeStyles: Record<"rounded" | "pill", { container: string; item: string }> = {
  rounded: { container: "rounded-lg", item: "rounded-lg" },
  pill: { container: "rounded-full", item: "rounded-full" },
};

const appearanceStyles: Record<
  "default" | "outline" | "ghost",
  { container: string; active: string; inactive: string }
> = {
  default: {
    container: "bg-[var(--segmented-bg))] p-1",
    active: cn(
      "bg-[var(--segmented-active-bg))]",
      "text-[var(--segmented-active-text))]",
      "shadow-xs",
    ),
    inactive: cn(
      "text-[var(--segmented-text))]",
      "hover:text-text-primary",
    ),
  },
  outline: {
    container: "border border-[var(--segmented-border))] p-1",
    active: cn(
      "border border-[var(--segmented-active-border))]",
      "bg-[color-mix(in_oklab,var(--segmented-active-bg))_10%,transparent)]",
      "text-[var(--segmented-active-text))]",
    ),
    inactive: cn(
      "text-[var(--segmented-text))]",
      "border border-transparent",
      "hover:text-text-primary",
    ),
  },
  ghost: {
    container: "",
    active: cn(
      "bg-[var(--segmented-active-bg))]",
      "text-[var(--segmented-active-text))]",
    ),
    inactive: cn(
      "text-[var(--segmented-text))]",
      "hover:bg-surface-muted/50",
      "hover:text-text-primary",
    ),
  },
};

/* ---- Helpers ----------------------------------------------------- */

function isSelected(
  value: string | string[],
  itemValue: string,
): boolean {
  if (Array.isArray(value)) return value.includes(itemValue);
  return value === itemValue;
}

function normalizeValue(
  val: string | string[] | undefined,
  selectionMode: "single" | "multiple",
): string | string[] {
  if (val === undefined) return selectionMode === "multiple" ? [] : "";
  return val;
}

/* ---- Component --------------------------------------------------- */

export const Segmented = React.forwardRef<HTMLDivElement, SegmentedProps>(
  (
    {
      items,
      value: valueProp,
      defaultValue,
      onValueChange,
      onItemClick,
      selectionMode = "single",
      size = "md",
      orientation = "horizontal",
      appearance: appearanceProp,
      variant: variantProp,
      shape = "rounded",
      iconPosition = "start",
      allowEmptySelection = false,
      fullWidth = false,
      ariaLabel,
      access = "full",
      accessReason,
      classes,
      className,
    },
    ref,
  ) => {
    const appearance = variantProp ?? appearanceProp ?? "default";
    const accessState = resolveAccessState(access);

    if (accessState.isHidden) return null;

    const isAccessDisabled = accessState.isDisabled || accessState.isReadonly;

    if (process.env.NODE_ENV !== "production" && appearanceProp !== undefined) {
      console.warn(
        '[DesignSystem] "Segmented" prop "appearance" is deprecated. Use "variant" instead. "appearance" will be removed in v3.0.0.',
      );
    }

    const id = useId();
    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = useState<string | string[]>(
      () => normalizeValue(defaultValue, selectionMode),
    );
    const currentValue = isControlled
      ? valueProp
      : internalValue;

    const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const enabledItems = items.filter((i) => !i.disabled);

    /* ---- Selection handler -------------------------------------- */
    const handleSelect = useCallback(
      (itemValue: string, event: React.MouseEvent<HTMLButtonElement>) => {
        onItemClick?.(itemValue, event);
        const next = resolveSegmentedNextValue(
          currentValue,
          itemValue,
          selectionMode,
          { allowEmptySelection },
        );
        if (!isControlled) setInternalValue(next);
        onValueChange?.(next);
      },
      [
        currentValue,
        selectionMode,
        allowEmptySelection,
        isControlled,
        onValueChange,
        onItemClick,
      ],
    );

    /* ---- Roving tabindex keyboard handler ------------------------ */
    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>, itemValue: string) => {
        const isHorizontal = orientation === "horizontal";
        const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
        const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

        if (event.key === prevKey || event.key === nextKey) {
          event.preventDefault();
          const idx = enabledItems.findIndex((i) => i.value === itemValue);
          if (idx === -1) return;
          const delta = event.key === nextKey ? 1 : -1;
          const nextIdx =
            (idx + delta + enabledItems.length) % enabledItems.length;
          const nextItem = enabledItems[nextIdx];
          const btn = itemRefs.current.get(nextItem.value);
          btn?.focus();
        }

        if (event.key === "Home") {
          event.preventDefault();
          const btn = itemRefs.current.get(enabledItems[0]?.value ?? "");
          btn?.focus();
        }
        if (event.key === "End") {
          event.preventDefault();
          const last = enabledItems[enabledItems.length - 1];
          const btn = itemRefs.current.get(last?.value ?? "");
          btn?.focus();
        }
      },
      [orientation, enabledItems],
    );

    /* ---- Render ------------------------------------------------- */
    const isVertical = orientation === "vertical";
    const shapeConfig = shapeStyles[shape];
    const appearanceConfig = appearanceStyles[appearance];

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        data-access-state={accessState.state}
        className={cn(
          "inline-flex",
          isVertical ? "flex-col" : "flex-row",
          appearanceConfig.container,
          shapeConfig.container,
          fullWidth && "w-full",
          classes?.root,
          className,
        )}
        title={accessReason}
        {...stateAttrs({ component: "segmented", disabled: isAccessDisabled, access })}
        data-orientation={orientation}
        data-appearance={appearance}
        data-size={size}
      >
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          className={cn(
            "flex gap-1",
            isVertical ? "flex-col" : "flex-row",
            fullWidth && "w-full",
            classes?.list,
          )}
        >
          {items.map((item, _index) => {
            const active = isSelected(currentValue, item.value);
            const isFirstEnabled =
              enabledItems[0]?.value === item.value;
            const focusedByRoving = isSelected(currentValue, item.value)
              ? true
              : !enabledItems.some((ei) =>
                  isSelected(currentValue, ei.value),
                ) && isFirstEnabled;

            return (
              <button
                key={item.value}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.value, el);
                  else itemRefs.current.delete(item.value);
                }}
                type="button"
                role="radio"
                id={`${id}-item-${item.value}`}
                aria-checked={active}
                aria-label={
                  typeof item.label === "string" ? item.label : undefined
                }
                tabIndex={focusedByRoving ? 0 : -1}
                disabled={item.disabled || isAccessDisabled}
                data-testid={item.dataTestId}
                data-value={item.value}
                data-state={active ? "active" : "inactive"}
                onClick={(e) => handleSelect(item.value, e)}
                onKeyDown={(e) => handleKeyDown(e, item.value)}
                className={cn(
                  "inline-flex items-center justify-center font-medium",
                  "transition-all duration-(--motion-duration-fast)",
                  "disabled:pointer-events-none disabled:opacity-40",
                  focusRingClass("ring"),
                  sizeStyles[size],
                  shapeConfig.item,
                  iconPosition === "top" && "flex-col",
                  active
                    ? cn(
                        appearanceConfig.active,
                        classes?.activeItem,
                        item.activeClassName,
                      )
                    : appearanceConfig.inactive,
                  fullWidth && "flex-1",
                  classes?.item,
                  item.itemClassName,
                )}
              >
                {/* Icon — start or top */}
                {item.icon && iconPosition !== "end" && (
                  <span
                    className={cn(
                      "shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em]",
                      iconPosition === "top" ? "mb-1" : "me-1.5",
                      classes?.icon,
                    )}
                  >
                    {item.icon}
                  </span>
                )}

                {/* Label + description wrapper */}
                <span
                  className={cn(
                    "inline-flex",
                    item.description ? "flex-col items-start" : "items-center",
                    classes?.content,
                  )}
                >
                  <span className={cn("truncate", classes?.label)}>
                    {item.label}
                  </span>
                  {item.description && (
                    <span
                      className={cn(
                        "text-[0.7em] opacity-60 font-normal",
                        classes?.description,
                      )}
                    >
                      {item.description}
                    </span>
                  )}
                </span>

                {/* Icon — end */}
                {item.icon && iconPosition === "end" && (
                  <span
                    className={cn(
                      "shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em] ms-1.5",
                      classes?.icon,
                    )}
                  >
                    {item.icon}
                  </span>
                )}

                {/* Badge */}
                {item.badge && (
                  <span
                    className={cn(
                      "shrink-0 ms-1.5",
                      classes?.badge,
                      item.badgeClassName,
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);

Segmented.displayName = "Segmented";
