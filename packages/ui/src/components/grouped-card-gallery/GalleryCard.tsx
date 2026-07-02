import React from "react";
import { cn } from "../../utils/cn";
import type { GalleryCardProps } from "./types";

/* ------------------------------------------------------------------ */
/*  GalleryCard — Default card rendered inside each gallery group       */
/* ------------------------------------------------------------------ */

const badgeToneStyles: Record<string, string> = {
  default: "bg-surface-muted text-text-secondary",
  primary: "bg-action-primary/10 text-action-primary",
  success: "bg-state-success-bg text-state-success-text",
  warning: "bg-state-warning-bg text-state-warning-text",
  error: "bg-state-danger-bg text-state-danger-text",
  info: "bg-state-info-bg text-state-info-text",
};

/**
 * Default card component for the GroupedCardGallery.
 *
 * Renders an icon, title, description, badge, and tags.
 * Hoverable with subtle border highlight and shadow lift.
 *
 * @example
 * ```tsx
 * <GalleryCard
 *   item={{ id: "1", title: "Users", group: "HR", icon: "👤" }}
 *   onClick={() => navigate("/reports/users")}
 * />
 * ```
 */
export const GalleryCard: React.FC<GalleryCardProps> = ({ item, onClick }) => {
  const { title, description, icon, badge, tags } = item;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full flex-col items-start gap-2 rounded-2xl p-4 text-start",
        "border border-border-subtle bg-surface-default",
        "transition-all duration-(--motion-duration-fast)",
        "hover:border-action-primary/30 hover:shadow-md",
        "active:scale-[0.99]",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-action-primary/40",
      )}
      data-component="gallery-card"
    >
      {/* Badge — top-right */}
      {badge && (
        <span
          className={cn(
            "absolute end-3 top-3 rounded-md px-2 py-0.5 text-[10px] font-medium",
            badgeToneStyles[badge.tone ?? "default"],
          )}
        >
          {badge.label}
        </span>
      )}

      {/* Icon */}
      {icon && (
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            "bg-surface-muted text-base",
          )}
        >
          {typeof icon === "string" ? icon : icon}
        </span>
      )}

      {/* Title */}
      <span className="line-clamp-1 text-sm font-semibold text-text-primary">
        {title}
      </span>

      {/* Description */}
      {description && (
        <span className="line-clamp-2 text-xs text-text-secondary">
          {description}
        </span>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px]",
                "bg-surface-muted text-text-secondary",
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
};

GalleryCard.displayName = "GalleryCard";
