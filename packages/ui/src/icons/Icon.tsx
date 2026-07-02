import React from "react";
import { cn } from "../utils/cn";

/* ------------------------------------------------------------------ */
/*  Icon — Base icon component with consistent API                     */
/* ------------------------------------------------------------------ */

export type IconName = string;

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Icon size in pixels (applies to both width and height) */
  size?: number;
  /** Additional CSS class names */
  className?: string;
  /** Accessible label — if omitted, icon is decorative (aria-hidden) */
  label?: string;
  /** Stroke width for line icons */
  strokeWidth?: number;
}

const DEFAULT_SIZE = 24;
const DEFAULT_STROKE_WIDTH = 2;

/**
 * Base Icon wrapper — standardizes SVG props, accessibility, and sizing.
 * Individual icon components use this as their root element.
 */
export const Icon = React.forwardRef<SVGSVGElement, IconProps & { children: React.ReactNode }>(
  (
    {
      size = DEFAULT_SIZE,
      className,
      label,
      strokeWidth = DEFAULT_STROKE_WIDTH,
      children,
      ...rest
    },
    ref,
  ) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "img" : undefined}
      {...rest}
    >
      {children}
    </svg>
  ),
);

Icon.displayName = "Icon";

/**
 * Factory to create individual icon components with consistent API.
 */
export function createIcon(
  name: string,
  paths: React.ReactNode,
): React.FC<IconProps> {
  const IconComponent = React.forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
      <Icon ref={ref} {...props}>
        {paths}
      </Icon>
    ),
  );
  IconComponent.displayName = name;
  return IconComponent as React.FC<IconProps>;
}
