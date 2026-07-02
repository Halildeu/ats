import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import { Spinner } from "../spinner/Spinner";
import {
  resolveAccessState,
  shouldBlockInteraction,
  stateAttrs,
  focusRingClass,
  focusRingClassWithColor,
  guardAria,
  type AccessLevel,
} from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Button                                                             */
/*                                                                     */
/*  Variants: primary · secondary · outline · ghost · danger · link    */
/*  Sizes:    xs · sm · md · lg · xl                                   */
/* ------------------------------------------------------------------ */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "link";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export type ButtonDensity = "compact" | "comfortable" | "spacious";

export type ButtonProps<C extends React.ElementType = "button"> = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Density controls padding/spacing */
  density?: ButtonDensity;
  /** Render a loading spinner and disable interaction */
  loading?: boolean;
  /** Icon placed before children */
  leftIcon?: React.ReactNode;
  /** Icon placed after children */
  rightIcon?: React.ReactNode;
  /** Stretch to fill parent width */
  fullWidth?: boolean;
  /** Render as icon-only (square aspect ratio) */
  iconOnly?: boolean;
  /** Access level — controls disabled/readonly state via access-controller */
  access?: AccessLevel;
  /** Tooltip/title text explaining access restriction */
  accessReason?: string;
  /**
   * Render as a different element type (polymorphic).
   * @example <Button as="a" href="/login">Login</Button>
   */
  as?: C;
  /**
   * Render via Slot — merges Button props onto the child element.
   * @example <Button asChild><a href="/login">Login</a></Button>
   */
  asChild?: boolean;
} & Omit<React.ComponentPropsWithoutRef<C>, "as" | "asChild" | "variant" | "size" | "density" | "loading" | "leftIcon" | "rightIcon" | "fullWidth" | "iconOnly" | "access" | "accessReason">;

const densityStyles: Record<ButtonDensity, string> = {
  compact: "px-2 py-0.5",
  comfortable: "",
  spacious: "px-5 py-3",
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-action-primary text-text-inverse",
    "hover:bg-accent-primary-hover",
    "active:bg-[var(--action-primary-active)]",
    "shadow-xs",
  ].join(" "),

  secondary: [
    "bg-surface-muted text-text-primary",
    "hover:bg-border-subtle",
    "active:bg-border-default",
  ].join(" "),

  outline: [
    "border border-border-default bg-transparent text-text-primary",
    "hover:bg-surface-muted",
    "active:bg-border-subtle",
  ].join(" "),

  ghost: [
    "bg-transparent text-text-primary",
    "hover:bg-surface-muted",
    "active:bg-border-subtle",
  ].join(" "),

  danger: [
    "bg-state-danger-text text-text-inverse",
    "hover:brightness-110",
    "active:brightness-90",
    "shadow-xs",
  ].join(" "),

  link: [
    "bg-transparent text-action-primary underline-offset-4",
    "hover:underline",
    "active:text-[var(--action-primary-active)]",
    "p-0 h-auto",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-10 px-5 text-sm gap-2 rounded-xl",
  xl: "h-12 px-6 text-base gap-2.5 rounded-xl",
};

const iconOnlySizes: Record<ButtonSize, string> = {
  xs: "h-7 w-7 rounded-md",
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-lg",
  lg: "h-10 w-10 rounded-xl",
  xl: "h-12 w-12 rounded-xl",
};

/**
 * Primary action trigger with solid, outline, ghost, and link variants in multiple sizes.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleSave}>
 *   Save Changes
 * </Button>
 * ```
 */
export const Button = forwardRef<HTMLElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      density = "comfortable",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      iconOnly = false,
      access = "full",
      accessReason,
      disabled,
      className,
      children,
      title,
      onClick,
      as,
      asChild = false,
      ...rest
    },
    ref,
  ) => {
    // Task 1: warn when iconOnly lacks accessible label
    if (process.env.NODE_ENV !== "production") {
      if (iconOnly && !rest["aria-label"] && !rest["aria-labelledby"] && !title) {
        console.warn(
          "Button: `iconOnly` is true but no `aria-label`, `aria-labelledby`, or `title` was provided. " +
            "This makes the button inaccessible to screen readers.",
        );
      }
    }

    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const blockedByAccess = shouldBlockInteraction(access, disabled);
    const isDisabled = disabled || loading || blockedByAccess;

    const focusClass =
      variant === "danger"
        ? focusRingClassWithColor("ring", "var(--state-error-text)")
        : focusRingClass("ring");

    const mergedClassName = cn(
      "inline-flex items-center justify-center font-medium transition-all duration-(--motion-duration-fast)",
      "select-none whitespace-nowrap",
      "disabled:pointer-events-none disabled:opacity-50",
      variantStyles[variant],
      focusClass,
      iconOnly ? iconOnlySizes[size] : sizeStyles[size],
      density !== "comfortable" && densityStyles[density],
      fullWidth && "w-full",
      className,
    );

    const sharedProps = {
      title: accessReason ?? title,
      onClick: blockedByAccess
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
          }
        : onClick,
      className: mergedClassName,
      "aria-busy": loading || undefined,
      "aria-disabled": isDisabled || undefined,
      ...stateAttrs({
        access,
        disabled: isDisabled,
        loading,
        component: "button",
      }),
      ...guardAria({ access, disabled: isDisabled }),
      ...rest,
    };

    // Strip non-DOM props that playground/legacy code may pass
    const { isLoading: _, loadingDisplay: __, ...cleanProps } = sharedProps as typeof sharedProps & Record<string, unknown>;

    const inner = loading ? (
      <>
        <Spinner size={size === "xs" || size === "sm" ? "xs" : "sm"} />
        {!iconOnly && children && (
          <span className="ms-1.5">{children}</span>
        )}
      </>
    ) : (
      <>
        {leftIcon && (
          <span className="shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em]">
            {leftIcon}
          </span>
        )}
        {children}
        {rightIcon && (
          <span className="shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em]">
            {rightIcon}
          </span>
        )}
      </>
    );

    // asChild: render via Slot, merging props onto the child element
    if (asChild) {
      return (
        <Slot ref={ref} {...cleanProps}>
          {children}
        </Slot>
      );
    }

    // Polymorphic: render as the given element type
    const Component = (as || "button") as React.ElementType;

    return (
      <Component
        ref={ref as React.Ref<never>}
        {...(Component === "button" ? { type: "button", disabled: isDisabled } : {})}
        {...cleanProps}
      >
        {inner}
      </Component>
    );
  },
);

Button.displayName = "Button";

/** Default button props (non-polymorphic) for simple use cases. */
export interface ButtonDefaultProps extends Omit<ButtonProps<'button'>, keyof React.ComponentPropsWithoutRef<'button'>> {}
