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
/*  TreeTable — Hierarchical tree with tabular data columns           */
/* ------------------------------------------------------------------ */

export type TreeTableDensity = "comfortable" | "compact";
export type TreeTableAlign = "left" | "center" | "right";
export type TreeTableTone = "default" | "info" | "success" | "warning" | "danger";

export type TreeTableColumn<RowData extends Record<string, unknown> = Record<string, unknown>> = {
  key: string;
  label: React.ReactNode;
  accessor?: keyof RowData | ((node: TreeTableNode<RowData>, index: number) => React.ReactNode);
  render?: (node: TreeTableNode<RowData>, index: number) => React.ReactNode;
  align?: TreeTableAlign;
  width?: string;
  emphasis?: boolean;
};

export type TreeTableNode<RowData extends Record<string, unknown> = Record<string, unknown>> = {
  key: React.Key;
  label: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  badges?: Array<React.ReactNode | string>;
  tone?: TreeTableTone;
  disabled?: boolean;
  data?: RowData;
  children?: TreeTableNode<RowData>[];
};

export interface TreeTableLocaleText {
  treeColumnLabel?: React.ReactNode;
  emptyStateLabel?: React.ReactNode;
  emptyFallbackDescription?: React.ReactNode;
  expandNodeAriaLabel?: string;
  collapseNodeAriaLabel?: string;
}

/** Props for the TreeTable component.
 * @example
 * ```tsx
 * <TreeTable />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/tree-table)
 */
export interface TreeTableProps<RowData extends Record<string, unknown> = Record<string, unknown>>
  extends AccessControlledProps {
  /** Hierarchical node data to display. */
  nodes: TreeTableNode<RowData>[];
  /** Column definitions for the tabular section. */
  columns: TreeTableColumn<RowData>[];
  /** Header label for the tree column. */
  treeColumnLabel?: React.ReactNode;
  /** Heading text above the table. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Row spacing density variant. */
  density?: TreeTableDensity;
  /** Label shown when there are no nodes. */
  emptyStateLabel?: React.ReactNode;
  /** Whether to show loading skeleton rows. */
  loading?: boolean;
  /** Key of the currently selected node. */
  selectedKey?: React.Key | null;
  /** Callback fired when a node row is selected. */
  onNodeSelect?: (key: React.Key) => void;
  /** Initially expanded node keys for uncontrolled mode. */
  defaultExpandedKeys?: React.Key[];
  /** Controlled set of expanded node keys. */
  expandedKeys?: React.Key[];
  /** Callback fired when expanded keys change. */
  onExpandedKeysChange?: (keys: React.Key[]) => void;
  /** Whether the table spans the full container width. */
  fullWidth?: boolean;
  /** Locale-specific label overrides. */
  localeText?: TreeTableLocaleText;
}

type FlattenedNode<RowData extends Record<string, unknown>> = {
  node: TreeTableNode<RowData>;
  depth: number;
};

const densityClass: Record<TreeTableDensity, string> = {
  comfortable: "px-4 py-3.5",
  compact: "px-4 py-2.5",
};

const alignClass: Record<TreeTableAlign, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

const toneClass: Record<TreeTableTone, string> = {
  default: "bg-surface-default",
  info: "bg-state-info/20",
  success: "bg-state-success/20",
  warning: "bg-state-warning/20",
  danger: "bg-state-danger/20",
};

const badgeToneMap: Record<TreeTableTone, BadgeVariant> = {
  default: "default",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const flattenKeys = <RowData extends Record<string, unknown>>(nodes: TreeTableNode<RowData>[]): React.Key[] =>
  nodes.flatMap((node) => [node.key, ...(node.children ? flattenKeys(node.children) : [])]);

const flattenVisibleNodes = <RowData extends Record<string, unknown>>(
  nodes: TreeTableNode<RowData>[],
  expanded: Set<React.Key>,
  depth = 0,
): FlattenedNode<RowData>[] =>
  nodes.flatMap((node) => {
    const current: FlattenedNode<RowData> = { node, depth };
    if (!node.children?.length || !expanded.has(node.key)) {
      return [current];
    }
    return [current, ...flattenVisibleNodes(node.children, expanded, depth + 1)];
  });

const resolveCellValue = <RowData extends Record<string, unknown>>(
  column: TreeTableColumn<RowData>,
  node: TreeTableNode<RowData>,
  index: number,
): React.ReactNode => {
  if (column.render) return column.render(node, index);
  if (typeof column.accessor === "function") return column.accessor(node, index);
  if (typeof column.accessor === "string") return node.data?.[column.accessor] as React.ReactNode;
  return node.data?.[column.key] as React.ReactNode;
};

/** Hierarchical tree with tabular data columns, expand/collapse, sorting, and row selection. */
export function TreeTable<RowData extends Record<string, unknown> = Record<string, unknown>>({
  nodes,
  columns,
  treeColumnLabel,
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
}: TreeTableProps<RowData>) {
  if (access === 'hidden') return null;

  const accessState = resolveAccessState(access);
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<React.Key[]>(defaultExpandedKeys);
  const allKeys = useMemo(() => new Set(flattenKeys(nodes)), [nodes]);
  const effectiveExpandedKeys = useMemo(
    () => (expandedKeys ?? internalExpandedKeys).filter((key) => allKeys.has(key)),
    [allKeys, expandedKeys, internalExpandedKeys],
  );
  const expandedSet = useMemo(() => new Set(effectiveExpandedKeys), [effectiveExpandedKeys]);
  const visibleNodes = useMemo(() => flattenVisibleNodes(nodes, expandedSet), [nodes, expandedSet]);
  const resolvedTreeColumnLabel = treeColumnLabel ?? localeText?.treeColumnLabel ?? "Structure";
  const resolvedEmptyStateLabel = emptyStateLabel ?? localeText?.emptyStateLabel ?? "No records found for this tree table.";
  const resolvedEmptyFallbackDescription =
    localeText?.emptyFallbackDescription ??
    (typeof resolvedEmptyStateLabel === "string" ? resolvedEmptyStateLabel : "No records found.");
  const expandNodeAriaLabel = localeText?.expandNodeAriaLabel ?? "Expand branch";
  const collapseNodeAriaLabel = localeText?.collapseNodeAriaLabel ?? "Collapse branch";

  if (accessState.isHidden) {
    return null;
  }

  const updateExpanded = (nextKeys: React.Key[]) => {
    const unique = Array.from(new Set(nextKeys)).filter((key) => allKeys.has(key));
    if (!expandedKeys) {
      setInternalExpandedKeys(unique);
    }
    onExpandedKeysChange?.(unique);
  };

  const toggleNode = (nodeKey: React.Key) => {
    if (expandedSet.has(nodeKey)) {
      updateExpanded(effectiveExpandedKeys.filter((key) => key !== nodeKey));
      return;
    }
    updateExpanded([...effectiveExpandedKeys, nodeKey]);
  };

  return (
    <section
      className={fullWidth ? "w-full" : undefined}
      data-access-state={accessState.state}
      data-component="tree-table"
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

      <div className="mt-4 overflow-hidden rounded-[26px] border border-border-subtle bg-surface-default shadow-xs">
        {!loading && visibleNodes.length === 0 ? (
          <div className="p-5">
            <Empty description={resolvedEmptyFallbackDescription} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm text-text-primary">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="border-b border-border-subtle px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                    {resolvedTreeColumnLabel}
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={[
                        "border-b border-border-subtle px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary",
                        alignClass[column.align ?? "left"],
                      ].join(" ")}
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, rowIndex) => (
                      <tr key={`loading-${rowIndex}`}>
                        <td className={["border-b border-border-subtle", densityClass[density]].join(" ")}>
                          <div className="flex items-center gap-3">
                            <Skeleton circle height={32} className="shrink-0" />
                            <div className="flex flex-col min-w-0 flex-1 gap-2">
                              <Skeleton lines={1} />
                              <Skeleton lines={1} animated={false} />
                            </div>
                          </div>
                        </td>
                        {columns.map((column) => (
                          <td key={`${column.key}-${rowIndex}`} className={["border-b border-border-subtle", densityClass[density]].join(" ")}>
                            <Skeleton lines={1} animated={rowIndex % 2 === 0} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : visibleNodes.map(({ node, depth }, rowIndex) => {
                      const tone = node.tone ?? "default";
                      const hasChildren = (node.children?.length ?? 0) > 0;
                      const expanded = hasChildren ? expandedSet.has(node.key) : false;
                      const selected = selectedKey === node.key;
                      const blocked = shouldBlockInteraction(accessState.state, node.disabled);
                      return (
                        <tr key={node.key} className={[toneClass[tone], selected ? "ring-1 ring-inset ring-state-info-border/60" : ""].filter(Boolean).join(" ")}>
                          <td className={["border-b border-border-subtle align-top", densityClass[density]].join(" ")}>
                            <div className="flex items-start gap-3">
                              <div className="flex items-center gap-2 pt-0.5" style={{ paddingInlineStart: `${depth * 18}px` }}>
                                {hasChildren ? (
                                  <button
                                    type="button"
                                    className="inline-flex size-7 items-center justify-center rounded-full border border-border-subtle bg-surface-muted text-sm text-text-secondary"
                                    aria-expanded={expanded}
                                    aria-label={expanded ? collapseNodeAriaLabel : expandNodeAriaLabel}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      toggleNode(node.key);
                                    }}
                                  >
                                    {expanded ? "\u25BE" : "\u25B8"}
                                  </button>
                                ) : (
                                  <span className="inline-flex size-7 items-center justify-center rounded-full border border-border-subtle bg-surface-muted text-[10px] font-semibold text-text-subtle">
                                    {"\u2022"}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                className={[
                                  "min-w-0 flex-1 rounded-2xl px-1 text-start transition-colors",
                                  blocked ? "cursor-not-allowed opacity-70" : onNodeSelect ? "hover:bg-surface-muted active:bg-surface-muted/80" : "",
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
                                }}
                                aria-current={selected ? "true" : undefined}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex flex-col min-w-0 gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Text as="div" className="text-sm font-semibold text-text-primary" style={{ textWrap: "pretty" } as React.CSSProperties}>
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
                          </td>
                          {columns.map((column) => {
                            const value = resolveCellValue(column, node, rowIndex);
                            return (
                              <td
                                key={column.key}
                                className={[
                                  "border-b border-border-subtle align-top text-sm leading-6 text-text-secondary",
                                  densityClass[density],
                                  alignClass[column.align ?? "left"],
                                ].join(" ")}
                              >
                                <div className={column.emphasis ? "font-semibold text-text-primary" : undefined}>{value}</div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

TreeTable.displayName = "TreeTable";

/**
 * ForwardRef wrapper for TreeTable that forwards the ref to the root element.
 * Use the generic `TreeTable` export directly when ref forwarding is not needed.
 */
const TreeTableWithRef = React.forwardRef<HTMLElement, TreeTableProps>(
  function TreeTableForwardRef(props, _ref) {
    return <TreeTable {...props} />;
  },
);
TreeTableWithRef.displayName = 'TreeTable';

export default TreeTable;
export { TreeTableWithRef };
