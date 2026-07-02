import React from 'react';
import {
  resolveAccessState,
  _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import {
  OverlaySurface,
  premiumOverlayPanelClassName,
  premiumOverlayCloseButtonClassName,
  type OverlayCloseReason,
} from '../../internal/OverlaySurface';
import { NotificationPanel, type NotificationPanelProps } from './NotificationPanel';

/* ------------------------------------------------------------------ */
/*  NotificationDrawer                                                  */
/* ------------------------------------------------------------------ */

/** Props for the NotificationDrawer component.
 * @example
 * ```tsx
 * <NotificationDrawer />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/notification-drawer)
 */
export interface NotificationDrawerProps
  extends
    AccessControlledProps,
    Omit<NotificationPanelProps, 'className' | 'access' | 'accessReason'> {
  /** Whether the drawer is open. */
  open: boolean;
  /** Callback fired when the drawer is dismissed. */
  onClose?: (reason: OverlayCloseReason) => void;
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Whether clicking the overlay backdrop closes the drawer. */
  closeOnOverlayClick?: boolean;
  /** Whether pressing Escape closes the drawer. */
  closeOnEscape?: boolean;
  /** Keep the drawer DOM mounted when closed. */
  keepMounted?: boolean;
  /** Destroy drawer content when hidden. */
  destroyOnHidden?: boolean;
  /** Target element for the portal. */
  portalTarget?: HTMLElement | null;
  /** Disable React portal rendering. */
  disablePortal?: boolean;
  /** Accessible label for the drawer dialog. */
  dialogLabel?: string;
  /** Tailwind class controlling drawer width. */
  widthClassName?: string;
  /** Additional CSS class for the inner panel. */
  panelClassName?: string;
}

/** Slide-over drawer that wraps the NotificationPanel in an overlay surface. */
export const NotificationDrawer = React.forwardRef<HTMLDivElement, NotificationDrawerProps>(
  (
    {
      open,
      onClose,
      closeLabel = 'Bildirim merkezini kapat',
      closeOnOverlayClick = true,
      closeOnEscape = true,
      keepMounted = false,
      destroyOnHidden = true,
      portalTarget,
      disablePortal = false,
      dialogLabel = 'Bildirimler',
      widthClassName = 'max-w-md',
      panelClassName = '',
      access = 'full',
      accessReason,
      title = 'Bildirimler',
      ...panelProps
    },
    _ref,
  ) => {
    const accessState = resolveAccessState(access);
    // Caller-supplied panel header content (e.g. tab switcher in
    // notification-orchestrator inbox UX). Combined with the drawer's
    // mandatory close button so the drawer keeps its dismiss affordance
    // while consumers can still inject custom controls.
    const { headerAccessory: customHeaderAccessory, ...restPanelProps } = panelProps;

    return (
      <OverlaySurface
        open={open}
        data-access-state={accessState.state}
        accessState={accessState}
        onClose={onClose}
        closeOnOverlayClick={closeOnOverlayClick}
        closeOnEscape={closeOnEscape}
        keepMounted={keepMounted}
        destroyOnHidden={destroyOnHidden}
        placement="right"
        transitionPreset="slide"
        portalTarget={portalTarget}
        disablePortal={disablePortal}
        ariaLabel={dialogLabel}
        viewportClassName="flex h-full justify-end"
        surfaceClassName={`${premiumOverlayPanelClassName} flex h-full w-full flex-col overflow-hidden bg-surface-default text-text-primary ${widthClassName}`.trim()}
        surfaceAppearance="premium"
      >
        <NotificationPanel
          {...restPanelProps}
          title={title}
          access={access}
          accessReason={accessReason}
          className={`h-full rounded-none border-0 shadow-none ${panelClassName}`.trim()}
          headerAccessory={
            <>
              {customHeaderAccessory}
              <button
                type="button"
                onClick={() => onClose?.('close-button')}
                disabled={accessState.isReadonly || accessState.isDisabled}
                aria-label={closeLabel}
                title={closeLabel}
                className={premiumOverlayCloseButtonClassName}
              >
                ×
              </button>
            </>
          }
        />
      </OverlaySurface>
    );
  },
);

NotificationDrawer.displayName = 'NotificationDrawer';

export default NotificationDrawer;

/** Type alias for NotificationDrawer ref. */
export type NotificationDrawerRef = React.Ref<HTMLElement>;
/** Type alias for NotificationDrawer element. */
export type NotificationDrawerElement = HTMLElement;
/** Type alias for NotificationDrawer cssproperties. */
export type NotificationDrawerCSSProperties = React.CSSProperties;
