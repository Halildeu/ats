import React, { useMemo, useState } from "react";
import {
  resolveAccessState, _accessStyles,
  shouldBlockInteraction,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { Badge, type BadgeVariant } from "../../primitives/badge/Badge";
import { EmptyState as Empty } from "../empty-state/EmptyState";
import { Skeleton } from "../../primitives/skeleton/Skeleton";
import { Text } from "../../primitives/text/Text";

/* ------------------------------------------------------------------ */
/*  Tree — Hierarchical node display with expand/collapse             */
/* ------------------------------------------------------------------ */

export type TreeDensity = "comfortable" | "compact";
export type TreeTone = "default" | "info" | "success" | "warning" | "danger";

export type TreeNode = {
  key: React.Key;
  label: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  badges?: Array<React.ReactNode | string>;
  tone?: TreeTone;
  disabled?: boolean;
  children?: TreeNode[];
};

export interface TreeLocaleText {
  emptyStateLabel?: React.ReactNode;
  emptyFallbackDescription?: React.ReactNode;
  expandNodeAriaLabel?: string;
  collapseNodeAriaLabel?: string;
}

/** Props for the Tree component. */
export interface TreeProps extends AccessControlledProps {
  /** Hierarchical node data to display. */
  nodes: TreeNode[];
  /** Heading text above the tree. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Node spacing density variant. */
  density?: TreeDensity;
  /** Label shown when the tree is empty. */
  emptyStateLabel?: React.ReactNode;
  /** Whether to show loading skeleton placeholders. */
  loading?: boolean;
  /** Key of the currently selected node. */
  selectedKey?: React.Key | null;
  /** Callback fired when a node is selected. */
  onNodeSelect?: (key: React.Key) => void;
  /** Initially expanded node keys for uncontrolled mode. */
  defaultExpandedKeys?: React.Key[];
  /** Controlled set of expanded node keys. */
  expandedKeys?: React.Key[];
  /** Callback fired when expanded keys change. */
  onExpandedKeysChange?: (keys: React.Key[]) => void;
  /** Whether the tree spans the full container width. */
  fullWidth?: boolean;
  /** Locale-specific label overrides. */
  localeText?: TreeLocaleText;
}

const densityClass: Record<TreeDensity, string> = {
  comfortable: "px-4 py-3.5",
  compact: "px-4 py-2.5",
};

const toneClass: Record<TreeTone, string> = {
  default: "border-border-subtle bg-surface-default",
  info: "border-state-info-border bg-surface-muted",
  success: "border-state-success-border bg-surface-muted",
  warning: "border-state-warning-border bg-surface-muted",
  danger: "border-state-danger-border bg-surface-muted",
};

const badgeToneMap: Record<TreeTone, BadgeVariant> = {
  default: "default",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const flattenKeys = (nodes: TreeNode[]): React.Key[] =>
  nodes.flatMap((node) => [node.key, ...(node.children ? flattenKeys(node.children) : [])]);

/**
 * Hierarchical tree view with expand/collapse, selection, badges, and tone-based node styling.
 *
 * @example
 * ```tsx
 * <Tree
 *   nodes={[
 *     { key: 'src', label: 'src', children: [
 *       { key: 'index', label: 'index.tsx' },
 *       { key: 'app', label: 'App.tsx' },
 *     ]},
 *   ]}
 *   onNodeSelect={(key) => openFile(key)}
 * />
 * ```
 */
export const Tree = React.forwardRef<HTMLElement, TreeProps>(({
  nodes,
  title,
  description,
  density = "comfortable",
  emptyStateLabel,
  loading = false,
  selectedKey = null,
  onNodeSelect,
  defaultExpandedKeys = [],
  expandedKeys,
  onExpandedKeysChange,
  fullWidth = true,
  localeText,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<React.Key[]>(defaultExpandedKeys);
  const resolvedEmptyStateLabel = emptyStateLabel ?? localeText?.emptyStateLabel ?? "No records found for this tree.";
  const resolvedEmptyFallbackDescription =
    localeText?.emptyFallbackDescription ??
    (typeof resolvedEmptyStateLabel === "string" ? resolvedEmptyStateLabel : "No records found.");
  const expandNodeAriaLabel = localeText?.expandNodeAriaLabel ?? "Expand branch";
  const collapseNodeAriaLabel = localeText?.collapseNodeAriaLabel ?? "Collapse branch";

  const allKeys = useMemo(() => new Set(flattenKeys(nodes)), [nodes]);
  const effectiveExpandedKeys = useMemo(
    () => (expandedKeys ?? internalExpandedKeys).filter((key) => allKeys.has(key)),
    [allKeys, expandedKeys, internalExpandedKeys],
  );
  const expandedKeySet = useMemo(() => new Set(effectiveExpandedKeys), [effectiveExpandedKeys]);

  if (accessState.isHidden) {
    return null;
  }

  const updateExpandedKeys = (nextKeys: React.Key[]) => {
    const unique = Array.from(new Set(nextKeys)).filter((key) => allKeys.has(key));
    if (!expandedKeys) {
      setInternalExpandedKeys(unique);
    }
    onExpandedKeysChange?.(unique);
  };

  const toggleNode = (nodeKey: React.Key) => {
    if (expandedKeySet.has(nodeKey)) {
      updateExpandedKeys(effectiveExpandedKeys.filter((key) => key !== nodeKey));
      return;
    }
    updateExpandedKeys([...effectiveExpandedKeys, nodeKey]);
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const tone = node.tone ?? "default";
    const hasChildren = (node.children?.length ?? 0) > 0;
    const expanded = hasChildren ? expandedKeySet.has(node.key) : false;
    const selected = selectedKey === node.key;
    const blocked = shouldBlockInteraction(accessState.state, node.disabled);

    return (
      <li key={node.key} className="flex flex-col gap-2">
        <div
          className={[
            "rounded-[24px] border shadow-xs transition-colors",
            toneClass[tone],
            depth > 0 ? "ms-0" : "",
            selected ? "ring-2 ring-state-info-border/60" : "",
          ].join(" ")}
          data-selected={selected ? "true" : "false"}
        >
          <div className={[densityClass[density], depth > 0 ? "bg-surface-muted/70" : ""].filter(Boolean).join(" ")}>
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 pt-1">
                {hasChildren ? (
                  <button
                    type="button"
                    className="inline-flex size-7 items-center justify-center rounded-full border border-border-subtle bg-surface-default text-sm text-text-secondary transition hover:bg-surface-muted"
                    aria-label={expanded ? collapseNodeAriaLabel : expandNodeAriaLabel}
                    aria-expanded={expanded}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleNode(node.key);
                    }}
                  >
                    {expanded ? "\u25BE" : "\u25B8"}
                  </button>
                ) : (
                  <span className="inline-flex size-7 items-center justify-center rounded-full border border-border-subtle bg-surface-default text-[10px] font-semibold uppercase text-text-subtle">
                    {"\u2022"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className={[
                    "w-full rounded-2xl px-1 text-left transition-colors",
                    blocked ? "cursor-not-allowed opacity-70" : onNodeSelect ? "hover:bg-surface-default/80 active:bg-surface-default" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) => {
                    if (blocked) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    onNodeSelect?.(node.key);
                    if (!onNodeSelect && hasChildren) {
                      toggleNode(node.key);
                    }
                  }}
                  aria-current={selected ? "true" : undefined}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text as="div" className="min-w-0 text-sm font-semibold text-text-primary" style={{ textWrap: "pretty" } as React.CSSProperties}>
                          {node.label}
                        </Text>
                        {node.badges?.map((badge, badgeIndex) =>
                          typeof badge === "string" ? (
                            <Badge key={`${node.key}-badge-${badgeIndex}`} variant={badgeToneMap[tone]}>
                              {badge}
                            </Badge>
                          ) : (
                            <React.Fragment key={`${node.key}-badge-${badgeIndex}`}>{badge}</React.Fragment>
                          ),
                        )}
                      </div>
                      {node.description ? (
                        <Text variant="secondary" className="block text-sm leading-6" style={{ textWrap: "pretty" } as React.CSSProperties}>
                          {node.description}
                        </Text>
                      ) : null}
                    </div>
                    {node.meta ? (
                      <Text variant="secondary" className="text-xs font-medium uppercase tracking-[0.16em]">
                        {node.meta}
                      </Text>
                    ) : null}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {hasChildren && expanded ? (
          <ul className="flex flex-col gap-2 border-s border-border-subtle/70 ps-4">
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <section
      ref={ref}
      className={fullWidth ? "w-full" : undefined}
      data-access-state={accessState.state}
      data-component="tree"
      data-loading={loading ? "true" : "false"}
      title={accessReason}
    >
      {title ? (
        <Text as="div" className="text-base font-semibold text-text-primary">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="secondary" className="mt-1 block text-sm leading-6">
          {description}
        </Text>
      ) : null}

      <div className="mt-4 rounded-[26px] border border-border-subtle bg-surface-muted p-4 shadow-xs">
        {loading ? (
          <div className="flex flex-col gap-3" data-testid="tree-loading-state">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`tree-loading-${index}`} className="rounded-[22px] border border-border-subtle bg-surface-default px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <Skeleton circle height={32} className="shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1 gap-2">
                    <Skeleton lines={1} />
                    <Skeleton lines={1} animated={false} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <Empty description={resolvedEmptyFallbackDescription} />
        ) : (
          <ul className="flex flex-col gap-3">{nodes.map((node) => renderNode(node, 0))}</ul>
        )}
      </div>
    </section>
  );
});

Tree.displayName = "Tree";

export default Tree;
