import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import { stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Alert — Feedback message banner                                    */
/* ------------------------------------------------------------------ */

export type AlertVariant = "info" | "success" | "warning" | "error";

/**
 * Alert renders a feedback message banner with semantic variants, an optional
 * title, icon, action slot, and close button.
 */
export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Semantic color variant. @default "info" */
  variant?: AlertVariant;
  /** @deprecated Use `variant` instead. Will be removed in v3.0.0. */
  severity?: AlertVariant;
  /** Optional bold heading above the message body. */
  title?: React.ReactNode;
  /** Custom leading icon; defaults to the variant's built-in icon. */
  icon?: React.ReactNode;
  /** Show a close/dismiss button. @default false */
  closable?: boolean;
  /** Callback fired when the close button is clicked. */
  onClose?: () => void;
  /** Action element (e.g. button) rendered below the message body. */
  action?: React.ReactNode;
  /**
   * Render via Slot — merges Alert root styling onto the child element.
   * When asChild is true, Alert's internal layout (icon, title, close button)
   * is not rendered; only the root styling and role are merged.
   * @example <Alert asChild variant="error"><MyCustomAlert>...</MyCustomAlert></Alert>
   */
  asChild?: boolean;
}

const variantStyles: Record<AlertVariant, string> = {
  info: "bg-state-info-bg border-state-info-text/20 text-state-info-text",
  success: "bg-state-success-bg border-state-success-text/20 text-state-success-text",
  warning: "bg-state-warning-bg border-state-warning-text/20 text-state-warning-text",
  error: "bg-state-danger-bg border-state-danger-text/20 text-state-danger-text",
};

const defaultIcons: Record<AlertVariant, React.ReactNode> = {
  info: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

/**
 * Contextual feedback banner with semantic variants, optional title, icon, action slot, and close button.
 *
 * @example
 * ```tsx
 * <Alert variant="success" title="Saved" closable onClose={dismiss}>
 *   Your changes have been saved successfully.
 * </Alert>
 * ```
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      variant: variantProp,
      severity,
      title,
      icon,
      closable = false,
      onClose,
      action,
      asChild = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const variant = variantProp ?? severity ?? "info";

    if (process.env.NODE_ENV !== "production" && severity !== undefined) {
      console.warn(
        '[DesignSystem] "Alert" prop "severity" is deprecated. Use "variant" instead. "severity" will be removed in v3.0.0.',
      );
    }

    const mergedClassName = cn(
      "flex gap-3 rounded-xl border p-4",
      variantStyles[variant],
      className,
    );

    const sharedProps = {
      role: "alert" as const,
      className: mergedClassName,
      ...stateAttrs({ component: "alert", status: variant === "error" ? "error" : variant === "warning" ? "warning" : variant === "success" ? "success" : "idle" }),
      ...rest,
    };

    // asChild: merge root Alert styling onto the child element.
    // Internal layout (icon, title, close button) is NOT rendered —
    // the child is responsible for its own content.
    if (asChild) {
      return (
        <Slot ref={ref} {...sharedProps}>
          {children}
        </Slot>
      );
    }

    const body = children;

    return (
      <div ref={ref} {...sharedProps}>
        <span className="shrink-0 mt-0.5">{icon ?? defaultIcons[variant]}</span>
        <div className="min-w-0 flex-1">
          {title && (
            <div className="text-sm font-semibold">{title}</div>
          )}
          {body && <div className={cn("text-sm", title && "mt-1 opacity-90")}>{body}</div>}
          {action && <div className="mt-2">{action}</div>}
        </div>
        {closable && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 opacity-60 transition hover:opacity-100"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    );
  },
);

Alert.displayName = "Alert";
