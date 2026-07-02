import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  ShellHeader — Types                                                */
/* ------------------------------------------------------------------ */

/** A navigation item in the header menu bar. */
export interface ShellHeaderNavItem {
  /** Unique identifier (also used for route matching). */
  key: string;
  /** Navigation target URL. */
  path: string;
  /** Display label. */
  label: ReactNode;
}

/** Props for the ShellHeader pattern. */
export interface ShellHeaderProps {
  /* ---- Navigation ---- */

  /** Navigation items rendered in the MenuBar. */
  navItems: ShellHeaderNavItem[];
  /** Current active route path for active state resolution. */
  currentPath: string;
  /** Called when a nav item is clicked. */
  onNavigate?: (path: string, item: ShellHeaderNavItem) => void;

  /* ---- Slots ---- */

  /** Start slot — rendered before the navigation. E.g. app launcher button. */
  startSlot?: ReactNode;
  /** End slot — rendered after the navigation. E.g. language, theme, notifications, user menu. */
  endSlot?: ReactNode;
  /** Utility slot passed to MenuBar's endSlot — e.g. design lab menu. */
  menuUtility?: ReactNode;

  /* ---- Labels ---- */

  /** Accessible label for the nav MenuBar. @default "Primary navigation" */
  navAriaLabel?: string;
  /** Label for the overflow "more" button. @default "More" */
  overflowLabel?: string;
  /** Test ID prefix for nav items. @default "shell-header-nav-item" */
  itemTestIdPrefix?: string;

  /* ---- Layout ---- */

  /** CSS variable name set on documentElement for header height sync. */
  cssHeightVar?: string;
  /** Enable backdrop blur. @default true */
  blur?: boolean;

  className?: string;
}
