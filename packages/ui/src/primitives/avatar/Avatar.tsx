import React from "react";
import { cn } from "../../utils/cn";
import { stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Avatar — User / entity representation                              */
/* ------------------------------------------------------------------ */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type AvatarShape = "circle" | "square";

/**
 * Avatar displays a user or entity representation as an image, initials, or icon fallback.
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image URL */
  src?: string;
  /** Alt text for the avatar image. */
  alt?: string;
  /** Fallback initials (1-2 chars) */
  initials?: string;
  /** Avatar dimensions. @default "md" */
  size?: AvatarSize;
  /** Border radius shape. @default "circle" */
  shape?: AvatarShape;
  /** Fallback icon (when no src or initials) */
  icon?: React.ReactNode;
}

const sizeStyles: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-14 w-14 text-lg",
  "2xl": "h-16 w-16 text-xl",
};

const shapeStyles: Record<AvatarShape, string> = {
  circle: "rounded-full",
  square: "rounded-lg",
};

/**
 * Circular or square avatar displaying an image, initials fallback, or icon with configurable size.
 *
 * @example
 * ```tsx
 * <Avatar src="/avatars/jane.jpg" alt="Jane Doe" size="lg" />
 * <Avatar initials="JD" size="md" shape="square" />
 * ```
 */
export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({
    src,
    alt,
    initials,
    size = "md",
    shape = "circle",
    icon,
    className,
    ...rest
  }, ref) => {
    const [imgError, setImgError] = React.useState(false);
    const showImage = src && !imgError;

    return (
      <span
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
          "bg-surface-muted text-text-secondary font-medium",
          sizeStyles[size],
          shapeStyles[shape],
          className,
        )}
        {...stateAttrs({ component: "avatar" })}
        {...rest}
      >
      {showImage ? (
        <img
          src={src}
          alt={alt ?? ""}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : initials ? (
        <span className="select-none uppercase leading-none">
          {initials.slice(0, 2)}
        </span>
      ) : icon ? (
        <span className="[&>svg]:h-[1.2em] [&>svg]:w-[1.2em]">{icon}</span>
      ) : (
        /* Default user icon */
        <svg
          className="h-[60%] w-[60%] text-[var(--text-disabled)]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      )}
      </span>
    );
  }
);

Avatar.displayName = "Avatar";
