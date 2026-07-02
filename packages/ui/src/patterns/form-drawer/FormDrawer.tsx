import React, { useEffect, useCallback, useId } from 'react';
import { cn } from '../../utils/cn';
import { focusRingClass, stateAttrs } from '../../internal/interaction-core';
import {
  useScrollLock,
  registerLayer,
  unregisterLayer,
  useEscapeKey,
} from '../../internal/overlay-engine';
// Codex 019dde20 iter-45 — switch from `useFocusRestore` (initial-focus
// only) to `useFocusTrap` which also wraps Tab/Shift+Tab at the panel
// boundary. Real focus trap replaces the prior accidental containment
// (panel tabIndex={-1} could let Tab leak from the last focusable to
// the address bar). useFocusTrap encapsulates: autoFocus, restoreFocus
// on unmount, AND wrap-around Tab handling — so the explicit
// useFocusRestore + manual `panelRef.current?.focus()` are both removed.
import { useFocusTrap } from '../../internal/overlay-engine/focus-trap';
// Codex 019dde4e iter-47a — sibling isolation: when the drawer is
// open, the rest of the page becomes background. Native `inert`
// removes those siblings from focus + a11y tree. Gated on the same
// `disableFocusTrap` flag so opt-out covers BOTH trap + isolation.
import { useSiblingIsolation } from '../../internal/overlay-engine/sibling-isolation';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  FormDrawer — Slide-in panel for create/edit forms                  */
/* ------------------------------------------------------------------ */

export type FormDrawerSize = 'sm' | 'md' | 'lg' | 'xl';
export type FormDrawerPlacement = 'right' | 'left';

/** Props for the FormDrawer component.
 * @example
 * ```tsx
 * <FormDrawer />
 * ```
 * @since 1.0.0
 */
export interface FormDrawerProps extends AccessControlledProps {
  /** Controlled open state */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Drawer title */
  title: React.ReactNode;
  /** Optional subtitle */
  subtitle?: React.ReactNode;
  /**
   * Optional leading slot rendered before the title block (avatar, icon,
   * status badge). Generic — name kept LTR-neutral so it can hold any
   * leading content (locale-aware layouts mirror via CSS).
   *
   * Codex 019dddf4 iter-43: introduced as a DS slot pattern instead of
   * embedding layout into the `title` ReactNode (Option B was rejected
   * because it loses the aria-label string fallback and breaks subtitle
   * alignment). Single optional prop, backward-compatible — existing
   * consumers pass nothing and render exactly as before.
   *
   * @example
   * ```tsx
   * <FormDrawer
   *   leading={<Avatar initials="HK" size="lg" />}
   *   title={user.fullName}
   *   subtitle={user.email}
   *   ...
   * />
   * ```
   */
  leading?: React.ReactNode;
  /** Form body content */
  children: React.ReactNode;
  /** Footer slot — typically submit/cancel buttons */
  footer?: React.ReactNode;
  /** Width preset */
  size?: FormDrawerSize;
  /** Slide direction */
  placement?: FormDrawerPlacement;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Show loading overlay */
  loading?: boolean;
  /**
   * Disable the keyboard focus trap. Default `false` — focus is trapped
   * within the panel (Tab/Shift+Tab wrap at the boundary, autoFocus on
   * the first focusable, focus restore on close). Pass `true` ONLY with
   * an explicit a11y rationale (e.g. integration with an external
   * focus-management library that takes over). Codex 019dde20 iter-45.
   */
  disableFocusTrap?: boolean;
  className?: string;
}

const sizeMap: Record<FormDrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

/** Slide-in panel for create/edit forms with submit/cancel footer, loading overlay, and escape handling. */
export const FormDrawer = React.forwardRef<HTMLDivElement, FormDrawerProps>(
  (
    {
      open,
      onClose,
      title,
      subtitle,
      leading,
      children,
      footer,
      size = 'md',
      placement = 'right',
      closeOnBackdrop = true,
      closeOnEscape = true,
      loading = false,
      disableFocusTrap = false,
      className,
      access,
      accessReason,
    },
    _ref,
  ) => {
    const accessState = resolveAccessState(access);
    // Codex 019dde20 iter-45 — useFocusTrap manages: panel ref, autoFocus
    // on activation, restoreFocus to the previously focused element on
    // unmount, AND wrap-around Tab/Shift+Tab keydown handling. Replaces
    // the prior `panelRef = useRef + panelRef.current?.focus()` + bare
    // `useFocusRestore` combo, which only set initial focus and didn't
    // trap Tab. The hook's per-keydown DOM scan covers dynamic focusable
    // lists (form fields appearing/disappearing while open).
    // Codex 019dde60 iter-47b1 — layerId declared before hooks so we
    // can pass it into useFocusTrap, useSiblingIsolation, and
    // useEscapeKey. Layer-aware gates fire only when this layer is
    // the topmost focus-trap / dismissable participant.
    const layerId = useId();
    const panelRef = useFocusTrap({
      active: open && !disableFocusTrap,
      autoFocus: !disableFocusTrap,
      restoreFocus: !disableFocusTrap,
      layerId,
    });

    /* ---- overlay-engine: sibling isolation (iter-47a) ---- */
    // Same gate as focus trap: `disableFocusTrap` covers BOTH the
    // keyboard trap and the background isolation. Codex 019dde4e
    // confirmed that the two concerns share the same opt-out
    // semantics — consumers either go fully modal or take the
    // escape hatch for both.
    useSiblingIsolation({
      active: open && !disableFocusTrap,
      layerId,
      panelRef,
    });

    /* ---- overlay-engine: scroll lock ---- */
    useScrollLock(open);

    /* ---- overlay-engine: layer-stack registration ---- */
    // Codex 019dde60 iter-47b1 — layer registers as 'modal' with
    // default participation flags (focusTrap: true, dismissal: true).
    // Capability stays stable even if `disableFocusTrap` flips at
    // runtime; the hook gates inside `useFocusTrap` decide whether
    // to actually intercept.
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

    /* ---- overlay-engine: escape key ---- */
    useEscapeKey(open && closeOnEscape, onClose, { layerId });

    // Codex 019dde20 iter-45 — `useFocusTrap` covers BOTH initial focus
    // (autoFocus → first focusable, or container fallback when none) AND
    // restoreFocus on deactivation. The previous `useFocusRestore` +
    // manual `panelRef.current?.focus()` block is removed.

    const handleBackdropClick = useCallback(() => {
      if (closeOnBackdrop) onClose();
    }, [closeOnBackdrop, onClose]);

    if (accessState.isHidden) return null;
    if (!open) return null;

    const isRight = placement === 'right';

    return (
      <div className="fixed inset-0 z-[1300] flex">
        {/* Backdrop */}
        <div
          data-access-state={accessState.state}
          // PR-12: surface-inverse → surface-overlay (same token, registered class).
          className="absolute inset-0 bg-surface-overlay/40 animate-in fade-in-0"
          onClick={handleBackdropClick}
          aria-hidden
        />

        {/* Panel */}
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>} /* snapshot-local: React18 LegacyRef daralması */
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          tabIndex={-1}
          {...stateAttrs({ component: 'form-drawer', state: 'open', loading })}
          title={accessReason}
          className={cn(
            'relative flex flex-col w-full bg-surface-default shadow-2xl',
            'animate-in',
            isRight ? 'ml-auto slide-in-from-right' : 'mr-auto slide-in-from-left',
            accessState.isDisabled && 'pointer-events-none opacity-50',
            sizeMap[size],
            className,
          )}
        >
          {/* Header
            Codex 019dddf4 iter-43 — DOM restructure: outer keeps
            `items-start justify-between gap-3` so close button stays
            top-aligned regardless of subtitle line count. New left
            group wraps `leading` slot + title/subtitle column with
            its own `items-start gap-3`. The `mt-0.5` on the leading
            wrapper aligns the avatar baseline near the title's cap
            height while keeping the avatar pinned up when subtitle
            wraps to two lines (avoids optical sag on `items-center`). */}
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-6 py-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-text-primary truncate">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)]',
                'hover:bg-[var(--surface-hover)] hover:text-text-primary',
                focusRingClass('ring'),
                'transition-colors',
              )}
              aria-label="Close drawer"
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-default/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-default border-t-[var(--action-primary)]" />
              </div>
            )}
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    );
  },
);

FormDrawer.displayName = 'FormDrawer';

/** Ref type for FormDrawer. */
export type FormDrawerRef = React.Ref<HTMLDivElement>;
