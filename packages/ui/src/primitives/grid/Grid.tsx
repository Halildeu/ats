import React, { forwardRef, createContext, useContext } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';
import type { BreakpointKey } from '../../hooks/useBreakpoint';

/* ------------------------------------------------------------------ */
/*  Grid — Responsive CSS Grid layout (Row + Col compound)             */
/*                                                                     */
/*  12 or 24 column grid with responsive span, offset, and order.     */
/*  Uses CSS Grid (not flexbox) for true column alignment.            */
/* ------------------------------------------------------------------ */

export type GridColumns = 12 | 24;
export type GridGutter = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
export type GridAlign = 'start' | 'center' | 'end' | 'stretch';
export type GridJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

/** Responsive value — either a static value or per-breakpoint object. */
export type ResponsiveValue<T> = T | Partial<Record<BreakpointKey, T>>;

export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns. @default 12 */
  columns?: GridColumns;
  /** Gap between cells (token scale). @default 4 */
  gutter?: GridGutter;
  /** Vertical alignment of cells. @default 'stretch' */
  align?: GridAlign;
  /** Horizontal distribution. */
  justify?: GridJustify;
  /** Semantic HTML element. @default 'div' */
  as?: 'div' | 'section' | 'article' | 'main' | 'nav';
}

export interface GridColProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Column span (1-12 or 1-24). Required. */
  span: ResponsiveValue<number>;
  /** Column offset. */
  offset?: ResponsiveValue<number>;
  /** Display order. */
  order?: ResponsiveValue<number>;
  /** Semantic HTML element. @default 'div' */
  as?: 'div' | 'section' | 'article' | 'aside';
}

/* ---- Context ---- */

const GridContext = createContext<{ columns: GridColumns }>({ columns: 12 });

/* ---- Style maps ---- */

const gutterMap: Record<GridGutter, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
};

const alignMap: Record<GridAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const justifyMap: Record<GridJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

/* ---- Responsive class builder ---- */

const BP_PREFIX: Record<BreakpointKey, string> = {
  xs: '',
  sm: 'sm:',
  md: 'md:',
  lg: 'lg:',
  xl: 'xl:',
  '2xl': '2xl:',
};

function resolveResponsiveClasses<T>(
  value: ResponsiveValue<T> | undefined,
  classFn: (v: T, prefix: string) => string,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Partial<Record<BreakpointKey, T>>;
    return Object.entries(obj)
      .map(([bp, v]) => (v !== undefined ? classFn(v as T, BP_PREFIX[bp as BreakpointKey]) : ''))
      .filter(Boolean)
      .join(' ');
  }
  return classFn(value as T, '');
}

function spanClass(span: number, prefix: string): string {
  if (span <= 0) return `${prefix}hidden`;
  return `${prefix}col-span-${span}`;
}

function offsetClass(offset: number, prefix: string): string {
  if (offset <= 0) return '';
  return `${prefix}col-start-${offset + 1}`;
}

function orderClass(order: number, prefix: string): string {
  return `${prefix}order-${order}`;
}

/* ---- Grid Root ---- */

/**
 * Responsive CSS Grid container with 12 or 24 column support.
 * Use with `Grid.Col` for column placement with responsive span,
 * offset, and order.
 *
 * @example
 * ```tsx
 * <Grid columns={12} gutter={4}>
 *   <Grid.Col span={8} md={6}>Main</Grid.Col>
 *   <Grid.Col span={4} md={6}>Side</Grid.Col>
 * </Grid>
 * ```
 *
 * @since 1.1.0
 */
const GridRoot = forwardRef<HTMLDivElement, GridProps>(
  function GridRoot(
    {
      columns = 12,
      gutter = 4,
      align = 'stretch',
      justify,
      as: Tag = 'div',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <GridContext.Provider value={{ columns }}>
        <Tag
          ref={ref as React.Ref<HTMLDivElement>}
          {...stateAttrs({ component: 'grid' })}
          className={cn(
            'grid',
            columns === 12 ? 'grid-cols-12' : 'grid-cols-[repeat(24,minmax(0,1fr))]',
            gutterMap[gutter],
            alignMap[align],
            justify && justifyMap[justify],
            className,
          )}
          {...rest}
        >
          {children}
        </Tag>
      </GridContext.Provider>
    );
  },
);

GridRoot.displayName = 'Grid';

/* ---- Grid.Col ---- */

/**
 * Column within a Grid. Supports responsive span, offset, and order
 * via breakpoint props or responsive object notation.
 *
 * @example
 * ```tsx
 * <Grid.Col span={12} md={6} lg={4}>Responsive column</Grid.Col>
 * <Grid.Col span={{ xs: 12, md: 6, xl: 4 }}>Object notation</Grid.Col>
 * ```
 */
const GridCol = forwardRef<HTMLDivElement, GridColProps & Partial<Record<BreakpointKey, number>>>(
  function GridCol(
    {
      span,
      offset,
      order,
      as: Tag = 'div',
      className,
      children,
      // Extract responsive shorthand props
      xs, sm, md, lg, xl,
      '2xl': xxl,
      ...rest
    },
    ref,
  ) {
    // Merge shorthand responsive props into span object
    const responsiveSpan: ResponsiveValue<number> = (() => {
      const hasShorthand = xs !== undefined || sm !== undefined || md !== undefined || lg !== undefined || xl !== undefined || xxl !== undefined;
      if (!hasShorthand) return span;

      const base = typeof span === 'number' ? { xs: span } : (span as Partial<Record<BreakpointKey, number>>);
      return {
        ...base,
        ...(xs !== undefined && { xs }),
        ...(sm !== undefined && { sm }),
        ...(md !== undefined && { md }),
        ...(lg !== undefined && { lg }),
        ...(xl !== undefined && { xl }),
        ...(xxl !== undefined && { '2xl': xxl }),
      };
    })();

    return (
      <Tag
        ref={ref as React.Ref<HTMLDivElement>}
        {...stateAttrs({ component: 'grid-col' })}
        className={cn(
          'min-w-0',
          resolveResponsiveClasses(responsiveSpan, spanClass),
          resolveResponsiveClasses(offset, offsetClass),
          resolveResponsiveClasses(order, orderClass),
          className,
        )}
        {...rest}
      >
        {children}
      </Tag>
    );
  },
);

GridCol.displayName = 'Grid.Col';

/* ---- Compound assembly ---- */

type CompoundGrid = typeof GridRoot & {
  Col: typeof GridCol;
};

export const Grid = GridRoot as CompoundGrid;
Grid.Col = GridCol;
