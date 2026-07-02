'use client';
/* ------------------------------------------------------------------ */
/*  StaggerGroup — animate children with sequential delay              */
/* ------------------------------------------------------------------ */

import React from 'react';
import { useReducedMotion } from '../internal/overlay-engine/reduced-motion';

export interface StaggerGroupProps {
  /** Delay between each child in ms. @default 50 */
  staggerDelay?: number;
  /** Base animation duration in ms. @default 200 */
  duration?: number;
  /** CSS animation classes to apply to each child. */
  className?: string;
  /** Child elements to stagger animate. */
  children: React.ReactNode;
  /** Whether to reverse the stagger order (last child animates first). */
  reverse?: boolean;
  /** Whether to disable stagger animation entirely. */
  disabled?: boolean;
}

/**
 * Wraps children and applies incremental animation-delay to each.
 *
 * @example
 * ```tsx
 * <StaggerGroup staggerDelay={50} className="animate-in fade-in-0 slide-in-from-bottom-2">
 *   <Card>A</Card>
 *   <Card>B</Card>
 *   <Card>C</Card>
 * </StaggerGroup>
 * ```
 */
export function StaggerGroup({
  staggerDelay = 50,
  duration = 200,
  className = 'animate-in fade-in-0',
  children,
}: StaggerGroupProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <>{children}</>;
  }

  return (
    <>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;

        return React.cloneElement(child, {
          ...child.props,
          className: [child.props.className, className].filter(Boolean).join(' '),
          style: {
            ...child.props.style,
            animationDelay: `${index * staggerDelay}ms`,
            animationDuration: `${duration}ms`,
            animationFillMode: 'both',
          },
        });
      })}
    </>
  );
}

StaggerGroup.displayName = 'StaggerGroup';

/** Type alias for StaggerGroup ref. */
export type StaggerGroupRef = React.Ref<HTMLElement>;
/** Type alias for StaggerGroup element. */
export type StaggerGroupElement = HTMLElement;
/** Type alias for StaggerGroup cssproperties. */
export type StaggerGroupCSSProperties = React.CSSProperties;
