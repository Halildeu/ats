import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  HeaderBar — Fixed-position app header container                    */
/* ------------------------------------------------------------------ */

export interface HeaderBarProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * CSS variable name set on `document.documentElement` to sync header height.
   * Only activated when provided. Example: `"--shell-header-h"`.
   */
  cssHeightVar?: string;
  /** Enable backdrop blur effect. @default true */
  blur?: boolean;
  /** Inner card styling — renders children inside a rounded bordered card. @default true */
  card?: boolean;
  /** Additional class for the inner card container. */
  cardClassName?: string;
}

/**
 * HeaderBar renders a fixed-position header container with optional backdrop
 * blur and inner card layout. Measures its own height and syncs it to a CSS
 * variable on `document.documentElement` for layout coordination.
 *
 * @example
 * ```tsx
 * <HeaderBar cssHeightVar="--shell-header-h">
 *   <nav>…</nav>
 * </HeaderBar>
 * ```
 *
 * @since 1.1.0
 */
export const HeaderBar = forwardRef<HTMLElement, HeaderBarProps>(function HeaderBar(
  { cssHeightVar, blur = true, card = true, cardClassName, className, children, style, ...rest },
  ref,
) {
  const syncHeight = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el || !cssHeightVar) return;
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(cssHeightVar, `${h}px`);
    },
    [cssHeightVar],
  );

  const mergedRef = React.useCallback(
    (el: HTMLElement | null) => {
      syncHeight(el);
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = el;
    },
    [ref, syncHeight],
  );

  /* Re-sync on resize */
  React.useEffect(() => {
    if (!cssHeightVar) return;
    const handleResize = () => {
      const el = document.querySelector('[data-header-bar]') as HTMLElement | null;
      if (el) {
        const h = el.getBoundingClientRect().height;
        document.documentElement.style.setProperty(cssHeightVar, `${h}px`);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cssHeightVar]);

  return (
    <header
      ref={mergedRef}
      data-header-bar=""
      {...stateAttrs({ component: 'header-bar' })}
      style={{
        ...(blur
          ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }
          : undefined),
        ...style,
      }}
      className={cn('fixed inset-x-0 top-0 z-50 bg-surface-header px-3 py-2', className)}
      {...rest}
    >
      {card ? (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-panel px-3 py-2 shadow-xs',
            cardClassName,
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </header>
  );
});

HeaderBar.displayName = 'HeaderBar';
