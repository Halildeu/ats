import React, { useMemo, useState } from "react";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { Badge, type BadgeVariant } from "../../primitives/badge/Badge";
import { EmptyState as Empty } from "../empty-state/EmptyState";
import { Text } from "../../primitives/text/Text";

/* ------------------------------------------------------------------ */
/*  JsonViewer — Interactive JSON tree viewer with type badges        */
/* ------------------------------------------------------------------ */

type JsonExpandable = Record<string, unknown> | unknown[];

/** Props for the JsonViewer component.
 * @example
 * ```tsx
 * <JsonViewer />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/json-viewer)
 */
export interface JsonViewerProps extends AccessControlledProps {
  /** JSON data to display in the tree. */
  value: unknown;
  /** Heading text above the viewer. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Label for the root tree node. */
  rootLabel?: string;
  /** Number of tree levels expanded by default. */
  defaultExpandedDepth?: number;
  /** Maximum height of the scrollable viewer area. */
  maxHeight?: number | string;
  /** Whether the viewer spans full container width. */
  fullWidth?: boolean;
  /** Whether to show type badges on each node. */
  showTypes?: boolean;
  /** Label shown when no data is available. */
  emptyStateLabel?: React.ReactNode;
  /** Locale-specific label overrides. */
  localeText?: {
    emptyStateLabel?: React.ReactNode;
    emptyFallbackDescription?: React.ReactNode;
    emptyNodeDescription?: React.ReactNode;
    arraySummary?: (count: number) => React.ReactNode;
    objectSummary?: (count: number) => React.ReactNode;
    nullTypeLabel?: string;
    arrayTypeLabel?: string;
    objectTypeLabel?: string;
    booleanTypeLabel?: string;
    numberTypeLabel?: string;
  };
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isExpandable = (value: unknown): value is JsonExpandable => Array.isArray(value) || isObjectRecord(value);

const summaryFor = (
  value: JsonExpandable,
  localeText?: JsonViewerProps["localeText"],
) =>
  Array.isArray(value)
    ? (localeText?.arraySummary?.(value.length) ?? `[${value.length} item]`)
    : (localeText?.objectSummary?.(Object.keys(value).length) ?? `{${Object.keys(value).length} key}`);

const typeInfoFor = (
  value: unknown,
  localeText?: JsonViewerProps["localeText"],
): { label: string; tone: BadgeVariant } => {
  if (value === null) return { label: localeText?.nullTypeLabel ?? "null", tone: "muted" };
  if (Array.isArray(value)) return { label: localeText?.arrayTypeLabel ?? "array", tone: "info" };
  if (isObjectRecord(value)) return { label: localeText?.objectTypeLabel ?? "object", tone: "info" };
  if (typeof value === "boolean") return { label: localeText?.booleanTypeLabel ?? "boolean", tone: "warning" };
  if (typeof value === "number") return { label: localeText?.numberTypeLabel ?? "number", tone: "success" };
  return { label: typeof value, tone: "default" };
};

const primitiveClassName = (value: unknown) => {
  if (typeof value === "string") return "text-state-info-text";
  if (typeof value === "number") return "text-state-success-text";
  if (typeof value === "boolean") return "text-state-warning-text";
  if (value === null) return "text-text-subtle";
  return "text-text-primary";
};

const formatPrimitive = (value: unknown) => {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "undefined") return "undefined";
  return String(value);
};

const jsonViewerSurfaceClassName =
  "relative overflow-auto rounded-[28px] border border-border-subtle/80 bg-[var(--surface-card)] p-4 shadow-[0_22px_48px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent";

/** Interactive collapsible JSON tree viewer with type badges and configurable expand depth. */
export const JsonViewer = React.forwardRef<HTMLElement, JsonViewerProps>(({
  value,
  title,
  description,
  rootLabel = "payload",
  defaultExpandedDepth = 1,
  maxHeight = 420,
  fullWidth = true,
  showTypes = true,
  emptyStateLabel,
  localeText,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [toggleState, setToggleState] = useState<Record<string, boolean>>({});

  const normalizedValue = useMemo(() => value, [value]);

  const resolvedEmptyStateLabel = emptyStateLabel ?? localeText?.emptyStateLabel ?? "No JSON payload available.";
  const resolvedEmptyFallbackDescription =
    localeText?.emptyFallbackDescription ??
    (typeof resolvedEmptyStateLabel === "string" ? resolvedEmptyStateLabel : "No JSON payload available.");
  const resolvedEmptyNodeDescription =
    localeText?.emptyNodeDescription ?? "This node is empty.";

  if (accessState.isHidden) {
    return null;
  }

  if (typeof normalizedValue === "undefined") {
    return (
      <section
        className={fullWidth ? "w-full" : undefined}
        data-access-state={accessState.state}
        data-component="json-viewer"
        data-surface-appearance="premium"
        title={accessReason}
      >
        {title ? (
          <Text as="div" className="text-base font-semibold tracking-[-0.02em] text-text-primary">
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text variant="secondary" className="mt-1 block text-sm leading-6">
            {description}
          </Text>
        ) : null}
        <div className="mt-4">
          <Empty description={resolvedEmptyFallbackDescription} />
        </div>
      </section>
    );
  }

  const isExpanded = (path: string, depth: number) =>
    toggleState[path] ?? depth < defaultExpandedDepth;

  const renderNode = (nodeLabel: string, nodeValue: unknown, path: string, depth: number): React.ReactNode => {
    const typeInfo = typeInfoFor(nodeValue, localeText);
    const expandable = isExpandable(nodeValue);
    const expanded = expandable ? isExpanded(path, depth) : false;
    const indentClass = depth === 0 ? "" : "ms-4 border-s border-border-subtle ps-4";

    if (!expandable) {
      return (
        <div key={path} className={`rounded-2xl border border-border-subtle bg-surface-muted/60 px-4 py-3 ${indentClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Text as="div" className="text-sm font-semibold text-text-primary">
                {nodeLabel}
              </Text>
            </div>
            {showTypes ? <Badge variant={typeInfo.tone}>{typeInfo.label}</Badge> : null}
          </div>
          <code className={`mt-2 block overflow-x-auto rounded-xl border border-border-subtle/65 bg-[var(--surface-card)] px-3 py-2 text-xs shadow-[0_12px_24px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs ${primitiveClassName(nodeValue)}`}>
            {formatPrimitive(nodeValue)}
          </code>
        </div>
      );
    }

    const entries = Array.isArray(nodeValue)
      ? nodeValue.map((entry, index) => [String(index), entry] as const)
      : Object.entries(nodeValue);

    return (
      <div key={path} className={`rounded-[24px] border border-border-subtle/75 bg-[var(--surface-card-alt)] p-4 shadow-[0_16px_30px_-28px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs ${indentClass}`}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left transition duration-(--motion-duration-medium) hover:-translate-y-px"
          onClick={() =>
            setToggleState((current) => ({
              ...current,
              [path]: !isExpanded(path, depth),
            }))
          }
        >
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="text-sm text-text-secondary">
              {expanded ? "\u25BE" : "\u25B8"}
            </span>
            <div className="min-w-0">
              <Text as="div" className="text-sm font-semibold text-text-primary">
                {nodeLabel}
              </Text>
              <Text variant="secondary" className="text-xs uppercase tracking-[0.16em]">
                {summaryFor(nodeValue, localeText)}
              </Text>
            </div>
          </div>
          {showTypes ? <Badge variant={typeInfo.tone}>{typeInfo.label}</Badge> : null}
        </button>

        {expanded ? (
          <div className="flex flex-col mt-4 gap-3">
            {entries.length === 0 ? (
              <Empty description={resolvedEmptyNodeDescription} className="border-dashed" />
            ) : (
              entries.map(([childKey, childValue]) => renderNode(childKey, childValue, `${path}.${childKey}`, depth + 1))
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section
      ref={ref}
      className={fullWidth ? "w-full" : undefined}
      data-access-state={accessState.state}
      data-component="json-viewer"
      data-surface-appearance="premium"
      title={accessReason}
    >
      {title ? (
        <Text as="div" className="text-base font-semibold tracking-[-0.02em] text-text-primary">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="secondary" className="mt-1 block text-sm leading-6">
          {description}
        </Text>
      ) : null}

      <div
        className={`mt-4 ${jsonViewerSurfaceClassName}`}
        style={{ maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }}
      >
        <div className="flex flex-col gap-3">{renderNode(rootLabel, normalizedValue, rootLabel, 0)}</div>
      </div>
    </section>
  );
});

JsonViewer.displayName = "JsonViewer";

export default JsonViewer;

/** Type alias for JsonViewer ref. */
export type JsonViewerRef = React.Ref<HTMLElement>;
/** Type alias for JsonViewer element. */
export type JsonViewerElement = HTMLElement;
/** Type alias for JsonViewer cssproperties. */
export type JsonViewerCSSProperties = React.CSSProperties;
