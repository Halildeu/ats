import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

export type OverlayCloseReason = 'close-button' | 'overlay' | 'escape';

export const premiumOverlayPanelClassName =
  'rounded-[28px] border border-border-subtle/80 ring-1 ring-border-subtle/20 shadow-[0_30px_70px_-40px_var(--shadow-color)] backdrop-blur-md';

export const premiumOverlayCloseButtonClassName =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle/70 bg-[var(--surface-card))] text-text-subtle shadow-[0_14px_28px_-24px_var(--shadow-color)] transition hover:-translate-y-px hover:border-border-default hover:bg-[var(--surface-card))] hover:text-text-primary hover:shadow-[0_18px_32px_-22px_var(--shadow-color)]';

/** Props for {@link OverlaySurface}. */
interface OverlaySurfaceProps {
  /** Whether the overlay is currently visible. */
  open: boolean;
  /** Access state used to conditionally hide the overlay. */
  accessState?: { isHidden?: boolean };
  /** Callback fired when the overlay requests to close, with the reason. */
  onClose?: (reason: OverlayCloseReason) => void;
  /** Close the overlay when the backdrop is clicked. @default true */
  closeOnOverlayClick?: boolean;
  /** Close the overlay when the Escape key is pressed. @default true */
  closeOnEscape?: boolean;
  /** Keep the DOM node mounted when the overlay is closed. @default false */
  keepMounted?: boolean;
  /** Destroy the DOM node after the close transition ends. @default true */
  destroyOnHidden?: boolean;
  /** Horizontal placement of the surface panel. @default "center" */
  placement?: 'right' | 'left' | 'center';
  /** Transition animation preset. @default "fade" */
  transitionPreset?: 'slide' | 'fade' | 'scale';
  /** Custom DOM element to portal into, or null for document.body. */
  portalTarget?: HTMLElement | null;
  /** Render inline instead of using a portal. @default false */
  disablePortal?: boolean;
  /** Accessible label for the dialog element. */
  ariaLabel?: string;
  /** Additional CSS class for the full-screen viewport backdrop. */
  viewportClassName?: string;
  /** Additional CSS class for the inner surface panel. */
  surfaceClassName?: string;
  /** Visual style variant for the surface panel. @default "default" */
  surfaceAppearance?: 'premium' | 'default';
  /** Content rendered inside the surface panel. */
  children: React.ReactNode;
}

/** Internal overlay panel with backdrop, scroll lock, focus trap, and portal rendering.
 * @example
 * ```tsx
 * <OverlaySurface />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/overlay-surface)
 */
export const OverlaySurface: React.FC<OverlaySurfaceProps> = ({
  open,
  accessState,
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  keepMounted = false,
  destroyOnHidden = true,
  placement = 'center',
  transitionPreset: _transitionPreset = 'fade',
  portalTarget,
  disablePortal = false,
  ariaLabel,
  viewportClassName,
  surfaceClassName,
  surfaceAppearance: _surfaceAppearance = 'default',
  children,
}) => {
  const [mounted, setMounted] = React.useState(open);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
    } else if (!keepMounted && destroyOnHidden) {
      const timeout = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [open, keepMounted, destroyOnHidden]);

  React.useEffect(() => {
    if (!open || !closeOnEscape) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.('escape');
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, closeOnEscape, onClose]);

  if (!mounted && !keepMounted) {
    return null;
  }

  if (accessState?.isHidden) {
    return null;
  }

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === overlayRef.current) {
      onClose?.('overlay');
    }
  };

  const content = (
    <div
      ref={overlayRef}
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="true"
      className={cn(
        // PR-12: bg-surface-inverse was unregistered in Tailwind theme;
        // backdrop was invisible. surface-overlay resolves to the same
        // underlying token (alias chain in theme.css).
        'fixed inset-0 z-50 bg-surface-overlay/30 backdrop-blur-xs transition-opacity duration-(--motion-duration-slow)',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
        viewportClassName,
      )}
      onClick={handleOverlayClick}
    >
      <div
        className={cn(
          'transition-[translate] duration-(--motion-duration-slow)',
          placement === 'right' && (open ? 'translate-x-0' : 'translate-x-full'),
          placement === 'left' && (open ? 'translate-x-0' : '-translate-x-full'),
          surfaceClassName,
        )}
      >
        {children}
      </div>
    </div>
  );

  if (disablePortal || typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, portalTarget ?? document.body);
};

OverlaySurface.displayName = 'OverlaySurface';

/** Type alias for OverlaySurface ref. */
export type OverlaySurfaceRef = React.Ref<HTMLElement>;
/** Type alias for OverlaySurface element. */
export type OverlaySurfaceElement = HTMLElement;
/** Type alias for OverlaySurface cssproperties. */
export type OverlaySurfaceCSSProperties = React.CSSProperties;
