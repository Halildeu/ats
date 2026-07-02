import React, { useCallback, useEffect, useState } from 'react';
import { AppSidebar, useSidebar } from '../../components/app-sidebar';
import { CommandPaletteTrigger } from '../../primitives/command-palette-trigger';
import { FullscreenToggle } from '../../primitives/fullscreen-toggle';
import type { ShellSidebarProps, ShellSidebarNavItem, ShellSidebarFolderItem } from './types';

/* ------------------------------------------------------------------ */
/*  ShellSidebar — Ready-made app shell sidebar pattern                */
/*                                                                     */
/*  Composes AppSidebar + primitives into a full application sidebar    */
/*  with branding, search, navigation, folders, footer actions, and    */
/*  status indicator.                                                  */
/* ------------------------------------------------------------------ */

/* ---- Inline folder icon (no lucide dependency) ---- */

const FolderIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ---- Inner content (needs sidebar context) ---- */

type ShellSidebarInnerProps = Omit<
  ShellSidebarProps,
  | 'storageKey'
  | 'defaultMode'
  | 'resizable'
  | 'resizeStorageKey'
  | 'minWidth'
  | 'maxWidth'
  | 'className'
>;

const ShellSidebarInner: React.FC<ShellSidebarInnerProps> = ({
  navItems,
  activeKey,
  onNavigate,
  brandTitle,
  brandSubtitle,
  brandLogo: _brandLogo,
  onSearch,
  searchPlaceholder = 'Search\u2026',
  searchShortcut,
  folderItems,
  foldersLabel = 'Folders',
  foldersIcon,
  footerActions,
  showFullscreenToggle = true,
  statusIndicator,
  renderFooter,
  cssWidthVar,
  collapsedWidth = 56,
  expandedWidth = 260,
}) => {
  const { isCollapsed, expand } = useSidebar();
  const [foldersOpen, setFoldersOpen] = useState(false);

  /* Sync CSS variable for layout width — deterministic, no MutationObserver */
  useEffect(() => {
    if (!cssWidthVar) return;
    const w = isCollapsed ? `${collapsedWidth}px` : `${expandedWidth}px`;
    document.documentElement.style.setProperty(cssWidthVar, w);
  }, [cssWidthVar, isCollapsed, collapsedWidth, expandedWidth]);

  const handleNavItemClick = useCallback(
    (item: ShellSidebarNavItem) => {
      onNavigate?.(item.key, item);
    },
    [onNavigate],
  );

  const handleToggleFolders = useCallback(() => {
    if (isCollapsed) {
      expand();
      setFoldersOpen(true);
      return;
    }
    setFoldersOpen((prev) => !prev);
  }, [isCollapsed, expand]);

  return (
    <div className="flex h-full flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-2 px-3 py-3">
        <AppSidebar.Trigger />
        {!isCollapsed && (brandTitle || brandSubtitle) && (
          <div className="min-w-0 flex-1">
            {brandTitle && (
              <div className="truncate text-sm font-semibold text-text-primary">{brandTitle}</div>
            )}
            {brandSubtitle && (
              <div className="truncate text-[11px] text-text-subtle">{brandSubtitle}</div>
            )}
          </div>
        )}
      </div>

      {/* ---- Search ---- */}
      {onSearch && (
        <div className="px-3 py-1">
          <CommandPaletteTrigger
            onClick={onSearch}
            placeholder={searchPlaceholder}
            shortcut={searchShortcut}
            compact={isCollapsed}
          />
        </div>
      )}

      {/* ---- Navigation ---- */}
      <AppSidebar.Nav className="mt-2 flex-1 overflow-auto px-2 pb-2">
        {navItems.map((item) => (
          <AppSidebar.NavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={item.key === activeKey}
            disabled={item.disabled}
            badge={item.badge}
            onClick={() => handleNavItemClick(item)}
            className={item.dataTestId ? '' : undefined}
          />
        ))}

        {/* ---- Folders group ---- */}
        {folderItems && folderItems.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleToggleFolders}
              className={`flex w-full items-center gap-2 rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-left text-sm font-semibold text-text-primary shadow-xs hover:bg-surface-muted ${
                isCollapsed ? 'justify-center px-2' : ''
              }`}
              title={foldersLabel}
            >
              {foldersIcon ?? <FolderIcon className="h-[18px] w-[18px]" />}
              {!isCollapsed && (
                <>
                  <span className="flex-1">{foldersLabel}</span>
                  {foldersOpen ? (
                    <ChevronDownIcon className="h-[18px] w-[18px]" />
                  ) : (
                    <ChevronRightIcon className="h-[18px] w-[18px]" />
                  )}
                </>
              )}
            </button>

            {foldersOpen && !isCollapsed && <FolderList items={folderItems} />}
          </div>
        )}
      </AppSidebar.Nav>

      {/* ---- Footer ---- */}
      <AppSidebar.Footer>
        <div className="flex flex-col gap-1.5">
          {footerActions?.map((action) => (
            <AppSidebar.FooterAction
              key={action.key}
              icon={action.icon}
              label={action.label}
              onClick={action.onClick}
              href={action.href}
              disabled={action.disabled}
              badge={action.badge}
              active={action.active}
              data-testid={action.dataTestId}
            />
          ))}

          {showFullscreenToggle && (
            <div className={isCollapsed ? 'flex justify-center' : ''}>
              <FullscreenToggle showLabel={!isCollapsed} variant="outline" className="w-full" />
            </div>
          )}

          {statusIndicator && (
            <AppSidebar.FooterStatus
              status={statusIndicator.status}
              label={statusIndicator.label}
              pulse={statusIndicator.pulse}
            />
          )}

          {renderFooter?.({ isCollapsed })}
        </div>
      </AppSidebar.Footer>
    </div>
  );
};

/* ---- Folder list sub-component ---- */

const FolderList: React.FC<{ items: ShellSidebarFolderItem[] }> = ({ items }) => (
  <div className="mt-1.5 flex flex-col gap-0.5 pl-2">
    {items.map((item) => (
      <button
        key={item.key}
        type="button"
        onClick={item.onClick}
        data-testid={item.dataTestId}
        className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-muted"
      >
        <span>{item.label}</span>
        {item.count != null && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
            {item.count}
          </span>
        )}
      </button>
    ))}
  </div>
);

/* ---- Public component ---- */

/**
 * ShellSidebar is a ready-made app shell sidebar pattern that composes
 * AppSidebar with branding, search, navigation, folders, footer actions,
 * fullscreen toggle, and status indicator.
 *
 * @example
 * ```tsx
 * <ShellSidebar
 *   navItems={[{ key: 'home', label: 'Home', icon: <HomeIcon /> }]}
 *   activeKey="home"
 *   onNavigate={(key) => navigate(items[key].href)}
 *   brandTitle="Platform"
 *   onSearch={openCommandPalette}
 *   searchShortcut="Ctrl+K"
 *   statusIndicator={{ status: 'online' }}
 *   storageKey="shell.sidebar.mode"
 *   cssWidthVar="--shell-sidebar-w"
 * />
 * ```
 *
 * @since 1.1.0
 * @see AppSidebar
 */
export const ShellSidebar: React.FC<ShellSidebarProps> = ({
  /* AppSidebar root props */
  storageKey,
  defaultMode = 'expanded',
  collapsedWidth,
  expandedWidth,
  resizable,
  resizeStorageKey,
  minWidth,
  maxWidth,
  className,
  /* Inner props */
  ...innerProps
}) => (
  <AppSidebar
    storageKey={storageKey}
    defaultMode={defaultMode}
    collapsedWidth={collapsedWidth}
    expandedWidth={expandedWidth}
    resizable={resizable}
    resizeStorageKey={resizeStorageKey}
    minWidth={minWidth}
    maxWidth={maxWidth}
    className={className}
  >
    <ShellSidebarInner
      collapsedWidth={collapsedWidth}
      expandedWidth={expandedWidth}
      {...innerProps}
    />
  </AppSidebar>
);

ShellSidebar.displayName = 'ShellSidebar';
