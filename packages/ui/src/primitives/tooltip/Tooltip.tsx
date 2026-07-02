import React, { useState, useRef, useCallback, useEffect, useId } from "react";
import { stateAttrs } from "../../internal/interaction-core";
import { registerLayer, unregisterLayer } from "../../internal/overlay-engine";
import { cn } from "../../utils/cn";

/* ------------------------------------------------------------------ */
/*  Tooltip — Hover / focus information overlay                        */
/* ------------------------------------------------------------------ */

export type TooltipPlacement = "top" | "bottom" | "left" | "right";
export type TooltipAlign = "start" | "center" | "end";

/**
 * Tooltip renders a hover/focus information overlay positioned relative to its trigger element.
 */
export interface TooltipProps {
  /** Tooltip content displayed in the overlay. */
  content?: React.ReactNode;
  /** Side on which the tooltip appears. @default "top" */
  placement?: TooltipPlacement;
  /** Horizontal alignment relative to the trigger. @default "center" */
  align?: TooltipAlign;
  /** @deprecated Use `openDelay` instead. Delay before showing (ms). */
  delay?: number;
  /** Delay in ms before the tooltip appears. @default 200 */
  openDelay?: number;
  /** Delay in ms before the tooltip hides. @default 0 */
  closeDelay?: number;
  /** Prevent the tooltip from appearing. @default false */
  disabled?: boolean;
  /** Show a directional arrow pointing to the trigger. @default false */
  showArrow?: boolean;
  /** Additional CSS class name for the wrapper span. */
  className?: string;
  /**
   * Render the trigger via Slot — merges tooltip event handlers
   * directly onto the child element, removing the wrapper `<span>`.
   * The child element must accept `className`, `onMouseEnter`,
   * `onMouseLeave`, `onFocus`, `onBlur`, and `onKeyDown` props.
   * @example
   * <Tooltip content="Settings" asChild>
   *   <IconButton icon={<GearIcon />} aria-label="Settings" />
   * </Tooltip>
   */
  asChild?: boolean;
  /** Trigger element that the tooltip wraps. */
  children: React.ReactNode;
}

const placementStyles: Record<TooltipPlacement, string> = {
  top: "bottom-full start-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full start-1/2 -translate-x-1/2 mt-2",
  left: "end-full top-1/2 -translate-y-1/2 me-2",
  right: "start-full top-1/2 -translate-y-1/2 ms-2",
};

const arrowStyles: Record<TooltipPlacement, string> = {
  top: "top-full start-1/2 -translate-x-1/2 border-t-[var(--text-primary)] border-x-transparent border-b-transparent",
  bottom: "bottom-full start-1/2 -translate-x-1/2 border-b-[var(--text-primary)] border-x-transparent border-t-transparent",
  left: "start-full top-1/2 -translate-y-1/2 border-s-[var(--text-primary)] border-y-transparent border-e-transparent",
  right: "end-full top-1/2 -translate-y-1/2 border-e-[var(--text-primary)] border-y-transparent border-s-transparent",
};

/** Hover/focus information overlay positioned relative to its trigger element. */
export const Tooltip = React.forwardRef<HTMLSpanElement, TooltipProps>(({
  content,
  placement = "top",
  align: _align,
  delay,
  openDelay,
  closeDelay = 0,
  disabled = false,
  showArrow = false,
  className,
  asChild = false,
  children,
}, ref) => {
  const [visible, setVisible] = useState(false);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const resolvedDelay = openDelay ?? delay ?? 200;
  const resolvedContent = content;
  const layerId = useId();

  /* ---- overlay-engine: layer-stack registration ---- */
  useEffect(() => {
    if (visible) {
      registerLayer(`tooltip-${layerId}`, "toast");
    }
    return () => {
      if (visible) {
        unregisterLayer(`tooltip-${layerId}`);
      }
    };
  }, [visible, layerId]);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimeout(hideTimeoutRef.current);
    showTimeoutRef.current = setTimeout(() => setVisible(true), resolvedDelay);
  }, [resolvedDelay, disabled]);

  const hide = useCallback(() => {
    clearTimeout(showTimeoutRef.current);
    if (closeDelay > 0) {
      hideTimeoutRef.current = setTimeout(() => setVisible(false), closeDelay);
    } else {
      setVisible(false);
    }
  }, [closeDelay]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        hide();
      }
    },
    [hide],
  );

  if (!resolvedContent) {
    return <>{children}</>;
  }

  const tooltipPopup = visible ? (
    <span
      role="tooltip"
      {...stateAttrs({ state: visible ? "open" : "closed", component: "tooltip" })}
      className={cn(
        "pointer-events-none absolute z-[1600] rounded-lg px-2.5 py-1.5",
        "bg-text-primary text-xs font-medium text-text-inverse",
        "shadow-lg animate-in fade-in-0 zoom-in-95",
        placementStyles[placement],
      )}
    >
      {resolvedContent}
      {showArrow && (
        <span
          className={cn(
            "absolute border-4",
            arrowStyles[placement],
          )}
        />
      )}
    </span>
  ) : null;

  const triggerProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: handleKeyDown,
  };

  // asChild: merge trigger behavior onto the child element directly,
  // avoiding the extra wrapper <span>. The child must support className
  // and event handler props.
  if (asChild) {
    const child = React.Children.only(children);
    if (!React.isValidElement(child)) {
      console.warn("Tooltip: asChild requires a single valid React element as child.");
      return <>{children}</>;
    }

    const childProps = child.props as Record<string, unknown>;
    return React.cloneElement(child, {
      ...triggerProps,
      className: cn("relative inline-flex", childProps.className as string | undefined, className),
      // Compose event handlers with child's existing handlers
      onMouseEnter: childProps.onMouseEnter
        ? (e: React.MouseEvent) => { show(); (childProps.onMouseEnter as (e: React.MouseEvent) => void)(e); }
        : show,
      onMouseLeave: childProps.onMouseLeave
        ? (e: React.MouseEvent) => { hide(); (childProps.onMouseLeave as (e: React.MouseEvent) => void)(e); }
        : hide,
      onFocus: childProps.onFocus
        ? (e: React.FocusEvent) => { show(); (childProps.onFocus as (e: React.FocusEvent) => void)(e); }
        : show,
      onBlur: childProps.onBlur
        ? (e: React.FocusEvent) => { hide(); (childProps.onBlur as (e: React.FocusEvent) => void)(e); }
        : hide,
    } as Record<string, unknown>,
      ...(React.Children.toArray((child.props as { children?: React.ReactNode }).children)),
      tooltipPopup,
    );
  }

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex", className)}
      {...triggerProps}
    >
      {children}
      {tooltipPopup}
    </span>
  );
});

Tooltip.displayName = "Tooltip";
