import React, { useEffect, useRef, useCallback, useId } from "react";
import ReactDOM from "react-dom";
import { stateAttrs } from "../../internal/interaction-core";
import { registerLayer, unregisterLayer, useScrollLock } from "../../internal/overlay-engine";
import { cn } from "../../utils/cn";
import type { SlotProps } from "../_shared/slot-types";

/* ------------------------------------------------------------------ */
/*  Modal — Rich modal overlay                                         */
/*                                                                     */
/*  Built on native <dialog> for accessibility.                        */
/*  Surfaces: base · confirm · destructive · audit                     */
/*  Sizes: sm · md · lg                                                */
/* ------------------------------------------------------------------ */

export type OverlayCloseReason = "close-button" | "overlay" | "escape";

export interface ModalClasses {
  overlay?: string;
  panel?: string;
  header?: string;
  title?: string;
  body?: string;
  footer?: string;
  closeButton?: string;
}

export type ModalSlot = "root" | "overlay" | "content" | "header" | "body" | "footer";

/** Props for the Modal component.
 * @example
 * ```tsx
 * <Modal />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/modal)
 */
export interface ModalProps {
  /** Whether the modal is open and visible. */
  open: boolean;
  /** Content rendered inside the modal body. */
  children: React.ReactNode;
  /** Title displayed in the modal header. */
  title?: React.ReactNode;
  /** Callback fired when the modal requests to close, with the close reason. */
  onClose?: (reason?: OverlayCloseReason) => void;
  /** Content rendered in the modal footer area. */
  footer?: React.ReactNode;
  /** Additional CSS class name for the dialog element. */
  className?: string;
  /** Size preset controlling the maximum width. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Custom maximum width as a number (px) or CSS string. */
  maxWidth?: number | string;
  /** Whether the modal spans the full available width. */
  fullWidth?: boolean;
  /** @deprecated Use `variant` instead. Visual surface style. */
  surface?: "base" | "confirm" | "destructive" | "audit";
  /** Visual surface variant controlling header styling. */
  variant?: "base" | "confirm" | "destructive" | "audit";
  /** Whether clicking the overlay backdrop closes the modal. @default true */
  closeOnOverlayClick?: boolean;
  /** Whether pressing Escape closes the modal. @default true */
  closeOnEscape?: boolean;
  /** Whether to keep the modal in the DOM when closed. */
  keepMounted?: boolean;
  /** Whether to destroy modal content when hidden. */
  destroyOnHidden?: boolean;
  /** Custom DOM element to render the portal into. */
  portalTarget?: HTMLElement | null;
  /** Whether to disable portal rendering and render inline. */
  disablePortal?: boolean;
  /** Custom CSS class overrides for internal elements. */
  classes?: ModalClasses;
  /** Override props (className, style, etc.) on internal slot elements. */
  slotProps?: SlotProps<ModalSlot>;
}

const sizeStyles: Record<"sm" | "md" | "lg", string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

const surfaceHeaderStyles: Record<
  "base" | "confirm" | "destructive" | "audit",
  string
> = {
  base: "",
  confirm:
    "bg-state-info-bg border-state-info-text/20",
  destructive:
    "bg-state-danger-bg border-state-danger-text/20",
  audit:
    "bg-surface-muted border-border-subtle",
};

/** Rich modal overlay with surface variants, portal support, scroll lock, and focus management. */
export const Modal = React.forwardRef<HTMLDialogElement, ModalProps>(({
  open,
  children,
  title,
  onClose,
  footer,
  className,
  size = "md",
  maxWidth,
  fullWidth = false,
  surface: surfaceProp,
  variant,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  keepMounted = false,
  destroyOnHidden = false,
  portalTarget,
  disablePortal = false,
  classes,
  slotProps,
}, forwardedRef) => {
  const surface = variant ?? surfaceProp ?? "base";

  if (process.env.NODE_ENV !== "production" && surfaceProp !== undefined) {
    console.warn(
      '[DesignSystem] "Modal" prop "surface" is deprecated. Use "variant" instead. "surface" will be removed in v3.0.0.',
    );
  }

  const dialogRef = useRef<HTMLDialogElement>(null);
  const layerId = useId();

  /* ---- overlay-engine: scroll lock ---- */
  useScrollLock(open);

  /* ---- overlay-engine: layer-stack registration ---- */
  useEffect(() => {
    if (open) {
      registerLayer(layerId, "modal");
    }
    return () => {
      if (open) {
        unregisterLayer(layerId);
      }
    };
  }, [open, layerId]);

  /* ---- open / close sync ---- */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /* ---- escape handling ---- */
  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (closeOnEscape) {
        onClose?.("escape");
      }
    },
    [closeOnEscape, onClose],
  );

  /* ---- overlay click ---- */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (closeOnOverlayClick && e.target === dialogRef.current) {
        onClose?.("overlay");
      }
    },
    [closeOnOverlayClick, onClose],
  );

  /* ---- close button ---- */
  const handleCloseButton = useCallback(() => {
    onClose?.("close-button");
  }, [onClose]);

  /* ---- mount logic ---- */
  const shouldRender = open || keepMounted;
  if (!shouldRender && !destroyOnHidden) return null;
  if (!shouldRender && destroyOnHidden) return null;

  const maxWidthStyle =
    maxWidth != null
      ? { maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }
      : undefined;

  const dialog = (
    <dialog
      ref={(node) => {
        (dialogRef as React.MutableRefObject<HTMLDialogElement | null>).current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDialogElement | null>).current = node;
      }}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      style={maxWidthStyle}
      {...stateAttrs({ state: open ? "open" : "closed", component: "modal" })}
      {...slotProps?.root}
      className={cn(
        /* positioning & base */
        "fixed inset-0 z-[1400] m-auto rounded-2xl border border-border-subtle",
        "bg-surface-default p-0 shadow-xl",

        /* backdrop */
        "backdrop:bg-[var(--surface-overlay)] backdrop:backdrop-blur-xs",

        /* animation */
        "open:animate-in open:fade-in-0 open:zoom-in-95",

        /* size */
        !maxWidth && sizeStyles[size],
        (fullWidth || !maxWidth) && "w-full",

        /* visibility when keepMounted but closed */
        !open && keepMounted && "hidden",

        classes?.panel,
        className,
        slotProps?.root?.className,
      )}
    >
      <div {...slotProps?.overlay} className={cn("flex max-h-[85vh] flex-col", classes?.overlay, slotProps?.overlay?.className)}>
        {/* Header */}
        {(title || onClose) && (
          <div
            {...slotProps?.header}
            className={cn(
              "flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4",
              surfaceHeaderStyles[surface],
              classes?.header,
              slotProps?.header?.className,
            )}
          >
            <div>
              {title && (
                <div
                  className={cn(
                    "text-lg font-semibold text-text-primary",
                    classes?.title,
                  )}
                >
                  {title}
                </div>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={handleCloseButton}
                className={cn(
                  "shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:bg-surface-muted hover:text-text-primary",
                  classes?.closeButton,
                )}
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M15 5L5 15M5 5l10 10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div {...slotProps?.body} className={cn("flex-1 overflow-auto px-6 py-4", classes?.body, slotProps?.body?.className)}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            {...slotProps?.footer}
            className={cn(
              "flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-3",
              classes?.footer,
              slotProps?.footer?.className,
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );

  /* ---- portal ---- */
  if (disablePortal) return dialog;

  const target = portalTarget ?? (typeof document !== "undefined" ? document.body : null);
  if (!target) return dialog;
  return ReactDOM.createPortal(dialog, target);
});

Modal.displayName = "Modal";
