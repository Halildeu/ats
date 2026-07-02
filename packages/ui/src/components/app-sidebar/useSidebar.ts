import { createContext, useContext } from 'react';
import type { SidebarContextValue } from './types';

export const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Access sidebar state and controls from any descendant of `<AppSidebar>`.
 *
 * @example
 * const { isCollapsed, toggle } = useSidebar();
 */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within an <AppSidebar> provider.');
  }
  return ctx;
}
