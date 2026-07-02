import React from "react";
import { cn } from "../../utils/cn";
import { Avatar } from "../../primitives/avatar";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AvatarGroupItem = {
  key: React.Key;
  src?: string;
  name?: string;
  icon?: React.ReactNode;
};

export type AvatarGroupSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarGroupShape = "circle" | "square";
export type AvatarGroupSpacing = "tight" | "normal" | "loose";

export interface AvatarGroupProps extends AccessControlledProps {
  /** Avatar items to display. */
  items: AvatarGroupItem[];
  /** Maximum number of avatars to show before the "+N" badge. */
  max?: number;
  /** Size variant. @default "md" */
  size?: AvatarGroupSize;
  /** Shape variant. @default "circle" */
  shape?: AvatarGroupShape;
  /** Overlap spacing. @default "normal" */
  spacing?: AvatarGroupSpacing;
  /** Custom renderer for the excess count badge. */
  renderExcess?: (count: number) => React.ReactNode;
  /** Called when an avatar is clicked. */
  onClick?: (item: AvatarGroupItem) => void;
  /** Additional class name for the root element. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Spacing map (negative margin for overlap)                          */
/* ------------------------------------------------------------------
   */

const SPACING_ML: Record<AvatarGroupSpacing, string> = {
  tight: "-ms-3",
  normal: "-ms-2",
  loose: "-ms-1",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name?: string): string | undefined {
  if (!name) return undefined;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ 
 * @example
 * ```tsx
 * <AvatarGroup />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/avatar-group)
 */
export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  function AvatarGroup(
    {
      items,
      max,
      size = "md",
      shape = "circle",
      spacing = "normal",
      renderExcess,
      onClick,
      className,
      access = "full",
      accessReason,
      ...rest
    },
    forwardedRef,
  ) {
    const accessState = resolveAccessState(access);
    const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

    if (accessState.isHidden) return null;

    const visibleItems = max !== undefined ? items.slice(0, max) : items;
    const excessCount = max !== undefined ? Math.max(0, items.length - max) : 0;

    return (
      <div
        ref={forwardedRef}
        role="group"
        aria-label="Avatar grubu"
        aria-disabled={accessState.isDisabled || undefined}
        title={accessReason}
        data-access-state={accessState.state}
        className={cn(
          "inline-flex items-center",
          accessState.isDisabled && "opacity-50 cursor-not-allowed",
          className,
        )}
        {...rest}
      >
        {visibleItems.map((item, idx) => (
          <span
            key={item.key}
            className={cn(
              "relative inline-block ring-2 ring-surface-default",
              shape === "circle" ? "rounded-full" : "rounded-lg",
              idx > 0 && SPACING_ML[spacing],
            )}
            style={{ zIndex: visibleItems.length - idx }}
            title={item.name}
            data-testid="avatar-group-item"
          >
            <Avatar
              src={item.src}
              alt={item.name}
              initials={getInitials(item.name)}
              icon={item.icon}
              size={size}
              shape={shape}
              className={cn(
                isInteractive && onClick && "cursor-pointer hover:opacity-80 transition-opacity",
              )}
              onClick={
                isInteractive && onClick
                  ? () => onClick(item)
                  : undefined
              }
            />
          </span>
        ))}

        {excessCount > 0 && (
          <span
            className={cn(
              "relative inline-flex items-center justify-center",
              "ring-2 ring-surface-default",
              "bg-surface-muted text-text-secondary",
              "font-medium select-none",
              shape === "circle" ? "rounded-full" : "rounded-lg",
              idx0SpacingClass(spacing),
              sizeToExcessClass(size),
            )}
            style={{ zIndex: 0 }}
            data-testid="avatar-group-excess"
            aria-label={`+${excessCount} daha`}
          >
            {renderExcess ? renderExcess(excessCount) : `+${excessCount}`}
          </span>
        )}
      </div>
    );
  },
);

/* ---- excess badge size classes ---- */
function sizeToExcessClass(size: AvatarGroupSize): string {
  const map: Record<AvatarGroupSize, string> = {
    xs: "h-6 w-6 text-[10px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
    xl: "h-14 w-14 text-lg",
  };
  return map[size];
}

function idx0SpacingClass(spacing: AvatarGroupSpacing): string {
  return SPACING_ML[spacing];
}

AvatarGroup.displayName = "AvatarGroup";

export default AvatarGroup;
