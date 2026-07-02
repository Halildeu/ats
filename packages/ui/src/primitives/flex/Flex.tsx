import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Flex — General-purpose flex container                              */
/*                                                                     */
/*  Superset of Stack — direction is optional, supports inline flex,  */
/*  and exposes all flex properties without direction constraint.      */
/* ------------------------------------------------------------------ */

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type FlexJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type FlexWrap = boolean | 'wrap' | 'nowrap' | 'wrap-reverse';
export type FlexGap = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

export interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flex direction. @default 'row' */
  direction?: FlexDirection;
  /** Cross-axis alignment. */
  align?: FlexAlign;
  /** Main-axis distribution. */
  justify?: FlexJustify;
  /** Gap between children (token scale). @default 0 */
  gap?: FlexGap;
  /** Enable wrapping. @default false */
  wrap?: FlexWrap;
  /** Use inline-flex instead of flex. @default false */
  inline?: boolean;
  /** Semantic HTML element. @default 'div' */
  as?: 'div' | 'section' | 'article' | 'nav' | 'main' | 'aside' | 'header' | 'footer' | 'span';
}

const directionMap: Record<FlexDirection, string> = {
  row: 'flex-row',
  column: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'column-reverse': 'flex-col-reverse',
};

const alignMap: Record<FlexAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const justifyMap: Record<FlexJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

const gapMap: Record<FlexGap, string> = {
  0: 'gap-0',
  0.5: 'gap-0.5',
  1: 'gap-1',
  1.5: 'gap-1.5',
  2: 'gap-2',
  2.5: 'gap-2.5',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
};

const wrapMap: Record<string, string> = {
  true: 'flex-wrap',
  wrap: 'flex-wrap',
  'wrap-reverse': 'flex-wrap-reverse',
  nowrap: 'flex-nowrap',
};

/**
 * General-purpose flex container. Superset of Stack — direction is
 * optional, supports inline flex, and exposes all flex properties
 * without direction constraint.
 *
 * @example
 * ```tsx
 * <Flex align="center" justify="between" gap={4}>
 *   <Logo /> <Nav /> <UserMenu />
 * </Flex>
 *
 * <Flex direction="column" gap={2} as="nav">
 *   <Link>Home</Link>
 *   <Link>About</Link>
 * </Flex>
 * ```
 *
 * @since 1.1.0
 */
export const Flex = forwardRef<HTMLDivElement, FlexProps>(
  function Flex(
    {
      direction,
      align,
      justify,
      gap = 0,
      wrap = false,
      inline = false,
      as: Tag = 'div',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const wrapValue = typeof wrap === 'boolean' ? (wrap ? 'true' : '') : wrap;

    return (
      <Tag
        ref={ref as React.Ref<never>}
        {...stateAttrs({ component: 'flex' })}
        className={cn(
          inline ? 'inline-flex' : 'flex',
          direction && directionMap[direction],
          align && alignMap[align],
          justify && justifyMap[justify],
          gap > 0 && gapMap[gap],
          wrapValue && wrapMap[wrapValue],
          className,
        )}
        {...rest}
      >
        {children}
      </Tag>
    );
  },
);

Flex.displayName = 'Flex';
