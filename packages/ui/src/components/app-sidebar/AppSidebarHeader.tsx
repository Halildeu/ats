import React from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarHeaderProps as AppSidebarHeaderPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Header slot for the AppSidebar compound component. Displays a title,
 * optional subtitle, logo, and action slot (e.g. collapse trigger).
 * Content is hidden in collapsed mode except for the logo and action.
 *
 * @example
 * ```tsx
 * <AppSidebar.Header
 *   title="Design Lab"
 *   subtitle="Component Library"
 *   logo={<Logo />}
 *   action={<AppSidebar.Trigger />}
 * />
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarHeader = React.forwardRef<HTMLDivElement, AppSidebarHeaderPropsBase & AccessControlledProps>(({
  title,
  subtitle,
  logo,
  action,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed } = useSidebar();

  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 px-3 py-4 border-b text-text-primary',
        'border-[var(--border-subtle)]',
        isCollapsed && 'justify-center px-2',
        className,
      )}
    >
      {logo && <span className="shrink-0">{logo}</span>}

      {!isCollapsed && (title || subtitle) && (
        <div className="min-w-0 flex-1">
          {title && (
            <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="truncate text-xs text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
});

AppSidebarHeader.displayName = 'AppSidebar.Header';

/** Props for the AppSidebarHeader component. */
export interface AppSidebarHeaderProps extends AppSidebarHeaderPropsBase {}

/** Ref type for AppSidebarHeader. */
export type AppSidebarHeaderRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarHeader. */
export type AppSidebarHeaderElement = HTMLDivElement;
/** CSS properties type for AppSidebarHeader. */
export type AppSidebarHeaderCSSProperties = React.CSSProperties;
