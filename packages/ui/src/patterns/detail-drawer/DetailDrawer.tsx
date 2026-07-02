import React, { useEffect, useCallback, useId } from 'react';
import { cn } from '../../utils/cn';
import { focusRingClass, stateAttrs } from '../../internal/interaction-core';
import {
  useScrollLock,
  registerLayer,
  unregisterLayer,
  useEscapeKey,
} from '../../internal/overlay-engine';
// Codex 019dde20 iter-45 — symmetric focus-trap adoption with FormDrawer.
// useFocusTrap encapsulates autoFocus + restoreFocus + Tab/Shift+Tab
// wrap-around. Replaces the prior accidental focus containment that
// could leak Tab from the close button to the address bar.
import { useFocusTrap } from '../../internal/overlay-engine/focus-trap';
// Codex 019dde4e iter-47a — symmetric with FormDrawer iter-47a.
import { useSiblingIsolation } from '../../internal/overlay-engine/sibling-isolation';
import { resolveAccessState, type AccessControlledProps } from '../../internal/access-controller';
/* ------------------------------------------------------------------ */
/*  DetailDrawer — Read-only detail panel (wider, with sections)       */
/* ------------------------------------------------------------------ */

export type DetailDrawerSize = 'md' | 'lg' | 'xl' | 'full';

export interface DetailDrawerSection {
  key: string;
  title?: React.ReactNode;
  content: React.ReactNode;
}

/** Props for the DetailDrawer component.
 * @example
 * ```tsx
 * <DetailDrawer />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/detail-drawer)
 */
export interface DetailDrawerProps extends AccessControlledProps {
  /** Controlled open state */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Drawer title */
  title: React.ReactNode;
  /** Optional subtitle */
  subtitle?: React.ReactNode;
  /**
   * Decorative or contextual visual placed before the title content
   * (e.g. avatar, icon, status indicator). LTR-neutral name —
   * locale-aware layouts mirror via CSS. Symmetric with
   * `FormDrawer.leading` introduced in iter-43; unifies the leading-
   * slot contract across both drawer primitives so consumers can swap
   * primitives without changing the leading content shape.
   *
   * Codex 019dde0c iter-44 — added for `RoleDrawer` consumption with
   * `IconShield` (decorative). Backward-compatible: existing consumers
   * pass nothing and render exactly as before.
   *
   * @example
   * ```tsx
   * <DetailDrawer
   *   leading={<IconShield className="h-8 w-8 text-text-secondary" aria-hidden="true" />}
   *   title={role.name}
   *   subtitle={role.description}
   *   tags={<RoleBadges role={role} />}
   *   ...
   * />
   * ```
   */
  leading?: React.ReactNode;
  /** Optional header actions (e.g. Edit, Delete buttons) */
  actions?: React.ReactNode;
  /** Optional header tags / badges */
  tags?: React.ReactNode;
  /** Sections to render */
  sections?: DetailDrawerSection[];
  /** Or free-form children */
  children?: React.ReactNode;
  /** Footer slot */
  footer?: React.ReactNode;
  /** Width preset */
  size?: DetailDrawerSize;
  /** Close on backdrop click */
  closeOnBackdrop?: boolean;
  /**
   * Disable the keyboard focus trap. Default `false` — focus is trapped
   * within the panel (Tab/Shift+Tab wrap at the boundary, autoFocus on
   * the first focusable, focus restore on close). Pass `true` ONLY with
   * an explicit a11y rationale. Codex 019dde20 iter-45.
   */
  disableFocusTrap?: boolean;
  className?: string;
}

const sizeMap: Record<DetailDrawerSize, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-full',
};

/** Read-only slide-in detail panel with section layout, header actions, and tags. */
export const DetailDrawer = React.forwardRef<HTMLDivElement, DetailDrawerProps>(
  (
    {
      open,
      onClose,
      title,
      subtitle,
      leading,
      actions,
      tags,
      sections,
      children,
      footer,
      size = 'lg',
      closeOnBackdrop = true,
      disableFocusTrap = false,
      className,
      access,
      accessReason,
    },
    _ref,
  ) => {
    const accessState = resolveAccessState(access);
    // Codex 019dde60 iter-47b1 — layerId before hooks for layer-aware
    // gates. Same registration pattern as FormDrawer.
    const layerId = useId();
    const panelRef = useFocusTrap({
      active: open && !disableFocusTrap,
      autoFocus: !disableFocusTrap,
      restoreFocus: !disableFocusTrap,
      layerId,
    });

    /* ---- overlay-engine: sibling isolation (iter-47a) ---- */
    useSiblingIsolation({
      active: open && !disableFocusTrap,
      layerId,
      panelRef,
    });

    /* ---- overlay-engine: scroll lock ---- */
    useScrollLock(open);

    /* ---- overlay-engine: layer-stack registration ---- */
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
    useEscapeKey(open, onClose, { layerId });

    // Codex 019dde20 iter-45 — initial panel focus is now handled by
    // useFocusTrap above (autoFocus → first focusable, container
    // fallback when none). Removing the manual panelRef.focus().

    const handleBackdrop = useCallback(() => {
      if (closeOnBackdrop) onClose();
    }, [closeOnBackdrop, onClose]);

    if (accessState.isHidden) return null;
    if (!open) return null;

    // Resolve body content: sections > children
    const renderBody = () => {
      if (sections) {
        return sections.map((section) => (
          <div
            key={section.key}
            className="border-b border-border-subtle px-6 py-4 last:border-b-0"
          >
            {section.title && (
              <h3 className="mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wider">
                {section.title}
              </h3>
            )}
            {section.content}
          </div>
        ));
      }

      return <div className="px-6 py-4">{children}</div>;
    };

    return (
      <div className="fixed inset-0 z-[1300] flex" data-access-state={accessState.state}>
        {/* Backdrop */}
        <div
          // PR-12: surface-inverse → surface-overlay (same token, registered class).
          className="absolute inset-0 bg-surface-overlay/40 animate-in fade-in-0"
          onClick={handleBackdrop}
          aria-hidden
        />

        {/* Panel */}
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>} /* snapshot-local: React18 LegacyRef daralması */
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
          tabIndex={-1}
          title={accessReason}
          {...stateAttrs({ component: 'detail-drawer', state: 'open' })}
          className={cn(
            'relative ml-auto flex flex-col w-full bg-surface-default shadow-2xl',
            'animate-in slide-in-from-right',
            accessState.isDisabled && 'pointer-events-none opacity-50',
            sizeMap[size],
            className,
          )}
        >
          {/* Header
            Codex 019dde0c iter-44 — DOM restructure mirrors FormDrawer
            iter-43: outer `flex items-start justify-between gap-3`
            stays unchanged so the actions/close group on the right
            keeps its top-aligned position and behavior. New left
            group `flex min-w-0 flex-1 items-start gap-3` wraps the
            optional leading slot + title/subtitle column. The leading
            wrapper has `shrink-0 mt-0.5` so the icon's optical center
            sits near the title's cap height when the subtitle wraps.
            `tags` continues to render alongside `title` on the same
            line (flex-wrap) — leading only adds a visual anchor BEFORE
            the title block; tags semantics are untouched. */}
          <div className="border-b border-border-subtle px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {leading && <div className="shrink-0 mt-0.5">{leading}</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-text-primary truncate">{title}</h2>
                    {tags && <div className="flex items-center gap-1.5">{tags}</div>}
                  </div>
                  {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
                </div>
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
          <div className="flex-1 overflow-y-auto">{renderBody()}</div>

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

DetailDrawer.displayName = 'DetailDrawer';

/** Ref type for DetailDrawer. */
export type DetailDrawerRef = React.Ref<HTMLDivElement>;
