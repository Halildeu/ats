import type React from "react";

/* ------------------------------------------------------------------ */
/*  GroupedCardGallery — Types & Interfaces                            */
/* ------------------------------------------------------------------ */

/**
 * Base item rendered inside the gallery.
 * Consumers extend this to add domain-specific fields.
 */
export interface GalleryItem {
  /** Unique identifier */
  id: string;
  /** Card title (1 line, truncated) */
  title: string;
  /** Card description (2 lines, clamped) */
  description?: string;
  /** Group key — items with the same value are grouped together */
  group: string;
  /** Leading icon — ReactNode or emoji string */
  icon?: string | React.ReactNode;
  /** Searchable tags */
  tags?: string[];
  /** Optional badge shown at top-right */
  badge?: { label: string; tone?: string };
  /** Navigation target (used by onItemClick) */
  route?: string;
}

/** Responsive column configuration */
export interface GalleryColumns {
  /** < 640px @default 1 */
  sm?: number;
  /** 640-1024px @default 2 */
  md?: number;
  /** 1024-1280px @default 3 */
  lg?: number;
  /** > 1280px @default 4 */
  xl?: number;
}

export interface GroupedCardGalleryProps<T extends GalleryItem = GalleryItem> {
  /** All items — automatically grouped by `groupBy` field */
  items: T[];
  /** Field used for grouping. @default "group" */
  groupBy?: keyof T & string;
  /** Fields searched during filtering. @default ["title", "description", "tags"] */
  searchFields?: (keyof T & string)[];
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Groups expanded on first render. @default first 2 groups */
  defaultExpandedGroups?: string[];
  /** Group display order — array of group keys or comparator */
  groupOrder?: string[] | ((a: string, b: string) => number);
  /** Fired when a card is clicked */
  onItemClick?: (item: T) => void;
  /** Custom card renderer (overrides default GalleryCard) */
  renderCard?: (item: T) => React.ReactNode;
  /** Custom empty state when search yields no results */
  emptyState?: React.ReactNode;
  /** Summary line formatter (e.g. "12 rapor · 4 dashboard") */
  summaryFormatter?: (allItems: T[], filteredItems: T[]) => string;
  /** localStorage key for persisting expand/collapse state */
  storageKey?: string;
  /** Responsive column counts */
  columns?: GalleryColumns;
  /** Additional className on root */
  className?: string;
}

/* -- Sub-component props ------------------------------------------- */

export interface GallerySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  summary?: string;
}

export interface GalleryGroupProps {
  /** Group display name */
  name: string;
  /** Number of items in the group */
  count: number;
  /** Whether the group is expanded */
  expanded: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Content rendered when expanded */
  children: React.ReactNode;
}

export interface GalleryCardProps {
  item: GalleryItem;
  onClick?: () => void;
}
