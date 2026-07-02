import React, { createContext, forwardRef, useContext } from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import { stateAttrs } from "../../internal/interaction-core";
import type { SlotProps } from "../_shared/slot-types";

/* ------------------------------------------------------------------ */
/*  Card — Elevated content container                                  */
/* ------------------------------------------------------------------ */

export type CardVariant = "elevated" | "outlined" | "filled" | "ghost";
export type CardPadding = "none" | "sm" | "md" | "lg";

export type CardSlot = "root" | "header" | "body" | "footer";

/** Props for the Card component. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Interactive — adds hover effects */
  hoverable?: boolean;
  /** Full-width click target */
  as?: "div" | "button" | "article" | "section";
  /**
   * Render via Slot — merges Card props onto the child element.
   * Modern alternative to `as` for polymorphism.
   * @example <Card asChild><a href="/detail">...</a></Card>
   */
  asChild?: boolean;
  /** Override props (className, style, etc.) on internal slot elements */
  slotProps?: SlotProps<CardSlot>;
}

const variantStyles: Record<CardVariant, string> = {
  elevated: "bg-surface-default border border-border-subtle shadow-xs",
  outlined: "bg-transparent border border-border-default",
  filled: "bg-surface-muted border border-transparent",
  ghost: "bg-transparent border border-transparent",
};

const CardSlotPropsContext = createContext<SlotProps<CardSlot> | undefined>(undefined);

function useCardSlotProps() {
  return useContext(CardSlotPropsContext);
}

const paddingStyles: Record<CardPadding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

/**
 * Elevated content container with variant styles, optional hover effect, and polymorphic element support.
 *
 * @example
 * ```tsx
 * <Card variant="elevated" padding="md" hoverable>
 *   <CardHeader title="Project" subtitle="Updated 2 hours ago" />
 *   <CardBody>Card content here</CardBody>
 * </Card>
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/card)
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "elevated",
      padding = "md",
      hoverable = false,
      as: Tag = "div",
      asChild = false,
      className,
      children,
      slotProps,
      ...rest
    },
    ref,
  ) => {
    const mergedClassName = cn(
      "rounded-2xl transition-all duration-(--motion-duration-fast)",
      variantStyles[variant],
      paddingStyles[padding],
      hoverable && [
        "cursor-pointer",
        "hover:border-action-primary/30 hover:shadow-md",
        "active:scale-[0.99]",
      ],
      !asChild && Tag === "button" && "w-full text-start",
      className,
      slotProps?.root?.className,
    );

    const sharedProps = {
      role: !asChild && Tag === "button" ? "button" as const : undefined,
      tabIndex: !asChild && Tag === "button" ? 0 : undefined,
      ...stateAttrs({ component: "card" }),
      className: mergedClassName,
      ...rest,
    };

    const wrappedChildren = slotProps ? (
      <CardSlotPropsContext.Provider value={slotProps}>
        {children}
      </CardSlotPropsContext.Provider>
    ) : children;

    if (asChild) {
      return (
        <Slot ref={ref} {...sharedProps}>
          {wrappedChildren}
        </Slot>
      );
    }

    return (
      <div ref={ref} {...sharedProps}>
        {wrappedChildren}
      </div>
    );
  },
);

Card.displayName = "Card";

/* ---- Card sub-components ---- */

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className,
  children,
  ...rest
}) => {
  const cardSlotProps = useCardSlotProps();
  return (
    <div {...cardSlotProps?.header} className={cn("flex items-start justify-between gap-4", className, cardSlotProps?.header?.className)} {...rest}>
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-sm font-semibold text-text-primary">{title}</div>
        )}
        {subtitle && (
          <div className="mt-0.5 text-xs text-text-secondary">{subtitle}</div>
        )}
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

CardHeader.displayName = "CardHeader";

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => {
  const cardSlotProps = useCardSlotProps();
  return (
    <div {...cardSlotProps?.body} className={cn("mt-3", className, cardSlotProps?.body?.className)} {...rest}>
      {children}
    </div>
  );
};

CardBody.displayName = "CardBody";

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...rest
}) => {
  const cardSlotProps = useCardSlotProps();
  return (
    <div
      {...cardSlotProps?.footer}
      className={cn(
        "mt-4 flex items-center gap-2 border-t border-border-subtle pt-3",
        className,
        cardSlotProps?.footer?.className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

CardFooter.displayName = "CardFooter";
