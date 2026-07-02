import React, { useCallback } from "react";
import { cn } from "../../utils/cn";
import type { GallerySearchBarProps } from "./types";

/* ------------------------------------------------------------------ */
/*  GallerySearchBar — Search input + summary line                     */
/* ------------------------------------------------------------------ */

/**
 * Debounced search bar with clear button and an optional summary line.
 *
 * @example
 * ```tsx
 * <GallerySearchBar
 *   value={query}
 *   onChange={setQuery}
 *   placeholder="Rapor ara..."
 *   summary="12 rapor · 4 dashboard"
 * />
 * ```
 */
export const GallerySearchBar: React.FC<GallerySearchBarProps> = ({
  value,
  onChange,
  placeholder = "Search...",
  summary,
}) => {
  const hasValue = value.length > 0;

  const handleClear = useCallback(() => {
    onChange("");
  }, [onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full">
        {/* Search icon */}
        <svg
          className={cn(
            "pointer-events-none absolute start-3 top-1/2 -translate-y-1/2",
            "h-4 w-4 text-text-secondary",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M11.5 11.5L14 14M1 7a6 6 0 1012 0A6 6 0 001 7z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>

        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-xl border transition-colors duration-(--motion-duration-fast)",
            "h-9 ps-9 pe-9 text-sm",
            "bg-[var(--surface-canvas)] text-text-primary",
            "border-border-subtle",
            "placeholder:text-[var(--text-disabled)]",
            "focus:border-action-primary focus:outline-hidden focus:ring-2 focus:ring-action-primary/20",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
          aria-label={placeholder}
        />

        {/* Clear button */}
        {hasValue && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "absolute end-2.5 top-1/2 -translate-y-1/2",
              "rounded-xs p-0.5 text-text-secondary transition hover:text-text-primary",
            )}
            aria-label="Clear search"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
              <path
                d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Summary line */}
      {summary && (
        <p className="px-1 text-xs text-text-secondary">{summary}</p>
      )}
    </div>
  );
};

GallerySearchBar.displayName = "GallerySearchBar";
