import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type _AccessControlledProps,
} from '../../internal/access-controller';
import { SidebarContext } from './useSidebar';
import { AppSidebarHeader } from './AppSidebarHeader';
import { AppSidebarNav } from './AppSidebarNav';
import { AppSidebarNavItem } from './AppSidebarNavItem';
import { AppSidebarSection } from './AppSidebarSection';
import { AppSidebarGroup } from './AppSidebarGroup';
import { AppSidebarFooter } from './AppSidebarFooter';
import { AppSidebarSearch } from './AppSidebarSearch';
import { AppSidebarTrigger } from './AppSidebarTrigger';
import { AppSidebarResizer } from './AppSidebarResizer';
import { AppSidebarSeparator } from './AppSidebarSeparator';
import { AppSidebarFooterAction } from './AppSidebarFooterAction';
import { AppSidebarFooterStatus } from './AppSidebarFooterStatus';
import { useAppSidebarResize } from './hooks/useAppSidebarResize';
import type { AppSidebarProps as AppSidebarPropsBase, SidebarMode, SidebarContextValue, SidebarResizeState } from './types';

/** Props for the AppSidebar compound component. */
export interface AppSidebarProps extends AppSidebarPropsBase {}

/** Sidebar display mode. */
export type AppSidebarMode = SidebarMode;
/** Sidebar context value shape. */
export type AppSidebarContextValue = SidebarContextValue;
/** Sidebar resize state shape. */
export type AppSidebarResizeState = SidebarResizeState;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MOBILE_BREAKPOINT = 768;

function readStoredMode(key: string | undefined): SidebarMode | null {
  if (!key) return null;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === 'expanded' || raw === 'collapsed') return raw;
  } catch {
    /* SSR or restricted storage — ignore */
  }
  return null;
}

function writeStoredMode(key: string | undefined, mode: SidebarMode): void {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, mode);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  AppSidebar root                                                    */
/* ------------------------------------------------------------------ */

/**
 * Composable, collapsible sidebar compound component with header, nav,
 * search, groups, sections, resizer, and footer slots. Persists state
 * to localStorage, auto-collapses on mobile, and supports keyboard
 * navigation, drag-to-resize, and nested nav items up to 3 levels.
 *
 * @example
 * ```tsx
 * <AppSidebar defaultMode="expanded" storageKey="my-sidebar">
 *   <AppSidebar.Header title="App" action={<AppSidebar.Trigger />} />
 *   <AppSidebar.Nav>
 *     <AppSidebar.NavItem icon={<HomeIcon />} label="Home" active />
 *   </AppSidebar.Nav>
 *   <AppSidebar.Footer><span>v1.0</span></AppSidebar.Footer>
 * </AppSidebar>
 * ```
 *
 * @since 1.0.0
 * @see useSidebar
 */
const AppSidebarRoot = React.forwardRef<HTMLElement, AppSidebarPropsBase>(({
  defaultMode = 'expanded',
  storageKey,
  collapsedWidth = 56,
  expandedWidth = 260,
  resizable = false,
  resizeStorageKey = 'sidebar-width',
  minWidth = 200,
  maxWidth = 500,
  access,
  accessReason,
  className,
  children,
}, ref) => {
  const { state: accessState, isHidden } = resolveAccessState(access);

  /* Access control — hidden guard */
  if (isHidden) return null;
  const [mode, setMode] = useState<SidebarMode>(
    () => readStoredMode(storageKey) ?? defaultMode,
  );

  /* Resize --------------------------------------------------------- */
  const {
    resizeState,
    setWidth,
    setIsResizing,
  } = useAppSidebarResize({
    defaultWidth: expandedWidth,
    minWidth,
    maxWidth,
    storageKey: resizeStorageKey,
  });

  /* Persist -------------------------------------------------------- */
  useEffect(() => {
    writeStoredMode(storageKey, mode);
  }, [storageKey, mode]);

  /* Responsive auto-collapse --------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setMode('collapsed');
    };

    // Check initial state
    handler(mql);

    mql.addEventListener('change', handler as (e: MediaQueryListEvent) => void);
    return () =>
      mql.removeEventListener('change', handler as (e: MediaQueryListEvent) => void);
  }, []);

  /* Keyboard — Escape to collapse ---------------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'expanded') {
        setMode('collapsed');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  /* Context value -------------------------------------------------- */
  const toggle = useCallback(
    () =>
      setMode((prev) => {
        const next = prev === 'expanded' ? 'collapsed' : 'expanded';
        writeStoredMode(storageKey, next);
        return next;
      }),
    [storageKey],
  );
  const expand = useCallback(() => setMode('expanded'), []);
  const collapse = useCallback(() => setMode('collapsed'), []);

  const ctx = useMemo(
    () => ({
      mode,
      toggle,
      expand,
      collapse,
      isCollapsed: mode === 'collapsed',
      resize: resizable ? resizeState : null,
      setWidth,
      setIsResizing,
    }),
    [mode, toggle, expand, collapse, resizable, resizeState, setWidth, setIsResizing],
  );

  /* Compute width -------------------------------------------------- */
  const width =
    mode === 'collapsed'
      ? collapsedWidth
      : resizable
        ? resizeState.width
        : expandedWidth;

  return (
    <SidebarContext.Provider value={ctx}>
      <aside
        ref={ref}
        data-sidebar=""
        data-state={mode}
        data-access-state={accessState}
        aria-label="Sidebar"
        title={accessReason}
        style={{ width: width > 2000 ? '100%' : width }}
        className={cn(
          'relative flex h-full flex-col',
          'bg-[var(--surface-default)] bg-surface-default text-text-primary border-r border-[var(--border-subtle)]',
          resizeState.isResizing ? '' : 'transition-all duration-(--motion-duration-medium)',
          accessStyles(accessState),
          className,
        )}
      >
        {children}
      </aside>
    </SidebarContext.Provider>
  );
});

AppSidebarRoot.displayName = 'AppSidebar';

/* ------------------------------------------------------------------ */
/*  Compound component assembly                                        */
/* ------------------------------------------------------------------ */

type CompoundSidebar = typeof AppSidebarRoot & {
  Header: typeof AppSidebarHeader;
  Nav: typeof AppSidebarNav;
  NavItem: typeof AppSidebarNavItem;
  Section: typeof AppSidebarSection;
  Group: typeof AppSidebarGroup;
  Footer: typeof AppSidebarFooter;
  FooterAction: typeof AppSidebarFooterAction;
  FooterStatus: typeof AppSidebarFooterStatus;
  Search: typeof AppSidebarSearch;
  Trigger: typeof AppSidebarTrigger;
  Resizer: typeof AppSidebarResizer;
  Separator: typeof AppSidebarSeparator;
};

export const AppSidebar = AppSidebarRoot as CompoundSidebar;
AppSidebar.Header = AppSidebarHeader;
AppSidebar.Nav = AppSidebarNav;
AppSidebar.NavItem = AppSidebarNavItem;
AppSidebar.Section = AppSidebarSection;
AppSidebar.Group = AppSidebarGroup;
AppSidebar.Footer = AppSidebarFooter;
AppSidebar.FooterAction = AppSidebarFooterAction;
AppSidebar.FooterStatus = AppSidebarFooterStatus;
AppSidebar.Search = AppSidebarSearch;
AppSidebar.Trigger = AppSidebarTrigger;
AppSidebar.Resizer = AppSidebarResizer;
AppSidebar.Separator = AppSidebarSeparator;
