import React from "react";
import { cn } from "../../utils/cn";

/* ------------------------------------------------------------------ */
/*  Divider — Visual separator                                         */
/* ------------------------------------------------------------------ */

/**
 * Divider renders a horizontal or vertical visual separator with optional center label.
 */
export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Orientation of the divider line. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** Label text displayed centered within the divider line. */
  label?: string;
  /** Margin spacing around the divider. @default "md" */
  spacing?: "none" | "sm" | "md" | "lg";
  /** Additional CSS class name for the divider element. */
  className?: string;
  /** ARIA role override for the separator element. */
  role?: React.AriaRole;
  /** Data attribute for test automation. */
  "data-testid"?: string;
}

const spacingMap: Record<string, string> = {
  none: "",
  sm: "my-2",
  md: "my-4",
  lg: "my-6",
};

const spacingVerticalMap: Record<string, string> = {
  none: "",
  sm: "mx-2",
  md: "mx-4",
  lg: "mx-6",
};

/**
 * Horizontal or vertical line separator with optional center label for content sectioning.
 *
 * @example
 * ```tsx
 * <Divider spacing="md" />
 * <Divider label="OR" />
 * <Divider orientation="vertical" />
 * ```
 */
export const Divider = React.forwardRef<HTMLElement, DividerProps>(
  ({
    orientation = "horizontal",
    label,
    spacing = "md",
    className,
    ...rest
  }, ref) => {
    if (orientation === "vertical") {
      return (
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          role="separator"
          aria-orientation="vertical"
          className={cn(
            "inline-block h-full w-px bg-border-subtle",
            spacingVerticalMap[spacing],
            className,
          )}
          {...(rest as React.HTMLAttributes<HTMLDivElement>)}
        />
      );
    }

    if (label) {
      return (
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          role="separator"
          className={cn(
            "flex items-center gap-3",
            spacingMap[spacing],
            className,
          )}
          {...(rest as React.HTMLAttributes<HTMLDivElement>)}
        >
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs font-medium text-text-secondary">
            {label}
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>
      );
    }

    return (
      <hr
        ref={ref as React.Ref<HTMLHRElement>}
        className={cn(
          "border-none h-px bg-border-subtle",
          spacingMap[spacing],
          className,
        )}
        {...rest}
      />
    );
  }
);

Divider.displayName = "Divider";

/** Type alias for Divider ref. */
export type DividerRef = React.Ref<HTMLElement>;
/** Type alias for Divider element. */
export type DividerElement = HTMLElement;
/** Type alias for Divider cssproperties. */
export type DividerCSSProperties = React.CSSProperties;
