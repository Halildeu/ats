import React, { useRef, useEffect } from "react";
import { cn } from "../../utils/cn";
import type { GalleryGroupProps } from "./types";

/* ------------------------------------------------------------------ */
/*  GalleryGroup — Collapsible group header + card grid                */
/* ------------------------------------------------------------------ */

/**
 * Collapsible section containing a group of gallery cards.
 *
 * - Chevron rotates on expand/collapse
 * - Animated max-height transition (200ms)
 * - Item count badge next to group name
 *
 * @example
 * ```tsx
 * <GalleryGroup name="HR" count={3} expanded onToggle={toggle}>
 *   <div className="grid grid-cols-3 gap-3">{cards}</div>
 * </GalleryGroup>
 * ```
 */
export const GalleryGroup: React.FC<GalleryGroupProps> = ({
  name,
  count,
  expanded,
  onToggle,
  children,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | undefined>(
    expanded ? undefined : 0,
  );

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (expanded) {
      setHeight(el.scrollHeight);
      // After transition, set to auto so dynamic content works
      const timer = setTimeout(() => setHeight(undefined), 200);
      return () => clearTimeout(timer);
    } else {
      // First set to current height, then to 0 for animation
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
        });
      });
    }
  }, [expanded]);

  return (
    <div data-component="gallery-group" data-group={name}>
      {/* Group header — clickable toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2.5",
          "bg-surface-muted border border-border-subtle/50",
          "text-start transition-colors duration-(--motion-duration-fast)",
          "hover:bg-surface-hover hover:border-border-subtle",
          "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-action-primary/40",
        )}
        aria-expanded={expanded}
      >
        {/* Chevron */}
        <svg
          className={cn(
            "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-(--motion-duration-medium)",
            expanded && "rotate-90",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Group name */}
        <span className="text-sm font-semibold text-text-primary">{name}</span>

        {/* Count badge */}
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
            "bg-surface-muted text-text-secondary",
          )}
        >
          {count}
        </span>

        {/* Decorative line */}
        <span className="flex-1 border-b border-border-subtle/70" />
      </button>

      {/* Collapsible content */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-(--motion-duration-medium) ease-in-out"
        style={{
          maxHeight: height === undefined ? "none" : `${height}px`,
        }}
        aria-hidden={!expanded}
      >
        <div className="px-2 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
};

GalleryGroup.displayName = "GalleryGroup";
