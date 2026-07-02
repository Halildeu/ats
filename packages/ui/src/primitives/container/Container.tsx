import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Container — Responsive max-width wrapper                           */
/* ------------------------------------------------------------------ */

export type ContainerMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | false;

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width constraint. @default 'xl' */
  maxWidth?: ContainerMaxWidth;
  /** Center horizontally with auto margins. @default true */
  centered?: boolean;
  /** Apply responsive horizontal padding. @default true */
  padding?: boolean;
  /** Full width with no max constraint (overrides maxWidth). @default false */
  fluid?: boolean;
  /** Semantic HTML element. @default 'div' */
  as?: 'div' | 'section' | 'article' | 'main';
}

const maxWidthMap: Record<Exclude<ContainerMaxWidth, false>, string> = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
};

/**
 * Responsive max-width container with optional centering and padding.
 * Constrains content to a comfortable reading width while maintaining
 * responsive padding on smaller screens.
 *
 * @example
 * ```tsx
 * <Container maxWidth="xl" padding>
 *   <PageContent />
 * </Container>
 *
 * <Container fluid>Full width content</Container>
 * ```
 *
 * @since 1.1.0
 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  function Container(
    {
      maxWidth = 'xl',
      centered = true,
      padding = true,
      fluid = false,
      as: Tag = 'div',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <Tag
        ref={ref as React.Ref<HTMLDivElement>}
        {...stateAttrs({ component: 'container' })}
        className={cn(
          'w-full',
          !fluid && maxWidth && maxWidthMap[maxWidth],
          centered && 'mx-auto',
          padding && 'px-4 sm:px-6 lg:px-8',
          className,
        )}
        {...rest}
      >
        {children}
      </Tag>
    );
  },
);

Container.displayName = 'Container';
