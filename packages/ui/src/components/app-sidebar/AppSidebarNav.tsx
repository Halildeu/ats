import React from 'react';
import { cn } from '../../utils/cn';
import type { AppSidebarNavProps as AppSidebarNavPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Navigation container slot for the AppSidebar compound component.
 * Renders a `<nav role="navigation">` element with vertical overflow scrolling.
 * Contains NavItem, Section, and Group children.
 *
 * @example
 * ```tsx
 * <AppSidebar.Nav>
 *   <AppSidebar.NavItem icon={<HomeIcon />} label="Home" />
 * </AppSidebar.Nav>
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarNav = React.forwardRef<HTMLElement, AppSidebarNavPropsBase & AccessControlledProps>(({
  children,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  return (
    <nav
      ref={ref}
      className={cn('flex-1 overflow-y-auto px-2 py-2 text-text-primary', className)}
      role="navigation"
    >
      {children}
    </nav>
  );
});

AppSidebarNav.displayName = 'AppSidebar.Nav';

/** Props for the AppSidebarNav component. */
export interface AppSidebarNavProps extends AppSidebarNavPropsBase {}

/** Ref type for AppSidebarNav. */
export type AppSidebarNavRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarNav. */
export type AppSidebarNavElement = HTMLDivElement;
/** CSS properties type for AppSidebarNav. */
export type AppSidebarNavCSSProperties = React.CSSProperties;
