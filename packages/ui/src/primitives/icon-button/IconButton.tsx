import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import { Spinner } from "../spinner/Spinner";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  IconButton — Square button optimized for icon content              */
/* ------------------------------------------------------------------ */

export type IconButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type IconButtonSize = "xs" | "sm" | "md" | "lg";

/**
 * IconButton renders a square button optimized for icon-only content
 * with accessible labeling and multiple visual variants.
 */
export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    AccessControlledProps {
  /** Icon element rendered inside the button. */
  icon: React.ReactNode;
  /** Accessible label (required since there's no visible text). */
  label: string;
  /** Visual style variant. @default "ghost" */
  variant?: IconButtonVariant;
  /** Button dimensions. @default "md" */
  size?: IconButtonSize;
  /** Show a spinner instead of the icon. @default false */
  loading?: boolean;
  /** Use fully rounded (pill) border radius. @default false */
  rounded?: boolean;
  /**
   * Render via Slot — merges IconButton props onto the child element.
   * @example <IconButton asChild icon={<X />} label="Close"><a href="/close" /></IconButton>
   */
  asChild?: boolean;
}

const variantStyles: Record<IconButtonVariant, string> = {
  primary:
    "bg-action-primary text-text-inverse hover:bg-accent-primary-hover shadow-xs",
  secondary:
    "bg-surface-muted text-text-primary hover:bg-border-subtle",
  outline:
    "border border-border-default bg-transparent text-text-primary hover:bg-surface-muted",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary",
  danger:
    "bg-state-danger-text text-text-inverse hover:brightness-110 shadow-xs",
};

const sizeStyles: Record<IconButtonSize, string> = {
  xs: "h-7 w-7 [&>svg]:h-3.5 [&>svg]:w-3.5",
  sm: "h-8 w-8 [&>svg]:h-4 [&>svg]:w-4",
  md: "h-9 w-9 [&>svg]:h-4.5 [&>svg]:w-4.5",
  lg: "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5",
};

/** Square icon-only button with accessible labeling, loading state, and multiple visual variants. */
export const IconButton = forwardRef<HTMLElement, IconButtonProps>(
  (
    {
      icon,
      label,
      variant = "ghost",
      size = "md",
      loading = false,
      rounded = false,
      disabled,
      className,
      access = "full",
      accessReason,
      asChild = false,
      children,
      ...rest
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);

    if (accessState.isHidden) return null;

    const isDisabled = disabled || loading || accessState.isDisabled;

    const mergedClassName = cn(
      "inline-flex items-center justify-center transition-all duration-(--motion-duration-fast)",
      "disabled:pointer-events-none disabled:opacity-50",
      accessState.isReadonly && "cursor-default opacity-70",
      focusRingClass("ring"),
      variantStyles[variant],
      sizeStyles[size],
      rounded ? "rounded-full" : "rounded-lg",
      className,
    );

    const sharedProps = {
      "aria-label": label,
      title: accessReason,
      className: mergedClassName,
      ...stateAttrs({ component: "icon-button", disabled: isDisabled, loading, access }),
      ...rest,
    };

    if (asChild) {
      return (
        <Slot ref={ref} {...sharedProps}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        disabled={isDisabled}
        {...sharedProps}
      >
        {loading ? <Spinner size="xs" /> : icon}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
