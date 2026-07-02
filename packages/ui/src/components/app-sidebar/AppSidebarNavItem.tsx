import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarNavItemProps as AppSidebarNavItemPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Individual navigation item within the AppSidebar. Renders as an anchor when
 * `href` is provided, otherwise a button. Supports active state with
 * `aria-current="page"`, disabled state, badges, tooltips in collapsed mode,
 * and nested children up to 3 levels deep.
 *
 * @example
 * ```tsx
 * <AppSidebar.NavItem
 *   icon={<HomeIcon />}
 *   label="Dashboard"
 *   href="/dashboard"
 *   active
 * />
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarNavItem = React.forwardRef<HTMLDivElement, AppSidebarNavItemPropsBase & AccessControlledProps>(({
  icon,
  label,
  href,
  active = false,
  badge,
  disabled = false,
  onClick,
  tooltip,
  children,
  depth = 0,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed } = useSidebar();
  const itemRef = useRef<HTMLElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

  /* Auto-scroll into view when item becomes active */
  useEffect(() => {
    if (active && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [active]);

  const showTooltip = useCallback(() => {
    if (!isCollapsed || !itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  }, [isCollapsed]);

  const hideTooltip = useCallback(() => setTooltipPos(null), []);

  /* Indentation based on depth (0-3) */
  const depthPadding = isCollapsed ? 'px-2' : depth === 0 ? 'px-3' : depth === 1 ? 'pl-8 pr-3' : depth === 2 ? 'pl-12 pr-3' : 'pl-16 pr-3';

  const sharedClasses = cn(
    'group relative flex items-center gap-3 rounded-md py-2 text-sm cursor-pointer',
    'transition-all duration-(--motion-duration-medium) outline-hidden',
    'focus-visible:ring-2 focus-visible:ring-[var(--action-primary)]',
    depthPadding,
    active
      ? 'bg-[color-mix(in_oklab,var(--action-primary)_10%,transparent)] text-[var(--action-primary)] font-medium'
      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]',
    disabled && 'pointer-events-none opacity-40',
    isCollapsed && 'justify-center',
    className,
  );

  /* Active indicator — 3px left border */
  const activeIndicator = active && !isCollapsed && (
    <span
      className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-[var(--action-primary)]"
      aria-hidden="true"
    />
  );

  const content = (
    <>
      {activeIndicator}
      {icon && <span className="flex shrink-0 items-center justify-center [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
      {!isCollapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!isCollapsed && badge && <span className="shrink-0">{badge}</span>}

      {/* Tooltip shown when collapsed — fixed position to escape overflow clip */}
      {isCollapsed && tooltipPos && (
        <span
          role="tooltip"
          style={{ position: 'fixed', top: tooltipPos.top, left: tooltipPos.left, transform: 'translateY(-50%)' }}
          className={cn(
            'pointer-events-none z-[9999]',
            'whitespace-nowrap rounded-md px-2 py-1 text-xs',
            'bg-[var(--text-primary)] text-[var(--surface-default)]',
          )}
        >
          {tooltip ?? label}
        </span>
      )}
    </>
  );

  const element = href && !disabled ? (
    <a
      ref={itemRef as React.Ref<HTMLAnchorElement>}
      href={href}
      data-sidebar-item=""
      className={sharedClasses}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {content}
    </a>
  ) : (
    <button
      ref={itemRef as React.Ref<HTMLButtonElement>}
      type="button"
      data-sidebar-item=""
      className={cn(sharedClasses, 'w-full text-left')}
      onClick={disabled ? undefined : onClick}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {content}
    </button>
  );

  /* Nested children */
  if (children && !isCollapsed) {
    return (
      <div ref={ref}>
        {element}
        <div className="space-y-0.5">
          {React.Children.map(children, (child) => {
            if (React.isValidElement<AppSidebarNavItemProps>(child)) {
              return React.cloneElement(child, {
                depth: Math.min((depth ?? 0) + 1, 3) as number,
              });
            }
            return child;
          })}
        </div>
      </div>
    );
  }

  return <div ref={ref}>{element}</div>;
});

AppSidebarNavItem.displayName = 'AppSidebar.NavItem';

/** Props for the AppSidebarNavItem component. */
export interface AppSidebarNavItemProps extends AppSidebarNavItemPropsBase {}

/** Ref type for AppSidebarNavItem. */
export type AppSidebarNavItemRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarNavItem. */
export type AppSidebarNavItemElement = HTMLDivElement;
/** CSS properties type for AppSidebarNavItem. */
export type AppSidebarNavItemCSSProperties = React.CSSProperties;
