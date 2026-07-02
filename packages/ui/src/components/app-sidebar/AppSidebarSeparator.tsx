import React from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarSeparatorProps as AppSidebarSeparatorPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Visual separator line for the AppSidebar navigation. Renders a horizontal
 * rule with context-aware margins that adjust for collapsed mode.
 *
 * @example
 * ```tsx
 * <AppSidebar.Nav>
 *   <AppSidebar.NavItem label="Home" />
 *   <AppSidebar.Separator />
 *   <AppSidebar.NavItem label="Settings" />
 * </AppSidebar.Nav>
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarSeparator = React.forwardRef<HTMLHRElement, AppSidebarSeparatorPropsBase & AccessControlledProps>(({
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed } = useSidebar();

  return (
    <hr
      ref={ref}
      className={cn(
        'border-t border-[var(--border-subtle)] border-border-subtle text-text-primary',
        isCollapsed ? 'mx-2 my-1' : 'mx-3 my-2',
        className,
      )}
    />
  );
});

AppSidebarSeparator.displayName = 'AppSidebar.Separator';

/** Props for the AppSidebarSeparator component. */
export interface AppSidebarSeparatorProps extends AppSidebarSeparatorPropsBase {}

/** Ref type for AppSidebarSeparator. */
export type AppSidebarSeparatorRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarSeparator. */
export type AppSidebarSeparatorElement = HTMLDivElement;
/** CSS properties type for AppSidebarSeparator. */
export type AppSidebarSeparatorCSSProperties = React.CSSProperties;
