import type { ReactNode } from 'react';
import type { AccessControlledProps } from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  Sidebar mode                                                       */
/* ------------------------------------------------------------------ */

export type SidebarMode = 'expanded' | 'collapsed';

/* ------------------------------------------------------------------ */
/*  Resize                                                             */
/* ------------------------------------------------------------------ */

export interface SidebarResizeState {
  /** Current sidebar width in pixels. */
  width: number;
  /** Minimum allowed width. @default 200 */
  minWidth: number;
  /** Maximum allowed width. @default 500 */
  maxWidth: number;
  /** Whether the user is currently dragging the resize handle. */
  isResizing: boolean;
}

/* ------------------------------------------------------------------ */
/*  Context value                                                      */
/* ------------------------------------------------------------------ */

export interface SidebarContextValue {
  mode: SidebarMode;
  toggle: () => void;
  expand: () => void;
  collapse: () => void;
  isCollapsed: boolean;
  /** Resize state — only present when `resizable` is enabled. */
  resize: SidebarResizeState | null;
  /** Update width during / after drag. */
  setWidth: (width: number) => void;
  /** Signal that a drag is in progress. */
  setIsResizing: (resizing: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Component props                                                    */
/* ------------------------------------------------------------------ */

export interface AppSidebarProps extends AccessControlledProps {
  /** Initial sidebar mode. @default 'expanded' */
  defaultMode?: SidebarMode;
  /** localStorage key used to persist the sidebar state. */
  storageKey?: string;
  /** Width in pixels when collapsed. @default 56 */
  collapsedWidth?: number;
  /** Width in pixels when expanded. @default 260 */
  expandedWidth?: number;
  /** Enable drag-to-resize. @default false */
  resizable?: boolean;
  /** localStorage key for persisting width. @default 'sidebar-width' */
  resizeStorageKey?: string;
  /** Minimum width when resizable. @default 200 */
  minWidth?: number;
  /** Maximum width when resizable. @default 500 */
  maxWidth?: number;
  /** Additional CSS class for the root element. */
  className?: string;
  /** Sidebar content — use AppSidebar.Header, Nav, Footer, etc. */
  children: ReactNode;
}

export interface AppSidebarHeaderProps {
  /** Primary title shown in the header. */
  title?: string;
  /** Secondary text below the title. */
  subtitle?: string;
  /** Logo element rendered before the title. */
  logo?: ReactNode;
  /** Action slot, e.g. a collapse toggle button. */
  action?: ReactNode;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarNavProps {
  /** NavItem or Section children. */
  children: ReactNode;
  /** Enable keyboard navigation (arrow keys, j/k). @default false */
  enableKeyboardNav?: boolean;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarNavItemProps {
  /** Icon rendered before the label. */
  icon?: ReactNode;
  /** Text label — always required for accessibility. */
  label: string;
  /** Navigation target. Renders an anchor when provided. */
  href?: string;
  /** Marks the item as currently active. */
  active?: boolean;
  /** Badge element rendered after the label. */
  badge?: ReactNode;
  /** Disables the item. */
  disabled?: boolean;
  /** Click handler. */
  onClick?: () => void;
  /** Tooltip text shown when the sidebar is collapsed. */
  tooltip?: string;
  /** Nested nav items (up to 3 levels deep). */
  children?: ReactNode;
  /** Nesting depth (0-3). Auto-calculated when omitted. */
  depth?: number;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarSectionProps {
  /** Section heading text — hidden when collapsed. */
  title?: string;
  /** Whether the section can be collapsed. */
  collapsible?: boolean;
  /** Initial open state when collapsible. @default true */
  defaultOpen?: boolean;
  /** Section content — typically NavItem elements. */
  children: ReactNode;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarGroupProps {
  /** Group heading label. */
  label: string;
  /** Icon rendered before the label. */
  icon?: ReactNode;
  /** Whether the group can be collapsed. @default true */
  collapsible?: boolean;
  /** Initial open state. @default true */
  defaultOpen?: boolean;
  /** Action slot rendered at the right side of the header. */
  action?: ReactNode;
  /** Group content — typically NavItem elements. */
  children: ReactNode;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarTriggerProps {
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarResizerProps {
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarSeparatorProps {
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarFooterProps {
  /** Footer content. */
  children: ReactNode;
  /** Additional CSS class. */
  className?: string;
}

export interface AppSidebarSearchProps {
  /** Controlled value. */
  value?: string;
  /** Change handler. */
  onChange?: (value: string) => void;
  /** Placeholder text. */
  placeholder?: string;
  /** Keyboard shortcut hint, e.g. "⌘K". */
  shortcut?: string;
  /** Additional CSS class. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Filter hook                                                        */
/* ------------------------------------------------------------------ */

export interface SidebarFilterResult {
  /** Current debounced search term. */
  query: string;
  /** Set raw (un-debounced) search term. */
  setQuery: (value: string) => void;
  /** Clear the search (also triggered by Escape). */
  clear: () => void;
  /** Check if a label matches the current query. Returns match indices or null. */
  match: (label: string) => [number, number][] | null;
  /** Whether a search is active. */
  isFiltering: boolean;
}
