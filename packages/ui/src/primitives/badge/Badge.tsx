import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import { stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Badge — Small status / count indicator                             */
/* ------------------------------------------------------------------ */

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "danger"
  | "info"
  | "muted";

export type BadgeSize = "sm" | "md" | "lg";

/**
 * Badge renders a small status or count indicator with semantic color variants.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual color variant. @default "default" */
  variant?: BadgeVariant;
  /** @deprecated Use `variant` instead. Will be removed in v3.0.0. */
  tone?: BadgeVariant;
  /** Badge size controlling padding and font size. @default "md" */
  size?: BadgeSize;
  /** Render as a dot (no children) */
  dot?: boolean;
  /**
   * Render via Slot — merges Badge props onto the child element.
   * @example <Badge asChild><a href="/status">Active</a></Badge>
   */
  asChild?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-surface-muted text-text-secondary",
  primary:
    "bg-action-primary/10 text-action-primary",
  success:
    "bg-state-success-bg text-state-success-text",
  warning:
    "bg-state-warning-bg text-state-warning-text",
  error:
    "bg-state-danger-bg text-state-danger-text",
  danger:
    "bg-state-danger-bg text-state-danger-text",
  info:
    "bg-state-info-bg text-state-info-text",
  muted:
    "bg-surface-muted text-[var(--text-tertiary)]",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
  lg: "px-2.5 py-1 text-xs",
};

/**
 * Small status or count indicator with semantic color variants and optional dot mode.
 *
 * @example
 * ```tsx
 * <Badge variant="success" size="md">Active</Badge>
 * <Badge variant="error" dot />
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant: variantProp,
      tone,
      size = "md",
      dot = false,
      asChild = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const variant = variantProp ?? tone ?? "default";

    if (process.env.NODE_ENV !== "production" && tone !== undefined) {
      console.warn(
        '[DesignSystem] "Badge" prop "tone" is deprecated. Use "variant" instead. "tone" will be removed in v3.0.0.',
      );
    }

    if (dot) {
      return (
        <span
          ref={ref}
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            variant === "default"
              ? "bg-text-secondary"
              : variantStyles[variant].split(" ").find((c) => c.startsWith("text-"))?.replace("text-", "bg-") ??
                "bg-text-secondary",
            className,
          )}
          {...rest}
        />
      );
    }

    const mergedClassName = cn(
      "inline-flex items-center justify-center rounded-full font-medium leading-none",
      variantStyles[variant],
      sizeStyles[size],
      className,
    );

    const sharedProps = {
      className: mergedClassName,
      ...stateAttrs({ component: "badge" }),
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
      <span ref={ref} {...sharedProps}>
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";
