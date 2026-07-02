import React, { useCallback, useEffect, useId } from 'react';
import { cn } from '../../utils/cn';
import { focusRingClass, stateAttrs } from '../../internal/interaction-core';
import {
  useScrollLock,
  registerLayer,
  unregisterLayer,
  useEscapeKey,
} from '../../internal/overlay-engine';
import { useFocusTrap } from '../../internal/overlay-engine/focus-trap';
import { useSiblingIsolation } from '../../internal/overlay-engine/sibling-isolation';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  BottomSheetDrawer — Bottom-anchored slide-up panel                 */
/*                                                                     */
/*  Touch-friendly primitive for mobile-first detail/action panels.    */
/*  Distinct interaction pattern vs DetailDrawer (right-anchor modal). */
/*                                                                     */
/*  v1 scope: controlled open/close, focus trap, scroll lock, ESC,     */
/*  backdrop click, size presets, header (title/subtitle/actions),     */
/*  footer slot, visible drag handle (decorative).                     */
/*                                                                     */
/*  Out of v1 (deferred to v1.1):                                      */
/*  - Snap-point physics, velocity-driven swipe close                  */
/*  - Nested scroll gesture arbitration                                */
/* ------------------------------------------------------------------ */

export type BottomSheetDrawerSize = 'sm' | 'md' | 'lg' | 'full';

export interface BottomSheetDrawerProps extends AccessControlledProps {
  /** Controlled open state */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Sheet title */
  title: React.ReactNode;
  /** Optional subtitle below the title */
  subtitle?: React.ReactNode;
  /** Optional header actions (right-aligned, before the close button) */
  actions?: React.ReactNode;
  /** Body content */
  children: React.ReactNode;
  /** Optional footer slot (sticky bottom) */
  footer?: React.ReactNode;
  /** Maximum height preset (vh) */
  size?: BottomSheetDrawerSize;
  /** Close when the backdrop is clicked */
  closeOnBackdrop?: boolean;
  /** Disable the keyboard focus trap (a11y opt-out — provide rationale) */
  disableFocusTrap?: boolean;
  /** Optional aria-label (used when title is not a string) */
  ariaLabel?: string;
  className?: string;
}

const sizeMaxHeight: Record<BottomSheetDrawerSize, string> = {
  sm: 'max-h-[50vh]',
  md: 'max-h-[70vh]',
  lg: 'max-h-[85vh]',
  full: 'max-h-[95vh]',
};

/**
 * BottomSheetDrawer — bottom-anchored slide-up panel.
 *
 * @example
 * ```tsx
 * <BottomSheetDrawer
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Device Detail"
 *   subtitle="SRB-AIDENETIMPC"
 *   size="lg"
 * >
 *   <Tabs items={tabItems} />
 * </BottomSheetDrawer>
 * ```
 */
export const BottomSheetDrawer = React.forwardRef<HTMLDivElement, BottomSheetDrawerProps>(
  (
    {
      open,
      onClose,
      title,
      subtitle,
      actions,
      children,
      footer,
      size = 'lg',
      closeOnBackdrop = true,
      disableFocusTrap = false,
      ariaLabel,
      className,
      access,
      accessReason,
    },
    _ref,
  ) => {
    const accessState = resolveAccessState(access);
    const layerId = useId();
    const panelRef = useFocusTrap({
      active: open && !disableFocusTrap,
      autoFocus: !disableFocusTrap,
      restoreFocus: !disableFocusTrap,
      layerId,
    });

    useSiblingIsolation({
      active: open && !disableFocusTrap,
      layerId,
      panelRef,
    });

    useScrollLock(open);

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

    useEscapeKey(open, onClose, { layerId });

    const handleBackdrop = useCallback(() => {
      if (closeOnBackdrop) onClose();
    }, [closeOnBackdrop, onClose]);

    if (accessState.isHidden) return null;
    if (!open) return null;

    const resolvedAriaLabel = typeof title === 'string' ? title : (ariaLabel ?? 'Bottom sheet');

    return (
      <div
        className="fixed inset-0 z-[1300] flex flex-col justify-end"
        data-access-state={accessState.state}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-surface-overlay/40 animate-in fade-in-0"
          onClick={handleBackdrop}
          aria-hidden
        />

        {/* Panel */}
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>} /* snapshot-local: React18 LegacyRef daralması */
          role="dialog"
          aria-modal="true"
          aria-label={resolvedAriaLabel}
          tabIndex={-1}
          title={accessReason}
          {...stateAttrs({ component: 'bottom-sheet-drawer', state: 'open' })}
          className={cn(
            'relative w-full mx-auto bg-surface-default shadow-2xl',
            'rounded-t-2xl flex flex-col',
            'animate-in slide-in-from-bottom',
            'max-w-2xl',
            sizeMaxHeight[size],
            accessState.isDisabled && 'pointer-events-none opacity-50',
            className,
          )}
        >
          {/* Drag handle (decorative in v1) */}
          <div
            className="flex justify-center pt-2 pb-1 shrink-0"
            data-testid="bottom-sheet-drag-handle"
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-border-default" />
          </div>

          {/* Header */}
          <div className="border-b border-border-subtle px-6 py-3 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-text-primary truncate">{title}</h2>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-text-secondary truncate">{subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {actions}
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    'rounded-lg p-1.5 text-[var(--text-tertiary)]',
                    'hover:bg-[var(--surface-hover)] hover:text-text-primary',
                    focusRingClass('ring'),
                    'transition-colors',
                  )}
                  aria-label="Close drawer"
                  data-testid="bottom-sheet-close"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  },
);

BottomSheetDrawer.displayName = 'BottomSheetDrawer';

export type BottomSheetDrawerRef = React.Ref<HTMLDivElement>;
