import React from "react";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { EmptyState as Empty } from "../empty-state/EmptyState";
import { Skeleton } from "../../primitives/skeleton/Skeleton";
import { Text } from "../../primitives/text/Text";

/* ------------------------------------------------------------------ */
/*  TableSimple — Lightweight static table with access control          */
/* ------------------------------------------------------------------ */

export type TableSimpleDensity = "comfortable" | "compact";
export type TableSimpleAlign = "left" | "center" | "right";

/** Column definition for TableSimple. */
export type TableSimpleColumn<Row> = {
  /** Unique column identifier used as React key and default accessor. */
  key: string;
  /** Column header label. */
  label: React.ReactNode;
  /** Property name or function to extract cell value from a row. */
  accessor?: keyof Row | ((row: Row, index: number) => React.ReactNode);
  /** Custom render function for the cell content. */
  render?: (row: Row, index: number) => React.ReactNode;
  /** Horizontal text alignment. @default "left" */
  align?: TableSimpleAlign;
  /** Render the cell in bold primary text. */
  emphasis?: boolean;
  /** Truncate overflowing cell content with an ellipsis. */
  truncate?: boolean;
  /** Fixed CSS width for the column (e.g. "120px"). */
  width?: string;
  /** Additional class name for the header cell. */
  headerClassName?: string;
  /** Additional class name for body cells in this column. */
  cellClassName?: string;
};

/** Locale text overrides for TableSimple empty states. */
export interface TableSimpleLocaleText {
  /** Label displayed in the empty state. */
  emptyStateLabel?: React.ReactNode;
  /** Fallback description for the empty state component. */
  emptyFallbackDescription?: React.ReactNode;
}

/**
 * TableSimple renders a lightweight, static data table with access control,
 * striped rows, sticky header support, and a loading skeleton state.
 */
export interface TableSimpleProps<
  Row extends Record<string, unknown> = Record<string, unknown>,
> extends AccessControlledProps {
  /** Column definitions. */
  columns: TableSimpleColumn<Row>[];
  /** Data rows to display. */
  rows: Row[];
  /** Table caption shown as a heading above the table. */
  caption?: React.ReactNode;
  /** Subtitle shown below the caption. */
  description?: React.ReactNode;
  /** Row padding density. @default "comfortable" */
  density?: TableSimpleDensity;
  /** Apply alternating row background colors. @default true */
  striped?: boolean;
  /** Make the header row sticky on scroll. @default false */
  stickyHeader?: boolean;
  /** Show skeleton loading rows instead of data. @default false */
  loading?: boolean;
  /** Stretch the table to full container width. @default true */
  fullWidth?: boolean;
  /** Custom empty state label when no rows exist. */
  emptyStateLabel?: React.ReactNode;
  /** Function to derive a stable React key for each row. */
  getRowKey?: (row: Row, index: number) => React.Key;
  /** Locale text overrides. */
  localeText?: TableSimpleLocaleText;
}

const densityRowClass: Record<TableSimpleDensity, string> = {
  comfortable: "px-4 py-3.5",
  compact: "px-4 py-2.5",
};

const alignClass: Record<TableSimpleAlign, string> = {
  left: "text-start",
  center: "text-center",
  right: "text-end",
};

const resolveCellValue = <Row extends Record<string, unknown>>(
  column: TableSimpleColumn<Row>,
  row: Row,
  index: number,
) => {
  if (column.render) return column.render(row, index);
  if (typeof column.accessor === "function")
    return column.accessor(row, index);
  if (typeof column.accessor === "string")
    return row[column.accessor] as React.ReactNode;
  return row[column.key] as React.ReactNode;
};

function TableSimpleInner<
  Row extends Record<string, unknown> = Record<string, unknown>,
>({
  columns,
  rows,
  caption,
  description,
  density = "comfortable",
  striped = true,
  stickyHeader = false,
  loading = false,
  fullWidth = true,
  emptyStateLabel,
  getRowKey,
  localeText,
  access = "full",
  accessReason,
  innerRef,
}: TableSimpleProps<Row> & { innerRef?: React.Ref<HTMLElement> }) {
  const accessState = resolveAccessState(access);
  const resolvedEmptyStateLabel =
    emptyStateLabel ??
    localeText?.emptyStateLabel ??
    "No records found for this table.";
  const resolvedEmptyFallbackDescription =
    localeText?.emptyFallbackDescription ??
    (typeof resolvedEmptyStateLabel === "string"
      ? resolvedEmptyStateLabel
      : "No records found.");

  if (accessState.isHidden) {
    return null;
  }

  const showEmpty = !loading && rows.length === 0;

  return (
    <section
      ref={innerRef as React.Ref<HTMLElement>}
      className={fullWidth ? "w-full" : undefined}
      data-access-state={accessState.state}
      data-component="table-simple"
      title={accessReason}
    >
      {caption ? (
        <Text
          as="div"
          className="text-base font-semibold text-text-primary"
        >
          {caption}
        </Text>
      ) : null}
      {description ? (
        <Text variant="secondary" className="mt-1 block text-sm leading-6">
          {description}
        </Text>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-[26px] border border-border-subtle bg-surface-default shadow-xs">
        {showEmpty ? (
          <div className="p-5">
            <Empty description={resolvedEmptyFallbackDescription} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm text-text-primary">
              <thead
                className={
                  stickyHeader
                    ? "sticky top-0 z-[1] bg-surface-muted/95 backdrop-blur-xs"
                    : "bg-surface-muted"
                }
              >
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={[
                        "border-b border-border-subtle px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary",
                        alignClass[column.align ?? "left"],
                        column.headerClassName,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        column.width ? { width: column.width } : undefined
                      }
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, rowIndex) => (
                      <tr
                        key={`loading-${rowIndex}`}
                        className="bg-surface-default"
                      >
                        {columns.map((column) => (
                          <td
                            key={`${column.key}-${rowIndex}`}
                            className={[
                              "border-b border-border-subtle align-top",
                              densityRowClass[density],
                              alignClass[column.align ?? "left"],
                            ].join(" ")}
                          >
                            <Skeleton
                              lines={1}
                              animated={rowIndex % 2 === 0}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((row, rowIndex) => (
                      <tr
                        key={
                          getRowKey ? getRowKey(row, rowIndex) : rowIndex
                        }
                        className={[
                          striped && rowIndex % 2 === 1
                            ? "bg-surface-muted/60"
                            : "bg-surface-default",
                          accessState.isReadonly ? "opacity-95" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {columns.map((column) => {
                          const value = resolveCellValue(
                            column,
                            row,
                            rowIndex,
                          );
                          return (
                            <td
                              key={column.key}
                              className={[
                                "border-b border-border-subtle align-top text-sm leading-6 text-text-primary",
                                densityRowClass[density],
                                alignClass[column.align ?? "left"],
                                column.cellClassName,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <div
                                className={[
                                  column.truncate ? "truncate" : "",
                                  column.emphasis
                                    ? "font-semibold text-text-primary"
                                    : "text-text-secondary",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {value}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Lightweight static data table with striped rows, sticky header, and loading skeleton state.
 *
 * @example
 * ```tsx
 * <TableSimple
 *   columns={[
 *     { key: 'name', label: 'Name' },
 *     { key: 'role', label: 'Role' },
 *   ]}
 *   rows={[{ name: 'Jane', role: 'Admin' }, { name: 'Ali', role: 'Editor' }]}
 *   striped
 * />
 * ```
 */
export const TableSimple = React.forwardRef<HTMLElement, TableSimpleProps>(
  (props, ref) => <TableSimpleInner {...props} innerRef={ref} />,
) as (<Row extends Record<string, unknown> = Record<string, unknown>>(
  props: TableSimpleProps<Row> & { ref?: React.Ref<HTMLElement> },
) => React.ReactElement | null) & { displayName?: string };

TableSimple.displayName = "TableSimple";

export default TableSimple;
