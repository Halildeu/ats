import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  CommandPaletteTrigger — Search / command palette trigger button     */
/* ------------------------------------------------------------------ */

export interface CommandPaletteTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** Placeholder text shown in expanded mode. @default "Search…" */
  placeholder?: string;
  /** Keyboard shortcut hint (e.g. "Ctrl+K"). */
  shortcut?: string;
  /** Icon-only compact mode. @default false */
  compact?: boolean;
  /** Override the default search icon. */
  icon?: React.ReactNode;
}

/* ---- Inline search icon ---- */

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/**
 * CommandPaletteTrigger renders a search-style button that opens a
 * command palette or search modal. Displays a placeholder, keyboard
 * shortcut badge, and collapses to icon-only in compact mode.
 *
 * @example
 * ```tsx
 * <CommandPaletteTrigger onClick={openSearch} shortcut="Ctrl+K" />
 * <CommandPaletteTrigger compact onClick={openSearch} />
 * ```
 */
export const CommandPaletteTrigger = forwardRef<HTMLButtonElement, CommandPaletteTriggerProps>(
  function CommandPaletteTrigger(
    { placeholder = 'Search\u2026', shortcut, compact = false, icon, className, ...rest },
    ref,
  ) {
    const searchIcon = icon ?? <SearchIcon className="h-[18px] w-[18px]" />;

    return (
      <button
        ref={ref}
        type="button"
        {...stateAttrs({ component: 'command-palette-trigger' })}
        title={shortcut ? `${placeholder} (${shortcut})` : placeholder}
        aria-label={placeholder}
        className={cn(
          'flex w-full items-center gap-2 rounded-2xl border border-border-subtle bg-surface-default text-sm text-text-secondary shadow-xs transition',
          'hover:bg-surface-muted hover:text-text-primary',
          compact ? 'justify-center px-2 py-2' : 'px-3 py-2 text-left',
          className,
        )}
        {...rest}
      >
        {searchIcon}
        {!compact && (
          <>
            <span className="flex-1">{placeholder}</span>
            {shortcut && (
              <kbd className="rounded-lg border border-border-subtle bg-surface-panel px-2 py-0.5 text-[10px] font-semibold text-text-subtle">
                {shortcut}
              </kbd>
            )}
          </>
        )}
      </button>
    );
  },
);

CommandPaletteTrigger.displayName = 'CommandPaletteTrigger';
