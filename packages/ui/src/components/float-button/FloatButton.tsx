import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type FloatButtonShape = "circle" | "square";
export type FloatButtonSize = "sm" | "md" | "lg";
export type FloatButtonPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";
export type FloatButtonTrigger = "click" | "hover";

export interface FloatButtonGroupItem {
  key: string;
  icon?: React.ReactNode;
  label?: string;
  onClick?: () => void;
}

export interface FloatButtonProps extends AccessControlledProps {
  /** Icon rendered inside the button. */
  icon?: React.ReactNode;
  /** Text label displayed next to the icon. */
  label?: string;
  /** Tooltip text. @default label value */
  tooltip?: string;
  /** Button shape. @default "circle" */
  shape?: FloatButtonShape;
  /** Visual size variant. @default "md" */
  size?: FloatButtonSize;
  /** Fixed position on the viewport. @default "bottom-right" */
  position?: FloatButtonPosition;
  /** Pixel offset from the positioned edge [horizontal, vertical]. @default [24, 24] */
  offset?: [number, number];
  /** Badge indicator. Number shows count, true shows a dot. */
  badge?: number | boolean;
  /** Click handler for the primary button. */
  onClick?: () => void;
  /** Speed-dial / group items that expand from the primary button. */
  items?: FloatButtonGroupItem[];
  /** How the group menu is triggered. @default "click" */
  trigger?: FloatButtonTrigger;
  /** Controlled open state for the group menu. */
  open?: boolean;
  /** Callback when group menu open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Additional class name for the root wrapper. */
  className?: string;
  /** Accessible label for the button. @default "Eylem butonu" */
  "aria-label"?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------
   */

const SIZE_MAP: Record<FloatButtonSize, { button: number; icon: number; font: string }> = {
  sm: { button: 40, icon: 18, font: "text-xs" },
  md: { button: 48, icon: 22, font: "text-sm" },
  lg: { button: 56, icon: 26, font: "text-base" },
};

/* ------------------------------------------------------------------ */
/*  Position map                                                       */
/* ------------------------------------------------------------------ */

function getPositionStyle(
  position: FloatButtonPosition,
  offset: [number, number],
): React.CSSProperties {
  const [h, v] = offset;
  switch (position) {
    case "bottom-right":
      return { position: "fixed", right: h, bottom: v };
    case "bottom-left":
      return { position: "fixed", left: h, bottom: v };
    case "top-right":
      return { position: "fixed", right: h, top: v };
    case "top-left":
      return { position: "fixed", left: h, top: v };
  }
}

/* ------------------------------------------------------------------ */
/*  Default icon (plus)                                                */
/* ------------------------------------------------------------------ */

const PlusIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Badge sub-component                                                */
/* ------------------------------------------------------------------ */

const Badge: React.FC<{ badge?: number | boolean; size: FloatButtonSize }> = ({
  badge,
  size,
}) => {
  if (badge === false || badge === undefined) return null;

  const isDot = badge === true;
  const dotSize = size === "sm" ? 8 : size === "md" ? 10 : 12;

  return isDot ? (
    <span
      className="absolute -top-0.5 -right-0.5 rounded-full bg-[var(--float-button-badge)]"
      style={{ width: dotSize, height: dotSize }}
      data-testid="float-button-badge-dot"
    />
  ) : (
    <span
      className={cn(
        "absolute -top-1 -right-1 flex items-center justify-center rounded-full",
        "bg-[var(--float-button-badge)] text-text-inverse font-medium leading-none",
        size === "sm" ? "min-w-[16px] h-4 px-1 text-[10px]" : "min-w-[18px] h-[18px] px-1 text-[11px]",
      )}
      data-testid="float-button-badge-count"
    >
      {badge > 99 ? "99+" : badge}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ 
 * @example
 * ```tsx
 * <FloatButton />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/float-button)
 */
export const FloatButton = React.forwardRef<HTMLDivElement, FloatButtonProps>(
  function FloatButton(
    {
      icon,
      label,
       
      tooltip,
      shape = "circle",
      size = "md",
      position = "bottom-right",
      offset = [24, 24],
      badge: badgeProp,
      onClick,
      items,
      trigger = "click",
      open: controlledOpen,
      onOpenChange,
      className,
      access = "full",
      accessReason,
      "aria-label": ariaLabel = "Eylem butonu",
      ...rest
    },
    forwardedRef,
  ) {
    const accessState = resolveAccessState(access);
    const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

    // Group open state (controlled vs uncontrolled)
    const hasGroup = items && items.length > 0;
    const isControlledOpen = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(false);
    const isOpen = isControlledOpen ? controlledOpen : internalOpen;

    const setOpen = React.useCallback(
      (next: boolean) => {
        if (!isControlledOpen) setInternalOpen(next);
        onOpenChange?.(next);
      },
      [isControlledOpen, onOpenChange],
    );

    // Close on Escape
    React.useEffect(() => {
      if (!isOpen) return;
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpen(false);
        }
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, setOpen]);

    if (accessState.isHidden) return null;

    const sizeConfig = SIZE_MAP[size];
    const positionStyle = getPositionStyle(position, offset);
    const isTopPosition = position === "top-right" || position === "top-left";

    const buttonClasses = cn(
      "inline-flex items-center justify-center transition-all duration-(--motion-duration-medium)",
      "border border-transparent",
      "bg-[var(--float-button-bg)] text-[var(--float-button-text)]",
      "shadow-lg hover:shadow-xl",
      focusRingClass("ring"),
      shape === "circle" ? "rounded-full" : "rounded-lg",
      accessState.isDisabled && "opacity-50 cursor-not-allowed",
      !isInteractive && !accessState.isDisabled && "cursor-default",
      isInteractive && "cursor-pointer hover:bg-[var(--float-button-bg-hover)] active:scale-95",
    );

    const handlePrimaryClick = () => {
      if (!isInteractive) return;
      if (hasGroup) {
        setOpen(!isOpen);
      }
      onClick?.();
    };

    const handlePrimaryKeyDown = (e: React.KeyboardEvent) => {
      if (!isInteractive) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePrimaryClick();
      }
    };

    const handleMouseEnter = () => {
      if (!isInteractive || trigger !== "hover" || !hasGroup) return;
      setOpen(true);
    };

    const handleMouseLeave = () => {
      if (!isInteractive || trigger !== "hover" || !hasGroup) return;
      setOpen(false);
    };

    return (
      <div
        ref={forwardedRef}
        data-access-state={accessState.state}
        className={cn("z-50 flex flex-col items-center gap-2", className)}
        style={positionStyle}
        title={accessReason}
        {...stateAttrs({ component: "float-button", state: isOpen ? "open" : "closed", disabled: accessState.isDisabled })}
        data-testid="float-button-root"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...rest}
      >
        {/* Group items */}
        {hasGroup && (
          <div
            className={cn(
              "flex flex-col items-center gap-2 transition-all duration-(--motion-duration-medium)",
              isOpen ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none",
              isTopPosition && "order-2",
            )}
            role="menu"
            aria-label="Eylem listesi"
            data-testid="float-button-group"
          >
            {items!.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={cn(
                  buttonClasses,
                  "bg-[var(--float-button-item-bg)] text-[var(--float-button-item-text)]",
                  "hover:bg-[var(--float-button-item-bg-hover)]",
                  "shadow-md",
                )}
                style={{
                  width: sizeConfig.button - 8,
                  height: sizeConfig.button - 8,
                }}
                title={item.label}
                aria-label={item.label}
                onClick={() => {
                  if (!isInteractive) return;
                  item.onClick?.();
                  setOpen(false);
                }}
                data-testid={`float-button-item-${item.key}`}
              >
                {item.icon}
              </button>
            ))}
          </div>
        )}

        {/* Primary button */}
        <button
          type="button"
          className={cn(
            buttonClasses,
            "relative",
            hasGroup && isOpen && "rotate-45",
            isTopPosition && hasGroup && "order-1",
          )}
          style={{
            width: sizeConfig.button,
            height: label ? undefined : sizeConfig.button,
            ...(label ? { paddingLeft: 16, paddingRight: 16 } : {}),
          }}
          aria-label={ariaLabel}
          aria-disabled={accessState.isDisabled || undefined}
          aria-expanded={hasGroup ? isOpen : undefined}
          aria-haspopup={hasGroup ? "menu" : undefined}
          tabIndex={isInteractive ? 0 : -1}
          onClick={handlePrimaryClick}
          onKeyDown={handlePrimaryKeyDown}
          data-testid="float-button-trigger"
        >
          {icon ?? <PlusIcon size={sizeConfig.icon} />}
          {label && (
            <span className={cn("ms-2", sizeConfig.font)}>{label}</span>
          )}
          <Badge badge={badgeProp} size={size} />
        </button>
      </div>
    );
  },
);

FloatButton.displayName = "FloatButton";

export default FloatButton;
