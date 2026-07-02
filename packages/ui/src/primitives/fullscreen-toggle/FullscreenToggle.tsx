import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  FullscreenToggle — Enter / exit browser fullscreen                 */
/* ------------------------------------------------------------------ */

export type FullscreenToggleSize = 'sm' | 'md' | 'lg';
export type FullscreenToggleVariant = 'ghost' | 'outline';

export interface FullscreenToggleProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** Button size. @default "md" */
  size?: FullscreenToggleSize;
  /** Visual variant. @default "ghost" */
  variant?: FullscreenToggleVariant;
  /** Show text label beside icon. @default true */
  showLabel?: boolean;
  /** Label when not fullscreen. @default "Fullscreen" */
  expandLabel?: string;
  /** Label when fullscreen. @default "Exit Fullscreen" */
  collapseLabel?: string;
  /** Callback after fullscreen state changes. */
  onToggle?: (isFullscreen: boolean) => void;
}

/* ---- Inline SVG icons (no lucide dependency) ---- */

const MaximizeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const MinimizeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const sizeStyles: Record<FullscreenToggleSize, string> = {
  sm: 'h-8 text-xs gap-1.5',
  md: 'h-9 text-sm gap-2',
  lg: 'h-10 text-sm gap-2',
};

const iconSizeStyles: Record<FullscreenToggleSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-[18px] w-[18px]',
  lg: 'h-5 w-5',
};

const variantStyles: Record<FullscreenToggleVariant, string> = {
  ghost: 'bg-transparent hover:bg-surface-muted text-text-secondary hover:text-text-primary',
  outline:
    'border border-border-subtle bg-surface-default hover:bg-surface-muted text-text-secondary hover:text-text-primary',
};

/**
 * FullscreenToggle renders a button that toggles browser fullscreen mode.
 * Manages its own fullscreen state via the Fullscreen API.
 *
 * @example
 * ```tsx
 * <FullscreenToggle />
 * <FullscreenToggle showLabel={false} variant="outline" />
 * ```
 */
export const FullscreenToggle = forwardRef<HTMLButtonElement, FullscreenToggleProps>(
  function FullscreenToggle(
    {
      size = 'md',
      variant = 'ghost',
      showLabel = true,
      expandLabel = 'Fullscreen',
      collapseLabel = 'Exit Fullscreen',
      onToggle,
      className,
      ...rest
    },
    ref,
  ) {
    const [isFs, setIsFs] = useState(
      typeof document !== 'undefined' ? !!document.fullscreenElement : false,
    );

    useEffect(() => {
      if (typeof document === 'undefined') return;
      const handler = () => {
        const next = !!document.fullscreenElement;
        setIsFs(next);
        onToggle?.(next);
      };
      document.addEventListener('fullscreenchange', handler);
      return () => document.removeEventListener('fullscreenchange', handler);
    }, [onToggle]);

    const toggle = useCallback(() => {
      if (typeof document === 'undefined') return;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }, []);

    const label = isFs ? collapseLabel : expandLabel;
    const Icon = isFs ? MinimizeIcon : MaximizeIcon;

    return (
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        {...stateAttrs({ component: 'fullscreen-toggle' })}
        data-fullscreen={isFs ? 'true' : 'false'}
        title={label}
        aria-label={label}
        className={cn(
          'inline-flex items-center rounded-xl transition',
          sizeStyles[size],
          variantStyles[variant],
          showLabel ? 'px-3' : 'justify-center px-2',
          className,
        )}
        {...rest}
      >
        <Icon className={iconSizeStyles[size]} />
        {showLabel && <span className="flex-1">{label}</span>}
      </button>
    );
  },
);

FullscreenToggle.displayName = 'FullscreenToggle';
