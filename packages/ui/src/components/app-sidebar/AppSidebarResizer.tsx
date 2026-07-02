import React, { useCallback, useRef } from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarResizerProps as AppSidebarResizerPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Drag-to-resize handle for the AppSidebar. Appears as a thin vertical
 * strip on the right edge of the sidebar when `resizable` is enabled.
 * Uses pointer capture for smooth drag tracking and exposes ARIA
 * separator semantics with value-now/min/max.
 *
 * @example
 * ```tsx
 * <AppSidebar resizable>
 *   <AppSidebar.Resizer />
 * </AppSidebar>
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarResizer = React.forwardRef<HTMLDivElement, AppSidebarResizerPropsBase & AccessControlledProps>(({
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { resize, setWidth, setIsResizing, isCollapsed } = useSidebar();
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!resize || isCollapsed) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      startWidthRef.current = resize.width;
      setIsResizing(true);

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current;
        const next = Math.min(
          resize.maxWidth,
          Math.max(resize.minWidth, startWidthRef.current + delta),
        );
        setWidth(next);
      };

      const onPointerUp = () => {
        setIsResizing(false);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [resize, isCollapsed, setWidth, setIsResizing],
  );

  if (!resize || isCollapsed) return null;

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={resize.width}
      aria-valuemin={resize.minWidth}
      aria-valuemax={resize.maxWidth}
      className={cn(
        'absolute right-0 top-0 z-10 h-full w-1.5 text-text-primary',
        'cursor-col-resize select-none',
        'hover:bg-[color-mix(in_oklab,var(--action-primary)_20%,transparent)]',
        'active:bg-[color-mix(in_oklab,var(--action-primary)_30%,transparent)]',
        'transition-colors duration-(--motion-duration-fast)',
        resize.isResizing && 'bg-[color-mix(in_oklab,var(--action-primary)_30%,transparent)]',
        className,
      )}
      onPointerDown={onPointerDown}
    />
  );
});

AppSidebarResizer.displayName = 'AppSidebar.Resizer';

/** Props for the AppSidebarResizer component. */
export interface AppSidebarResizerProps extends AppSidebarResizerPropsBase {}

/** Ref type for AppSidebarResizer. */
export type AppSidebarResizerRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarResizer. */
export type AppSidebarResizerElement = HTMLDivElement;
/** CSS properties type for AppSidebarResizer. */
export type AppSidebarResizerCSSProperties = React.CSSProperties;
