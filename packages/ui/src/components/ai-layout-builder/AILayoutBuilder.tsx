import React, { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  AILayoutBuilder — AI-powered adaptive layout engine                */
/*                                                                     */
/*  Dynamically arranges content blocks based on intent, priority,     */
/*  and data shape. Supports drag-and-drop, collapsible sections,      */
/*  responsive columns, and dark mode via CSS variables.               */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

/** Describes a single content block within the AI layout grid.
 * @example
 * ```tsx
 * <AILayoutBuilder />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/a-i-layout-builder)
 */
export type LayoutBlock = {
  /** Unique identifier for this block. */
  key: string;
  /** Semantic block type used for intent-based ordering. */
  type:
    | "metric"
    | "chart"
    | "table"
    | "list"
    | "form"
    | "text"
    | "action"
    | "custom";
  /** Optional heading displayed above the block content. */
  title?: string;
  /** Sorting priority within the layout. @default "medium" */
  priority?: "high" | "medium" | "low";
  /** Number of grid columns this block should span. */
  span?: 1 | 2 | 3 | 4;
  /** The React content rendered inside the block card. */
  content: React.ReactNode;
  /** Whether the block can be collapsed by the user. */
  collapsible?: boolean;
  /** Whether the block starts in collapsed state. */
  defaultCollapsed?: boolean;
};

export type LayoutIntent =
  | "overview"
  | "detail"
  | "comparison"
  | "workflow"
  | "monitoring";

export type LayoutDensity = "comfortable" | "compact" | "spacious";

/**
 * AILayoutBuilder dynamically arranges content blocks based on intent, priority,
 * and data shape with drag-and-drop, collapsible sections, and responsive columns.
 */
export interface AILayoutBuilderProps extends AccessControlledProps {
  /** Array of content blocks to render in the grid. */
  blocks: LayoutBlock[];
  /** Layout intent that controls block ordering and span heuristics. @default "overview" */
  intent?: LayoutIntent;
  /** Maximum number of grid columns. @default 3 */
  columns?: 1 | 2 | 3 | 4;
  /** Spacing density for the grid and block cards. @default "comfortable" */
  density?: LayoutDensity;
  /** Callback fired after a drag-and-drop reorder with the new key order. */
  onBlockReorder?: (keys: string[]) => void;
  /** Callback fired when a block's collapsed state changes. */
  onBlockToggle?: (key: string, collapsed: boolean) => void;
  /** Enable drag-and-drop reordering of blocks. @default false */
  draggable?: boolean;
  /** Optional section heading. */
  title?: string;
  /** Optional subtitle below the heading. */
  description?: string;
  /** Additional CSS class name. */
  className?: string;
}

/* ---- Constants ---- */

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Intent-based type ordering — which block types come first per intent */
const INTENT_TYPE_ORDER: Record<LayoutIntent, string[]> = {
  overview: ["metric", "chart", "table", "list", "text", "action", "form", "custom"],
  detail: ["text", "form", "table", "chart", "metric", "list", "action", "custom"],
  comparison: ["chart", "table", "metric", "list", "text", "form", "action", "custom"],
  workflow: ["action", "form", "text", "list", "table", "metric", "chart", "custom"],
  monitoring: ["metric", "chart", "list", "table", "text", "action", "form", "custom"],
};

/** Intent-based span hints — detail makes first block span wide */
const resolveSpan = (
  block: LayoutBlock,
  intent: LayoutIntent,
  index: number,
  columns: number,
): number => {
  if (block.span) return Math.min(block.span, columns);
  if (intent === "detail" && index === 0) return Math.min(columns, 4);
  if (intent === "overview" && block.type === "metric") return 1;
  if (intent === "comparison" && block.type === "chart") return Math.min(2, columns);
  return 1;
};

const densityGap: Record<LayoutDensity, string> = {
  comfortable: "gap-5",
  compact: "gap-3",
  spacious: "gap-7",
};

const densityPadding: Record<LayoutDensity, string> = {
  comfortable: "p-5",
  compact: "p-3",
  spacious: "p-6",
};

const _SKELETON_PULSE =
  "animate-pulse rounded-lg bg-surface-muted";

/* ---- Helpers ---- */

const sortBlocksByIntent = (
  blocks: LayoutBlock[],
  intent: LayoutIntent,
): LayoutBlock[] => {
  const typeOrder = INTENT_TYPE_ORDER[intent];
  return [...blocks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? "medium"] ?? 1;
    const pb = PRIORITY_ORDER[b.priority ?? "medium"] ?? 1;
    if (pa !== pb) return pa - pb;
    const ta = typeOrder.indexOf(a.type);
    const tb = typeOrder.indexOf(b.type);
    return ta - tb;
  });
};

/* ---- Sub-components ---- */

const BlockCard: React.FC<{
  block: LayoutBlock;
  collapsed: boolean;
  onToggle?: (key: string, collapsed: boolean) => void;
  density: LayoutDensity;
  draggable: boolean;
  onDragStart?: (e: React.DragEvent, key: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, key: string) => void;
}> = ({
  block,
  collapsed,
  onToggle,
  density,
  draggable: isDraggable,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const canCollapse = block.collapsible === true;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-subtle/80 bg-[var(--surface-card))] shadow-xs transition-all duration-(--motion-duration-medium)",
        densityPadding[density],
        isDraggable && "cursor-grab active:cursor-grabbing",
      )}
      data-block-key={block.key}
      data-block-type={block.type}
      draggable={isDraggable}
      onDragStart={(e) => onDragStart?.(e, block.key)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop?.(e, block.key)}
      role="region"
      aria-label={block.title ?? block.key}
    >
      {/* Header */}
      {(block.title || canCollapse) && (
        <div className="mb-3 flex items-center justify-between">
          {block.title && (
            <h3 className="text-sm font-semibold text-text-primary">
              {block.title}
            </h3>
          )}
          {canCollapse && (
            <button
              type="button"
              onClick={() => onToggle?.(block.key, !collapsed)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted"
              aria-expanded={!collapsed}
              aria-label={
                collapsed
                  ? `${block.title ?? block.key} genislet`
                  : `${block.title ?? block.key} daralt`
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
                className={cn(
                  "transition-[rotate] duration-(--motion-duration-medium)",
                  collapsed && "-rotate-90",
                )}
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {!collapsed && (
        <div className="transition-all duration-(--motion-duration-medium)">{block.content}</div>
      )}
    </div>
  );
};

/* ---- Main Component ---- */

export const AILayoutBuilder = React.forwardRef<HTMLDivElement, AILayoutBuilderProps>(({
  blocks,
  intent = "overview",
  columns = 3,
  density = "comfortable",
  onBlockReorder,
  onBlockToggle,
  draggable = false,
  title,
  description,
  className,
  access = "full",
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  /* Collapse state */
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    blocks.forEach((b) => {
      if (b.defaultCollapsed) initial.add(b.key);
    });
    return initial;
  });

  const handleToggle = useCallback(
    (key: string, collapsed: boolean) => {
      setCollapsedKeys((prev) => {
        const next = new Set(prev);
        if (collapsed) next.add(key);
        else next.delete(key);
        return next;
      });
      onBlockToggle?.(key, collapsed);
    },
    [onBlockToggle],
  );

  /* Drag state */
  const dragKeyRef = useRef<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, key: string) => {
      if (!draggable) return;
      dragKeyRef.current = key;
      e.dataTransfer.effectAllowed = "move";
    },
    [draggable],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, targetKey: string) => {
      const srcKey = dragKeyRef.current;
      if (!srcKey || srcKey === targetKey || !onBlockReorder) return;
      const keys = sortedBlocks.map((b) => b.key);
      const srcIdx = keys.indexOf(srcKey);
      const tgtIdx = keys.indexOf(targetKey);
      if (srcIdx === -1 || tgtIdx === -1) return;
      keys.splice(srcIdx, 1);
      keys.splice(tgtIdx, 0, srcKey);
      onBlockReorder(keys);
      dragKeyRef.current = null;
    },
    [onBlockReorder, blocks],
  );

  /* Sort blocks */
  const sortedBlocks = useMemo(
    () => sortBlocksByIntent(blocks, intent),
    [blocks, intent],
  );

  /** Map desired column count to a minmax breakpoint for auto-fit. */
  const gridMinWidth: Record<number, number> = {
    1: 9999,
    2: 280,
    3: 220,
    4: 200,
  };

  return (
    <section
      className={cn("flex flex-col gap-4", className)}
      data-access-state={accessState.state}
      data-component="ai-layout-builder"
      data-intent={intent}
      title={accessReason}
    >
      {/* Header */}
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && (
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-text-secondary">
              {description}
            </p>
          )}
        </div>
      )}

      {/* Grid */}
      <div
        className={cn("grid", densityGap[density])}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${gridMinWidth[columns]}px, 100%), 1fr))` }}
        role="list"
        aria-label={title ?? "Blok duzen"}
      >
        {sortedBlocks.map((block, index) => {
          const span = resolveSpan(block, intent, index, columns);
          return (
            <div
              key={block.key}
              className="col-span-1"
              style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
              role="listitem"
            >
              <BlockCard
                block={block}
                collapsed={collapsedKeys.has(block.key)}
                onToggle={handleToggle}
                density={density}
                draggable={draggable}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
});

AILayoutBuilder.displayName = "AILayoutBuilder";

export default AILayoutBuilder;
