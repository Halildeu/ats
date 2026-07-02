import React, { useEffect, useRef, useCallback, useId } from 'react';
import { stateAttrs } from '../../internal/interaction-core';
import { registerLayer, unregisterLayer } from '../../internal/overlay-engine';
import { cn } from '../../utils/cn';
import type { SlotProps } from '../_shared/slot-types';

/* ------------------------------------------------------------------ */
/*  Dialog — Modal overlay                                             */
/*                                                                     */
/*  Built on native <dialog> for accessibility.                        */
/*  Sizes: sm · md · lg · xl · full                                    */
/* ------------------------------------------------------------------ */

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export type DialogSlot = 'root' | 'backdrop' | 'panel' | 'title' | 'description';

/** Props for the Dialog component.
 * @example
 * ```tsx
 * <Dialog />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/dialog)
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  size?: DialogSize;
  /** Show close button */
  closable?: boolean;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Title for header */
  title?: React.ReactNode;
  /** Description below title */
  description?: React.ReactNode;
  /** Footer content (actions) */
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  /** Override props (className, style, etc.) on internal slot elements */
  slotProps?: SlotProps<DialogSlot>;
}

const sizeStyles: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

/** Accessible modal overlay built on native dialog with configurable size, title, and footer. */
export const Dialog = React.forwardRef<HTMLDialogElement, DialogProps>(
  (
    {
      open,
      onClose,
      size = 'md',
      closable = true,
      closeOnBackdrop = true,
      closeOnEscape = true,
      title,
      description,
      footer,
      className,
      children,
      slotProps,
    },
    forwardedRef,
  ) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const layerId = useId();

    /* ---- layer-stack registration ---- */
    useEffect(() => {
      if (open) {
        registerLayer(layerId, 'modal');
      }
      return () => {
        if (open) {
          unregisterLayer(layerId);
        }
      };
    }, [open, layerId]);

    useEffect(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (open && !dialog.open) {
        dialog.showModal();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    }, [open]);

    const handleCancel = useCallback(
      (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (closeOnEscape) onClose();
      },
      [closeOnEscape, onClose],
    );

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent<HTMLDialogElement>) => {
        if (closeOnBackdrop && e.target === dialogRef.current) {
          onClose();
        }
      },
      [closeOnBackdrop, onClose],
    );

    if (!open) return null;

    return (
      <dialog
        ref={(node) => {
          (dialogRef as React.MutableRefObject<HTMLDialogElement | null>).current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef)
            (forwardedRef as React.MutableRefObject<HTMLDialogElement | null>).current = node;
        }}
        onCancel={handleCancel}
        onClick={handleBackdropClick}
        {...stateAttrs({ state: open ? 'open' : 'closed', component: 'dialog' })}
        {...slotProps?.root}
        className={cn(
          'fixed inset-0 z-[1400] m-auto rounded-2xl border border-border-subtle',
          'bg-surface-default p-0 shadow-xl',
          // PR-12: `bg-surface-inverse` was unregistered in Tailwind theme,
          // so `backdrop:bg-surface-inverse/50` never compiled — modal had
          // no visible backdrop. `surface-overlay` is the registered color
          // (same underlying token via theme.css alias).
          'backdrop:bg-surface-overlay/50 backdrop:backdrop-blur-xs',
          'open:animate-in open:fade-in-0 open:zoom-in-95',
          sizeStyles[size],
          size !== 'full' && 'w-full',
          className,
          slotProps?.root?.className,
        )}
      >
        <div
          {...slotProps?.panel}
          className={cn('flex max-h-[85vh] flex-col', slotProps?.panel?.className)}
        >
          {/* Header */}
          {(title || closable) && (
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
              <div>
                {title && (
                  <div
                    {...slotProps?.title}
                    className={cn(
                      'text-lg font-semibold text-text-primary',
                      slotProps?.title?.className,
                    )}
                  >
                    {title}
                  </div>
                )}
                {description && (
                  <div
                    {...slotProps?.description}
                    className={cn(
                      'mt-1 text-sm text-text-secondary',
                      slotProps?.description?.className,
                    )}
                  >
                    {description}
                  </div>
                )}
              </div>
              {closable && (
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1.5 text-text-secondary transition hover:bg-surface-muted hover:text-text-primary"
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
          <div className="flex-1 overflow-auto px-6 py-4">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-3">
              {footer}
            </div>
          )}
        </div>
      </dialog>
    );
  },
);

Dialog.displayName = 'Dialog';
