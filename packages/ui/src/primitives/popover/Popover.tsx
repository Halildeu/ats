import React, {
  createElement,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  resolveAccessState,
  shouldBlockInteraction,
  type AccessControlledProps,
  type AccessLevel,
} from '../../internal/access-controller';
import { stateAttrs } from '../../internal/interaction-core';
import {
  useOutsideClick,
  useEscapeKey,
  registerLayer,
  unregisterLayer,
} from '../../internal/overlay-engine';
// Codex 019dde3d iter-46 — opt-in focus trap for modal-style popovers.
// Default popover is non-modal: Tab can leave the popover and click-
// outside closes it. Consumers building modal-pop-over UX can opt in
// with `enableFocusTrap`.
import { useFocusTrap } from '../../internal/overlay-engine/focus-trap';
import { premiumOverlayPanelClassName } from '../../internal/OverlaySurface';
import {
  resolveOverlayArrowPositionClassName,
  resolveOverlayPosition,
  type OverlayAlign,
  type OverlayPosition,
  type OverlaySide,
} from '../../internal/OverlayPositioning';

export type PopoverTriggerMode = 'click' | 'hover' | 'focus' | 'hover-focus';
export type PopoverSide = OverlaySide;
export type PopoverAlign = OverlayAlign;
type PopoverPosition = OverlayPosition;

/**
 * Popover renders a positioned overlay panel triggered by click, hover, or focus
 * with portal support, collision flipping, and arrow indicator.
 * @example
 * ```tsx
 * <Popover />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/popover)

 */
export interface PopoverProps extends AccessControlledProps {
  /** The element that anchors and triggers the popover. */
  trigger: React.ReactNode;
  /** Optional title rendered at the top of the panel. */
  title?: React.ReactNode;
  /** Body content rendered inside the popover panel. */
  content: React.ReactNode;
  /** Horizontal alignment relative to the trigger. @default "center" */
  align?: PopoverAlign;
  /** Preferred side the popover appears on. @default "bottom" */
  side?: PopoverSide;
  /** Interaction mode that opens the popover. @default "click" */
  triggerMode?: PopoverTriggerMode;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state for uncontrolled mode. @default false */
  defaultOpen?: boolean;
  /** Callback fired when the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Additional CSS class name on the root wrapper. */
  className?: string;
  /** DOM element to portal the panel into. @default document.body */
  portalTarget?: HTMLElement | null;
  /** Disable portaling and render the panel inline. @default false */
  disablePortal?: boolean;
  /** Accessible label for the popover dialog. @default "Popover" */
  ariaLabel?: string;
  /** Flip to the opposite side when clipped by viewport edges. @default true */
  flipOnCollision?: boolean;
  /** Delay in ms before showing on hover/focus triggers. */
  openDelay?: number;
  /** Delay in ms before hiding on hover/focus leave. */
  closeDelay?: number;
  /** Show a directional arrow pointing to the trigger. @default true */
  showArrow?: boolean;
  /** Additional CSS class name for the arrow element. */
  arrowClassName?: string;
  /** Additional CSS class name for the panel element. */
  panelClassName?: string;
  /**
   * Opt in to a keyboard focus trap inside the popover panel. Default
   * `false` — the popover stays non-modal: Tab can leave and the panel
   * closes via outside-click. Set `true` for modal-style popovers
   * (large interactive content where focus should cycle internally
   * until explicitly dismissed). Codex 019dde3d iter-46.
   *
   * Behavior contract when `enableFocusTrap=true`:
   *  - Tab/Shift+Tab wrap at the panel boundary
   *  - autoFocus moves focus to the first focusable in the panel on
   *    activation
   *  - restoreFocus on close — but does NOT override focus that was
   *    explicitly transferred by an outside-click handler before the
   *    popover closed
   */
  enableFocusTrap?: boolean;
}

const POPOVER_GAP = 12;
const POPOVER_EDGE_PADDING = 12;
const HOVER_DELAY_MS = 90;

const callHandler = <E,>(handler: ((event: E) => void) | undefined, event: E) => {
  handler?.(event);
};

const isContainedTarget = (target: EventTarget | null, container: HTMLElement | null) =>
  target instanceof Node && Boolean(container?.contains(target));

const resolveInlinePlacementClassName = (side: PopoverSide, align: PopoverAlign) => {
  if (side === 'top' || side === 'bottom') {
    const horizontalClassName =
      align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
    const verticalClassName = side === 'top' ? 'bottom-full mb-3' : 'top-full mt-3';
    return `${horizontalClassName} ${verticalClassName}`;
  }

  const verticalClassName =
    align === 'start' ? 'top-0' : align === 'end' ? 'bottom-0' : 'top-1/2 -translate-y-1/2';
  const horizontalClassName = side === 'left' ? 'end-full me-3' : 'start-full ms-3';
  return `${verticalClassName} ${horizontalClassName}`;
};

/** Floating content panel anchored to a trigger with configurable placement, arrow, and access control. */
export const Popover = React.forwardRef<HTMLDivElement, PopoverProps>(
  (
    {
      trigger,
      title,
      content,
      align = 'center',
      side = 'bottom',
      triggerMode = 'click',
      open,
      defaultOpen = false,
      onOpenChange,
      className = '',
      portalTarget,
      disablePortal = false,
      ariaLabel = 'Popover',
      flipOnCollision = true,
      openDelay,
      closeDelay,
      showArrow = true,
      arrowClassName = '',
      panelClassName = '',
      enableFocusTrap = false,
      access = 'full',
      accessReason,
    },
    forwardedRef,
  ) => {
    const accessState = resolveAccessState(access);
    const interactionState: AccessLevel =
      accessState.isDisabled || accessState.isReadonly ? accessState.state : 'full';
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const [position, setPosition] = useState<PopoverPosition | null>(null);
    const resolvedOpen = open ?? uncontrolledOpen;
    const popoverId = useId();
    const titleId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerAnchorRef = useRef<HTMLSpanElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    // Codex 019dde3d iter-46 — opt-in focus trap. The hook's container
    // ref is composed with the existing `panelRef` via a callback ref on
    // the panel element. `active` is gated on both `enableFocusTrap` and
    // `resolvedOpen` so the keydown listener attaches only when the
    // feature is opted in AND the popover is open. autoFocus + restore
    // share the same gate.
    // Codex 019dde60 iter-47b1 — popoverId doubles as the layer id;
    // already declared above (line 166). Pass it into useFocusTrap so
    // the Tab gate respects topmost-focus-trap-layer ordering when
    // enableFocusTrap=true and another modal is stacked on top.
    const focusTrapContainerRef = useFocusTrap({
      active: enableFocusTrap && resolvedOpen,
      autoFocus: enableFocusTrap,
      restoreFocus: enableFocusTrap,
      layerId: popoverId,
    });
    const openTimerRef = useRef<number | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const enableHover = triggerMode === 'hover' || triggerMode === 'hover-focus';
    const enableFocus = triggerMode === 'focus' || triggerMode === 'hover-focus';
    const enableClick = triggerMode === 'click';
    const resolvedOpenDelay = openDelay ?? (enableHover ? HOVER_DELAY_MS : 0);
    const resolvedCloseDelay = closeDelay ?? (enableHover ? HOVER_DELAY_MS : 0);

    const setOpen = (next: boolean) => {
      if (open === undefined) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    };

    const clearScheduledOpen = () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
    };

    const clearScheduledClose = () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };

    const openPopover = React.useCallback(() => {
      clearScheduledClose();
      clearScheduledOpen();
      setOpen(true);
    }, [open, onOpenChange]);

    const closePopover = React.useCallback(
      (restoreFocus = false) => {
        clearScheduledClose();
        clearScheduledOpen();
        setOpen(false);
        if (restoreFocus) {
          triggerAnchorRef.current
            ?.querySelector<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            )
            ?.focus();
        }
      },
      [open, onOpenChange],
    );

    const scheduleOpen = React.useCallback(() => {
      clearScheduledClose();
      clearScheduledOpen();
      if (resolvedOpenDelay <= 0) {
        openPopover();
        return;
      }
      openTimerRef.current = window.setTimeout(() => {
        openPopover();
        openTimerRef.current = null;
      }, resolvedOpenDelay);
    }, [openPopover, resolvedOpenDelay]);

    const scheduleClose = React.useCallback(
      (restoreFocus = false) => {
        clearScheduledOpen();
        clearScheduledClose();
        if (resolvedCloseDelay <= 0) {
          closePopover(restoreFocus);
          return;
        }
        closeTimerRef.current = window.setTimeout(() => {
          closePopover(restoreFocus);
          closeTimerRef.current = null;
        }, resolvedCloseDelay);
      },
      [closePopover, resolvedCloseDelay],
    );

    const updatePosition = React.useCallback(() => {
      if (disablePortal || typeof window === 'undefined') {
        return;
      }

      const triggerBounds = triggerAnchorRef.current?.getBoundingClientRect();
      const panelBounds = panelRef.current?.getBoundingClientRect();
      if (!triggerBounds || !panelBounds) {
        return;
      }

      setPosition(
        resolveOverlayPosition({
          preferredSide: side,
          align,
          triggerBounds,
          panelBounds,
          flipOnCollision,
          gap: POPOVER_GAP,
          edgePadding: POPOVER_EDGE_PADDING,
        }),
      );
    }, [align, disablePortal, flipOnCollision, side]);

    useEffect(
      () => () => {
        clearScheduledOpen();
        clearScheduledClose();
      },
      [],
    );

    /* ---- overlay-engine: layer-stack registration (iter-47b1 + iter-47b2) ---- */
    // Codex 019dde60 iter-47b1 — Popover joins the layer stack so the
    // dismissal LIFO works for modal-over-popover scenarios. Layer
    // type 'popover' (semantic split from 'dropdown'; same z-index
    // band so visual stacking is unchanged). When enableFocusTrap is
    // true the layer overrides participatesInFocusTrap to true so
    // it's eligible for the focus-trap gate as well.
    //
    // Codex 019ddf17 iter-47b2 — `autoCloseOnHigherLayer` ensures the
    // popover state stays consistent when a modal opens above it.
    // Without this, the popover would remain `open=true` while
    // sibling-isolation `inert` hides it; closing the modal would then
    // reveal a stale half-open popover. The callback delegates to
    // `closePopover` so the controlled `onOpenChange` consumer sees
    // the state transition normally.
    useEffect(() => {
      if (!resolvedOpen) return;
      registerLayer(popoverId, 'popover', {
        participatesInFocusTrap: enableFocusTrap,
        autoCloseOnHigherLayer: () => closePopover(false),
      });
      return () => unregisterLayer(popoverId);
    }, [resolvedOpen, popoverId, enableFocusTrap, closePopover]);

    /* ---- overlay-engine: outside click ---- */
    // Codex 019dde60 iter-47b1 — pass popoverId so a stacked modal
    // captures outside-click first; popover stays put underneath.
    useOutsideClick({
      active: resolvedOpen,
      onOutsideClick: () => closePopover(false),
      excludeRefs: [rootRef, panelRef],
      layerId: popoverId,
    });

    /* ---- overlay-engine: escape key ---- */
    // Codex 019dde60 iter-47b1 — same gate; LIFO Escape close.
    useEscapeKey(resolvedOpen, () => closePopover(true), { layerId: popoverId });

    useEffect(() => {
      if (!resolvedOpen) {
        setPosition(null);
      }
    }, [resolvedOpen]);

    React.useLayoutEffect(() => {
      if (!resolvedOpen || disablePortal || typeof window === 'undefined') {
        return undefined;
      }

      updatePosition();
      const frame = window.requestAnimationFrame(updatePosition);
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }, [disablePortal, resolvedOpen, updatePosition]);

    useEffect(() => {
      if (!resolvedOpen || disablePortal || typeof window === 'undefined') {
        return undefined;
      }

      const handleViewportChange = () => updatePosition();
      window.addEventListener('resize', handleViewportChange);
      window.addEventListener('scroll', handleViewportChange, true);
      return () => {
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
      };
    }, [disablePortal, resolvedOpen, updatePosition]);

    if (accessState.isHidden) {
      return null;
    }

    const blockInteraction = shouldBlockInteraction(interactionState, accessState.isDisabled);
    const resolvedSide = position?.resolvedSide ?? side;
    const collisionFlipped = position?.flipped ?? false;

    const handleClickToggle = (event: React.MouseEvent<HTMLElement>) => {
      if (blockInteraction) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!enableClick) {
        return;
      }
      if (resolvedOpen) {
        closePopover(false);
        return;
      }
      openPopover();
    };

    const handleKeyboardToggle = (event: React.KeyboardEvent<HTMLElement>) => {
      if (blockInteraction) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (resolvedOpen) {
          closePopover(false);
          return;
        }
        openPopover();
        return;
      }

      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !resolvedOpen) {
        event.preventDefault();
        openPopover();
      }
    };

    const handleHoverEnter = () => {
      if (!enableHover || blockInteraction) {
        return;
      }
      scheduleOpen();
    };

    const handleHoverLeave = (event: React.MouseEvent<HTMLElement>) => {
      if (!enableHover) {
        return;
      }
      if (isContainedTarget(event.relatedTarget, panelRef.current)) {
        return;
      }
      scheduleClose(false);
    };

    const handleFocusOpen = () => {
      if (!enableFocus || blockInteraction) {
        return;
      }
      scheduleOpen();
    };

    const handleFocusClose = (event: React.FocusEvent<HTMLElement>) => {
      if (!enableFocus) {
        return;
      }
      if (
        isContainedTarget(event.relatedTarget, rootRef.current) ||
        isContainedTarget(event.relatedTarget, panelRef.current)
      ) {
        return;
      }
      scheduleClose(false);
    };

    const triggerProps = {
      'aria-haspopup': 'dialog' as const,
      'aria-expanded': resolvedOpen,
      'aria-controls': resolvedOpen ? popoverId : undefined,
      'aria-disabled': interactionState !== 'full' || undefined,
      'aria-readonly': accessState.isReadonly || undefined,
      title: accessReason,
    };

    const triggerNode = isValidElement(trigger)
      ? cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
          ...triggerProps,
          onClick: (event: React.MouseEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            if (!event.defaultPrevented) {
              handleClickToggle(event);
            }
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onKeyDown as ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            if (!event.defaultPrevented) {
              handleKeyboardToggle(event);
            }
          },
          onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onMouseEnter as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            handleHoverEnter();
          },
          onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onMouseLeave as ((event: React.MouseEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            handleHoverLeave(event);
          },
          onFocus: (event: React.FocusEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            handleFocusOpen();
          },
          onBlur: (event: React.FocusEvent<HTMLElement>) => {
            const original = (trigger as React.ReactElement<Record<string, unknown>>).props
              ?.onBlur as ((event: React.FocusEvent<HTMLElement>) => void) | undefined;
            callHandler(original, event);
            handleFocusClose(event);
          },
        })
      : createElement(
          'button',
          {
            type: 'button',
            className:
              'inline-flex items-center justify-center rounded-md border border-border-subtle bg-surface-panel px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-muted focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
            ...triggerProps,
            disabled: interactionState !== 'full',
            onClick: handleClickToggle,
            onKeyDown: handleKeyboardToggle,
            onMouseEnter: handleHoverEnter,
            onMouseLeave: handleHoverLeave,
            onFocus: handleFocusOpen,
            onBlur: handleFocusClose,
          },
          trigger,
        );

    const panelNode = resolvedOpen ? (
      <div
        ref={(node) => {
          // Codex 019dde3d iter-46 — compose existing panelRef with
          // useFocusTrap container ref. Both hooks need access to the
          // same DOM node; assigning to both keeps existing positioning
          // logic (panelRef.current?.getBoundingClientRect()) intact
          // while letting the focus trap attach its keydown listener
          // and run getFocusableElements.
          (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          (focusTrapContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        id={popoverId}
        role="dialog"
        aria-modal={enableFocusTrap ? 'true' : 'false'}
        {...stateAttrs({ state: resolvedOpen ? 'open' : 'closed', component: 'popover' })}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        data-side={side}
        data-resolved-side={resolvedSide}
        data-align={align}
        data-collision-flipped={collisionFlipped}
        data-trigger-mode={triggerMode}
        data-surface-appearance="premium"
        onMouseEnter={() => {
          if (enableHover) {
            clearScheduledClose();
          }
        }}
        onMouseLeave={(event) => {
          if (!enableHover) {
            return;
          }
          if (isContainedTarget(event.relatedTarget, rootRef.current)) {
            return;
          }
          scheduleClose(false);
        }}
        onFocusCapture={() => {
          if (enableFocus) {
            clearScheduledClose();
          }
        }}
        onBlurCapture={(event) => {
          if (!enableFocus) {
            return;
          }
          if (
            isContainedTarget(event.relatedTarget, panelRef.current) ||
            isContainedTarget(event.relatedTarget, rootRef.current)
          ) {
            return;
          }
          scheduleClose(false);
        }}
        className={`${premiumOverlayPanelClassName} z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] p-4 ${
          disablePortal
            ? `absolute ${resolveInlinePlacementClassName(resolvedSide, align)}`
            : 'fixed'
        } ${panelClassName}`.trim()}
        style={{
          boxShadow: 'var(--elevation-overlay)',
          ...(disablePortal
            ? undefined
            : {
                left: position?.left ?? 0,
                top: position?.top ?? 0,
              }),
        }}
      >
        {showArrow ? (
          <span
            data-testid="popover-arrow"
            aria-hidden="true"
            className={`absolute h-3 w-3 rotate-45 border border-border-subtle/80 bg-[var(--surface-card)] shadow-xs ${resolveOverlayArrowPositionClassName(resolvedSide, align)} ${arrowClassName}`.trim()}
          />
        ) : null}
        {title ? (
          <div
            id={titleId}
            className="mb-2 text-sm font-semibold tracking-[-0.01em] text-text-primary"
          >
            {title}
          </div>
        ) : null}
        <div className="text-sm leading-6 text-text-secondary">{content}</div>
      </div>
    ) : null;

    return (
      <div
        className={`relative inline-flex ${className}`.trim()}
        ref={(node) => {
          (rootRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef)
            (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        data-access-state={accessState.state}
      >
        <span ref={triggerAnchorRef} className="inline-flex max-w-full">
          {triggerNode}
        </span>
        {resolvedOpen
          ? disablePortal || typeof document === 'undefined'
            ? panelNode
            : createPortal(panelNode, portalTarget ?? document.body)
          : null}
      </div>
    );
  },
);

Popover.displayName = 'Popover';

export default Popover;
