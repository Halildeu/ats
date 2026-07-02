/* ------------------------------------------------------------------ */
/*  PortalProvider — Global portal configuration context               */
/*                                                                     */
/*  Allows applications to configure portal behavior for all overlay   */
/*  components in a subtree. Components using usePortal can read       */
/*  defaults from this context via usePortalConfig().                   */
/*                                                                     */
/*  Faz 2.9 — Standardized Portal                                     */
/* ------------------------------------------------------------------ */

import React, { createContext, useContext } from "react";

export interface PortalConfig {
  /** Default container element for all portals in the subtree. */
  container?: HTMLElement | null;
  /** Whether portals are enabled globally. When false, overlays render inline. */
  enabled?: boolean;
  /** Default z-index base for portal content. */
  zIndex?: number;
  /** Unique identifier prefix for portal container elements. */
  idPrefix?: string;
  /** Whether to lock body scroll when a portal is active. */
  lockScroll?: boolean;
  /** Callback fired when a portal is mounted into the container. */
  onPortalMount?: (portalId: string) => void;
}

const PortalContext = createContext<PortalConfig>({});

/**
 * Provides global portal configuration for all overlay components
 * in the subtree.
 *
 * @example
 * ```tsx
 * // Render all portals into a custom container
 * const portalRoot = document.getElementById("portal-root");
 *
 * function App() {
 *   return (
 *     <PortalProvider container={portalRoot}>
 *       <MyPage />
 *     </PortalProvider>
 *   );
 * }
 *
 * // Disable portals globally (e.g., for SSR or testing)
 * <PortalProvider enabled={false}>
 *   <MyPage />
 * </PortalProvider>
 * ```
 */
/** Props for the PortalProvider component. */
export interface PortalProviderProps extends PortalConfig { children: React.ReactNode }

export const PortalProvider = React.forwardRef<HTMLDivElement, PortalProviderProps>(({
  children,
  ...config
}, _ref) => (
  <PortalContext.Provider value={config}>{children}</PortalContext.Provider>
));

PortalProvider.displayName = "PortalProvider";

/**
 * Returns the current portal configuration from the nearest PortalProvider.
 * Falls back to empty config (all defaults) if no provider exists.
 */
export function usePortalConfig(): PortalConfig {
  return useContext(PortalContext);
}

/** Ref type for PortalProvider. */
export type PortalProviderRef = React.Ref<HTMLDivElement>;
/** Element type for PortalProvider. */
export type PortalProviderElement = HTMLDivElement;
