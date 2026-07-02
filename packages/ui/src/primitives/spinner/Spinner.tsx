import React from "react";
import { cn } from "../../utils/cn";
import { stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Spinner — Animated loading indicator                               */
/* ------------------------------------------------------------------ */

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";
export type SpinnerMode = "inline" | "block";

/**
 * Spinner renders an animated loading indicator with optional visible label.
 */
export interface SpinnerProps {
  /** Spinner dimensions. @default "md" */
  size?: SpinnerSize;
  /** Additional CSS class name. */
  className?: string;
  /** Accessible label for screen readers. @default "Loading" */
  label?: string;
  /** Display mode: inline (default) or block (centered with visible label). @default "inline" */
  mode?: SpinnerMode;
}

const sizeMap: Record<SpinnerSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

/**
 * Animated circular loading indicator with configurable size and optional visible label.
 *
 * @example
 * ```tsx
 * <Spinner size="md" label="Loading data..." />
 * <Spinner size="sm" mode="block" />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/spinner)
 */
export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({
    size = "md",
    className,
    label = "Loading",
    mode = "inline",
  }, ref) => {
    const svg = (
      <svg
        className={cn("animate-spin", sizeMap[size], mode === "inline" && className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-label={label}
        role="status"
        {...stateAttrs({ component: "spinner", loading: true })}
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    );

    if (mode === "block") {
      return (
        <div
          ref={ref}
          className={cn(
            "flex flex-col items-center justify-center gap-3 py-6 text-text-secondary",
            className,
          )}
        >
          {svg}
          {label ? (
            <span className="text-sm font-medium">{label}</span>
          ) : null}
        </div>
      );
    }

    return (
      <span ref={ref} className="inline-flex">
        {svg}
      </span>
    );
  }
);

Spinner.displayName = "Spinner";
