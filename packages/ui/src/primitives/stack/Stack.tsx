import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";

/* ------------------------------------------------------------------ */
/*  Stack — Flexbox layout primitive                                   */
/*                                                                     */
/*  Inspired by Chakra UI Stack / MUI Stack.                           */
/*  Provides consistent spacing and alignment for layouts.             */
/* ------------------------------------------------------------------ */

export type StackDirection = "row" | "column" | "row-reverse" | "column-reverse";
export type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type StackGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

/** Props for the Stack component.
 * @example
 * ```tsx
 * <Stack />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/stack)
 */
export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flex direction of the stack. */
  direction?: StackDirection;
  /** Cross-axis alignment of items. */
  align?: StackAlign;
  /** Main-axis justification of items. */
  justify?: StackJustify;
  /** Spacing gap between items. */
  gap?: StackGap;
  /** Whether items wrap to multiple lines. */
  wrap?: boolean;
  /** Render as another element */
  as?: "div" | "section" | "article" | "nav" | "main" | "aside" | "ul" | "ol";
}

const directionMap: Record<StackDirection, string> = {
  row: "flex-row",
  column: "flex-col",
  "row-reverse": "flex-row-reverse",
  "column-reverse": "flex-col-reverse",
};

const alignMap: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyMap: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

const gapMap: Record<StackGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
};

/** Flexbox layout primitive with configurable direction, alignment, gap, and polymorphic element. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = "column",
      align,
      justify,
      gap = 3,
      wrap = false,
      as: _Tag = "div",
      className,
      children,
      ...rest
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "flex",
        directionMap[direction],
        align && alignMap[align],
        justify && justifyMap[justify],
        gapMap[gap],
        wrap && "flex-wrap",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);

Stack.displayName = "Stack";

/* ---- HStack / VStack convenience wrappers ---- */

export type HStackProps = Omit<StackProps, "direction">;
export type VStackProps = Omit<StackProps, "direction">;

export const HStack = forwardRef<HTMLDivElement, HStackProps>(
  ({ align = "center", ...rest }, ref) => (
    <Stack ref={ref} direction="row" align={align} {...rest} />
  ),
);
HStack.displayName = "HStack";

export const VStack = forwardRef<HTMLDivElement, VStackProps>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />,
);
VStack.displayName = "VStack";
