import React, { useRef } from 'react';
import { cn } from '../../utils/cn';
import { useSidebar } from './useSidebar';
import type { AppSidebarSearchProps as AppSidebarSearchPropsBase } from './types';
import type { AccessControlledProps } from '../../internal/access-controller';

/**
 * Search input slot for the AppSidebar compound component. Shows a full text
 * input with keyboard shortcut hint when expanded, and a search icon button
 * when collapsed.
 *
 * @example
 * ```tsx
 * <AppSidebar.Search
 *   placeholder="Search navigation..."
 *   shortcut="Cmd+K"
 *   value={query}
 *   onChange={setQuery}
 * />
 * ```
 *
 * @since 1.0.0
 * @see AppSidebar
 */
export const AppSidebarSearch = React.forwardRef<HTMLDivElement, AppSidebarSearchPropsBase & AccessControlledProps>(({
  value,
  onChange,
  placeholder = 'Search...',
  shortcut,
  className,
  access,
}, ref) => {
  if (access === 'hidden') return null;

  const { isCollapsed } = useSidebar();
  const inputRef = useRef<HTMLInputElement>(null);

  if (isCollapsed) {
    return (
      <div ref={ref} className={cn('flex justify-center px-2 py-2', className)}>
        <button
          type="button"
          className={cn(
            'group relative flex h-8 w-8 items-center justify-center rounded-md',
            'text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]',
            'transition-colors duration-(--motion-duration-medium) outline-hidden',
            'focus-visible:ring-2 focus-visible:ring-[var(--action-primary)]',
          )}
          onClick={() => {
            /* In collapsed mode a click could expand + focus; consumers can wire this up */
          }}
          aria-label={placeholder}
        >
          <SearchIcon />
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none absolute left-full ml-2 z-50',
              'whitespace-nowrap rounded-md px-2 py-1 text-xs',
              'bg-[var(--text-primary)] text-[var(--surface-default)]',
              'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
              'transition-opacity duration-(--motion-duration-fast)',
            )}
          >
            {placeholder}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('px-3 py-2', className)}>
      <label className="relative flex items-center">
        <span className="absolute left-2 text-[var(--text-secondary)]">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'h-8 w-full rounded-md border border-[var(--border-subtle)]',
            'bg-[var(--surface-default)] pl-8 pr-8 text-sm',
            'text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]',
            'outline-hidden transition-colors duration-(--motion-duration-medium)',
            'focus:border-[var(--action-primary)] focus:ring-1 focus:ring-[var(--action-primary)]',
          )}
        />
        {shortcut && (
          <kbd
            className={cn(
              'absolute right-2 rounded border border-[var(--border-subtle)]',
              'bg-[var(--surface-canvas)] px-1.5 py-0.5 text-[10px]',
              'font-mono text-[var(--text-secondary)]',
            )}
          >
            {shortcut}
          </kbd>
        )}
      </label>
    </div>
  );
});

AppSidebarSearch.displayName = 'AppSidebar.Search';

/* ------------------------------------------------------------------ */
/*  Inline search icon (avoids external icon dependency)               */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

/** Props for the AppSidebarSearch component. */
export interface AppSidebarSearchProps extends AppSidebarSearchPropsBase {}

/** Ref type for AppSidebarSearch. */
export type AppSidebarSearchRef = React.Ref<HTMLDivElement>;
/** Element type for AppSidebarSearch. */
export type AppSidebarSearchElement = HTMLDivElement;
/** CSS properties type for AppSidebarSearch. */
export type AppSidebarSearchCSSProperties = React.CSSProperties;
