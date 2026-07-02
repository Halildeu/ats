import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  SpeedDial — Floating action button with expandable actions         */
/* ------------------------------------------------------------------ */

export type SpeedDialDirection = 'up' | 'down' | 'left' | 'right';

export interface SpeedDialAction {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface SpeedDialProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Main FAB icon. */
  icon?: React.ReactNode;
  /** Icon shown when open. */
  openIcon?: React.ReactNode;
  /** Action items. */
  actions: SpeedDialAction[];
  /** Expansion direction. @default 'up' */
  direction?: SpeedDialDirection;
  /** Controlled open state. */
  open?: boolean;
  /** Default open state. */
  defaultOpen?: boolean;
  /** Open state change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Trigger mode. @default 'click' */
  triggerMode?: 'click' | 'hover';
  /** Hide the entire component. @default false */
  hidden?: boolean;
  /** Accessible label for the FAB. @default 'Actions' */
  ariaLabel?: string;
}

/* ---- Icons ---- */

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const directionClasses: Record<SpeedDialDirection, { container: string; item: string }> = {
  up: { container: 'flex-col-reverse', item: 'mb-2' },
  down: { container: 'flex-col', item: 'mt-2' },
  left: { container: 'flex-row-reverse', item: 'mr-2' },
  right: { container: 'flex-row', item: 'ml-2' },
};

/**
 * Floating action button with expandable action list.
 * Supports 4 directions, click/hover trigger, and keyboard navigation.
 *
 * @example
 * ```tsx
 * <SpeedDial
 *   actions={[
 *     { icon: <EditIcon />, label: 'Edit', onClick: handleEdit },
 *     { icon: <ShareIcon />, label: 'Share', onClick: handleShare },
 *   ]}
 *   direction="up"
 * />
 * ```
 *
 * @since 1.1.0
 */
export const SpeedDial = forwardRef<HTMLDivElement, SpeedDialProps>(
  function SpeedDial(
    {
      icon,
      openIcon,
      actions,
      direction = 'up',
      open: controlledOpen,
      defaultOpen = false,
      onOpenChange,
      triggerMode = 'click',
      hidden = false,
      ariaLabel = 'Actions',
      className,
      ...rest
    },
    ref,
  ) {
    const isControlled = controlledOpen !== undefined;
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isOpen = isControlled ? controlledOpen : internalOpen;
    const rootRef = useRef<HTMLDivElement>(null);

    const setOpen = useCallback(
      (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
      },
      [isControlled, onOpenChange],
    );

    const toggle = useCallback(() => setOpen(!isOpen), [setOpen, isOpen]);

    // Close on Escape
    useEffect(() => {
      if (!isOpen) return;
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, setOpen]);

    // Close on click outside
    useEffect(() => {
      if (!isOpen) return;
      const handleClick = (e: MouseEvent) => {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
      };
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }, [isOpen, setOpen]);

    if (hidden) return null;

    const dirStyles = directionClasses[direction];
    const fabIcon = isOpen ? (openIcon ?? <CloseIcon className="h-6 w-6" />) : (icon ?? <PlusIcon className="h-6 w-6" />);

    return (
      <div
        ref={(el) => {
          (rootRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        {...stateAttrs({ component: 'speed-dial', state: isOpen ? 'open' : 'closed' })}
        className={cn('inline-flex items-center', dirStyles.container, className)}
        onMouseEnter={triggerMode === 'hover' ? () => setOpen(true) : undefined}
        onMouseLeave={triggerMode === 'hover' ? () => setOpen(false) : undefined}
        {...rest}
      >
        {/* FAB trigger */}
        <button
          type="button"
          onClick={triggerMode === 'click' ? toggle : undefined}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-(--motion-duration-medium)',
            'bg-action-primary text-text-inverse hover:brightness-110 active:scale-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-primary focus-visible:ring-offset-2',
            isOpen && 'rotate-0',
          )}
        >
          <span className={cn('transition-transform duration-(--motion-duration-medium)', isOpen && 'rotate-45')}>
            {fabIcon}
          </span>
        </button>

        {/* Actions */}
        {isOpen && (
          <div className={cn('flex items-center', dirStyles.container)} role="menu">
            {actions.map((action, i) => (
              <div key={i} className={cn('group relative flex items-center', dirStyles.item)}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { action.onClick?.(); setOpen(false); }}
                  disabled={action.disabled}
                  aria-label={action.label}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-all duration-(--motion-duration-fast)',
                    'bg-surface-panel text-text-primary border border-border-subtle',
                    'hover:bg-surface-muted hover:shadow-lg active:scale-95',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-primary',
                    action.disabled && 'pointer-events-none opacity-40',
                  )}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{action.icon}</span>
                </button>
                {/* Tooltip */}
                <span
                  className={cn(
                    'pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs',
                    'bg-text-primary text-surface-default shadow-md',
                    'opacity-0 group-hover:opacity-100 transition-opacity duration-(--motion-duration-fast)',
                    direction === 'up' || direction === 'down' ? 'right-full mr-2' : 'bottom-full mb-2',
                  )}
                  role="tooltip"
                >
                  {action.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);

SpeedDial.displayName = 'SpeedDial';
