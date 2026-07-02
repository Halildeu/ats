import type { ReactNode } from 'react';
import type { AppSidebarProps } from '../../components/app-sidebar/types';
import type { StatusIndicatorStatus } from '../../primitives/status-indicator/StatusIndicator';

/* ------------------------------------------------------------------ */
/*  ShellSidebar — Types                                               */
/* ------------------------------------------------------------------ */

/** A single navigation destination. */
export interface ShellSidebarNavItem {
  /** Unique identifier. */
  key: string;
  /** Display label. */
  label: string;
  /** Icon element rendered before the label. */
  icon: ReactNode;
  /** Navigation target URL. */
  href?: string;
  /** Disables this item. */
  disabled?: boolean;
  /** Badge element rendered after the label. */
  badge?: ReactNode;
  /** Test ID for automated testing. */
  dataTestId?: string;
}

/** A folder / section in the sidebar submenu. */
export interface ShellSidebarFolderItem {
  key: string;
  label: string;
  count?: number;
  dataTestId?: string;
  onClick?: () => void;
}

/** A footer action button configuration. */
export interface ShellSidebarFooterActionItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  badge?: ReactNode;
  active?: boolean;
  dataTestId?: string;
}

/** Status indicator configuration. */
export interface ShellSidebarStatusConfig {
  /** Current status. */
  status: StatusIndicatorStatus;
  /** Custom label override. */
  label?: string;
  /** Animate pulse ring. */
  pulse?: boolean;
}

/** Props for the ShellSidebar pattern. */
export interface ShellSidebarProps
  extends Pick<
    AppSidebarProps,
    | 'collapsedWidth'
    | 'expandedWidth'
    | 'resizable'
    | 'resizeStorageKey'
    | 'minWidth'
    | 'maxWidth'
    | 'className'
  > {
  /* ---- Navigation ---- */

  /** Navigation items. */
  navItems: ShellSidebarNavItem[];
  /** Currently active nav key. */
  activeKey?: string;
  /** Called when a nav item is clicked. */
  onNavigate?: (key: string, item: ShellSidebarNavItem) => void;

  /* ---- Branding ---- */

  /** Brand title shown in the header. */
  brandTitle?: string;
  /** Secondary line below brand title. */
  brandSubtitle?: string;
  /** Brand logo element. */
  brandLogo?: ReactNode;

  /* ---- Search ---- */

  /** Called when the search trigger is clicked. */
  onSearch?: () => void;
  /** Search placeholder text. @default "Search…" */
  searchPlaceholder?: string;
  /** Keyboard shortcut hint. */
  searchShortcut?: string;

  /* ---- Folders ---- */

  /** Folder items shown as a collapsible group. */
  folderItems?: ShellSidebarFolderItem[];
  /** Folder group label. @default "Folders" */
  foldersLabel?: string;
  /** Folder group icon. */
  foldersIcon?: ReactNode;

  /* ---- Footer ---- */

  /** Footer action buttons. */
  footerActions?: ShellSidebarFooterActionItem[];
  /** Show fullscreen toggle in footer. @default true */
  showFullscreenToggle?: boolean;
  /** Status indicator config for footer. */
  statusIndicator?: ShellSidebarStatusConfig;
  /** Custom footer content rendered after default actions. */
  renderFooter?: (ctx: { isCollapsed: boolean }) => ReactNode;

  /* ---- Persistence ---- */

  /** localStorage key for expand/collapse state. */
  storageKey?: string;
  /** Default sidebar mode. @default "expanded" */
  defaultMode?: 'expanded' | 'collapsed';
  /**
   * CSS variable name set on `document.documentElement` to sync layout width.
   * Only activated when provided. Example: `"--shell-sidebar-w"`.
   */
  cssWidthVar?: string;
}
