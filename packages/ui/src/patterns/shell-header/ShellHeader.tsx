import React, { useCallback, useMemo } from 'react';
import { HeaderBar } from '../../primitives/header-bar';
import {
  MenuBar,
  createMenuBarItemsFromRoutes,
  createMenuBarPreset,
} from '../../components/menu-bar';
import type { ShellHeaderProps, ShellHeaderNavItem } from './types';

/* ------------------------------------------------------------------ */
/*  ShellHeader — Ready-made app shell header pattern                  */
/*                                                                     */
/*  Composes HeaderBar + MenuBar into a full application header with    */
/*  navigation, overflow handling, and configurable slots.             */
/* ------------------------------------------------------------------ */

const menuBarPreset = createMenuBarPreset('ghost_utility');

const toTestIdSuffix = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Resolve active key from current path — longest prefix match. */
function resolveActiveKey(items: ShellHeaderNavItem[], currentPath: string): string | null {
  const normalizedPath = currentPath || '/';
  const sorted = [...items].sort((a, b) => b.key.length - a.key.length);
  const match = sorted.find((item) =>
    item.key === '/' ? normalizedPath === '/' : normalizedPath.startsWith(item.key),
  );
  return match?.key ?? (normalizedPath === '/' ? '/' : null);
}

/**
 * ShellHeader is a ready-made app header pattern that composes HeaderBar
 * with a MenuBar featuring built-in collapse-to-more overflow, priority-based
 * item ranking, and active item preservation.
 *
 * @example
 * ```tsx
 * <ShellHeader
 *   navItems={[
 *     { key: '/', path: '/', label: 'Home' },
 *     { key: '/reports', path: '/reports', label: 'Reports' },
 *   ]}
 *   currentPath={location.pathname}
 *   onNavigate={(path) => navigate(path)}
 *   startSlot={<AppLauncherButton />}
 *   endSlot={<UserMenu />}
 *   cssHeightVar="--shell-header-h"
 * />
 * ```
 *
 * @since 1.1.0
 * @see HeaderBar
 * @see MenuBar
 */
export const ShellHeader: React.FC<ShellHeaderProps> = ({
  navItems,
  currentPath,
  onNavigate,
  startSlot,
  endSlot,
  menuUtility,
  navAriaLabel = 'Primary navigation',
  overflowLabel = 'More',
  itemTestIdPrefix = 'shell-header-nav-item',
  cssHeightVar,
  blur = true,
  className,
}) => {
  const activeKey = useMemo(() => resolveActiveKey(navItems, currentPath), [currentPath, navItems]);

  const menuBarItems = useMemo(
    () =>
      createMenuBarItemsFromRoutes(
        navItems.map((item) => ({
          value: item.key,
          label: item.label,
          href: item.path,
          current: item.key === activeKey,
          dataTestId: `${itemTestIdPrefix}-${toTestIdSuffix(item.key)}`,
        })) as Parameters<typeof createMenuBarItemsFromRoutes>[0],
        { currentValue: activeKey ?? undefined },
      ).map((item) => ({
        ...item,
        itemClassName: 'min-h-0! rounded-full! px-3! py-1! text-xs! font-medium!',
        activeClassName:
          'border-[var(--accent-primary-hover)]! bg-[var(--accent-primary)]! text-[var(--action-primary-text)]! shadow-xs!',
      })),
    [activeKey, itemTestIdPrefix, navItems],
  );

  const handleMenuItemClick = useCallback(
    (value: string, event: React.MouseEvent<HTMLElement>) => {
      const targetItem = navItems.find((item) => item.key === value);
      if (!targetItem) return;
      event.preventDefault();
      onNavigate?.(targetItem.path, targetItem);
    },
    [onNavigate, navItems],
  );

  return (
    <HeaderBar cssHeightVar={cssHeightVar} blur={blur} className={className}>
      {/* Start slot + navigation */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        {startSlot}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <MenuBar
            {...menuBarPreset}
            ariaLabel={navAriaLabel}
            labelVisibility="always"
            value={activeKey ?? undefined}
            items={menuBarItems}
            overflowBehavior="collapse-to-more"
            overflowLabel={overflowLabel}
            onItemClick={handleMenuItemClick}
            endSlot={menuUtility}
            className="min-w-0"
          />
        </div>
      </div>

      {/* End slot */}
      {endSlot && <div className="flex shrink-0 items-center gap-3">{endSlot}</div>}
    </HeaderBar>
  );
};

ShellHeader.displayName = 'ShellHeader';
