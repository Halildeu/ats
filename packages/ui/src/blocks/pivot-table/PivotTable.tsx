import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

/** Value aggregation configuration for a pivot table column. */
export interface PivotValueConfig {
  /** Data field to aggregate */
  field: string;
  /** Aggregation function */
  aggregate: 'sum' | 'count' | 'avg' | 'min' | 'max';
  /** Display label for the value column */
  label?: string;
  /** Custom number formatter */
  format?: (v: number) => string;
}

/** Cell click event payload. */
export interface PivotCellClickEvent {
  row: Record<string, unknown>;
  column: Record<string, unknown>;
  value: number;
}

/**
 * Props for the PivotTable component.
 *
 * @example
 * ```tsx
 * <PivotTable
 *   data={salesData}
 *   rows={['region']}
 *   columns={['quarter']}
 *   values={[{ field: 'revenue', aggregate: 'sum', label: 'Revenue' }]}
 *   showTotals
 *   sortable
 * />
 * ```
 *
 * @since 1.0.0
 * @see PivotValueConfig
 * @see PivotCellClickEvent
 */
export interface PivotTableProps extends AccessControlledProps {
  /** Raw data array to pivot */
  data: Record<string, unknown>[];
  /** Fields used as row dimensions */
  rows: string[];
  /** Fields used as column dimensions */
  columns: string[];
  /** Aggregation definitions */
  values: PivotValueConfig[];
  /** Callback when a data cell is clicked */
  onCellClick?: (cell: PivotCellClickEvent) => void;
  /** Show row/column totals */
  showTotals?: boolean;
  /** Compact mode — smaller padding and font */
  compact?: boolean;
  /** Allow sorting by clicking column headers */
  sortable?: boolean;
  /** Additional class names */
  className?: string;
}

// ── Aggregation helpers ──

function aggregateValues(items: number[], fn: PivotValueConfig['aggregate']): number {
  if (items.length === 0) return 0;
  switch (fn) {
    case 'sum':
      return items.reduce((a, b) => a + b, 0);
    case 'count':
      return items.length;
    case 'avg':
      return items.reduce((a, b) => a + b, 0) / items.length;
    case 'min':
      return Math.min(...items);
    case 'max':
      return Math.max(...items);
    default:
      return 0;
  }
}

/**
 * Build a composite key string from an object's dimension values.
 */
function compositeKey(record: Record<string, unknown>, fields: string[]): string {
  return fields.map((f) => String(record[f] ?? '')).join('|||');
}

/**
 * Parse a composite key back into a dimension-value record.
 */
function parseKey(key: string, fields: string[]): Record<string, unknown> {
  const parts = key.split('|||');
  const result: Record<string, unknown> = {};
  fields.forEach((f, i) => {
    result[f] = parts[i] ?? '';
  });
  return result;
}

/**
 * Default number formatter with locale support.
 */
function defaultFormat(v: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(v);
}

// ── Pivot engine ──

interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  cells: Map<string, number[]>; // "rowKey::colKey::valueIdx" -> aggregated values
}

function computePivot(
  data: Record<string, unknown>[],
  rows: string[],
  columns: string[],
  values: PivotValueConfig[],
): PivotResult {
  const rowKeySet = new Set<string>();
  const colKeySet = new Set<string>();
  const buckets = new Map<string, number[][]>();

  for (const record of data) {
    const rk = compositeKey(record, rows);
    const ck = compositeKey(record, columns);
    rowKeySet.add(rk);
    colKeySet.add(ck);

    const cellKey = `${rk}::${ck}`;
    if (!buckets.has(cellKey)) {
      buckets.set(
        cellKey,
        values.map(() => []),
      );
    }
    const bucket = buckets.get(cellKey)!;
    for (let vi = 0; vi < values.length; vi++) {
      const raw = record[values[vi].field];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isNaN(num)) {
        bucket[vi].push(num);
      }
    }
  }

  // Aggregate
  const cells = new Map<string, number[]>();
  for (const [cellKey, bucket] of buckets) {
    const aggregated = values.map((v, vi) => aggregateValues(bucket[vi], v.aggregate));
    cells.set(cellKey, aggregated);
  }

  return {
    rowKeys: Array.from(rowKeySet).sort(),
    colKeys: Array.from(colKeySet).sort(),
    cells,
  };
}

// ── Sort state ──

type SortDir = 'asc' | 'desc' | null;

// ── Component ──

/**
 * **PivotTable** — lightweight cross-tab / pivot table for business intelligence.
 *
 * Groups raw data by row and column dimensions, applies aggregation functions
 * (sum, count, avg, min, max), and renders a semantic HTML table with optional
 * totals, sorting, compact mode, and cell click handlers.
 *
 * @example
 * ```tsx
 * <PivotTable
 *   data={[
 *     { region: 'North', quarter: 'Q1', revenue: 100 },
 *     { region: 'North', quarter: 'Q2', revenue: 150 },
 *     { region: 'South', quarter: 'Q1', revenue: 200 },
 *   ]}
 *   rows={['region']}
 *   columns={['quarter']}
 *   values={[{ field: 'revenue', aggregate: 'sum' }]}
 *   showTotals
 * />
 * ```
 *
 * @since 1.0.0
 * @see PivotTableProps
 * @see PivotValueConfig
 */
export function PivotTable({
  data,
  rows,
  columns,
  values,
  onCellClick,
  showTotals = false,
  compact = false,
  sortable = false,
  className,
  access,
}: PivotTableProps) {
  const { isHidden, isDisabled, state } = resolveAccessState(access);

  const [sortCol, setSortCol] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>(null);

  const pivot = React.useMemo(
    () => computePivot(data, rows, columns, values),
    [data, rows, columns, values],
  );

  // Sorted row keys
  const sortedRowKeys = React.useMemo(() => {
    if (!sortCol || !sortDir) return pivot.rowKeys;
    return [...pivot.rowKeys].sort((a, b) => {
      const aVals = pivot.cells.get(`${a}::${sortCol}`);
      const bVals = pivot.cells.get(`${b}::${sortCol}`);
      const aSum = aVals ? aVals.reduce((s, v) => s + v, 0) : 0;
      const bSum = bVals ? bVals.reduce((s, v) => s + v, 0) : 0;
      return sortDir === 'asc' ? aSum - bSum : bSum - aSum;
    });
  }, [pivot, sortCol, sortDir]);

  if (isHidden) return null;

  const cellPadding = compact ? 'px-2 py-1' : 'px-3 py-2';
  const fontSize = compact ? 'text-xs' : 'text-sm';
  const headerBg = 'bg-[var(--surface-muted)]';
  const borderColor = 'border-[var(--border-default)]';

  const handleSort = (colKey: string) => {
    if (!sortable) return;
    if (sortCol === colKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortCol(null);
    } else {
      setSortCol(colKey);
      setSortDir('asc');
    }
  };

  const handleCellClick = (rowKey: string, colKey: string, valueIdx: number) => {
    if (isDisabled || !onCellClick) return;
    const cellVals = pivot.cells.get(`${rowKey}::${colKey}`);
    const val = cellVals ? cellVals[valueIdx] : 0;
    onCellClick({
      row: parseKey(rowKey, rows),
      column: parseKey(colKey, columns),
      value: val,
    });
  };

  // Column total computation
  const computeColTotal = (colKey: string, valueIdx: number): number => {
    let total = 0;
    for (const rk of pivot.rowKeys) {
      const vals = pivot.cells.get(`${rk}::${colKey}`);
      if (vals) total += vals[valueIdx];
    }
    return total;
  };

  // Row total computation
  const computeRowTotal = (rowKey: string, valueIdx: number): number => {
    let total = 0;
    for (const ck of pivot.colKeys) {
      const vals = pivot.cells.get(`${rowKey}::${ck}`);
      if (vals) total += vals[valueIdx];
    }
    return total;
  };

  // Grand total
  const computeGrandTotal = (valueIdx: number): number => {
    let total = 0;
    for (const rk of pivot.rowKeys) {
      for (const ck of pivot.colKeys) {
        const vals = pivot.cells.get(`${rk}::${ck}`);
        if (vals) total += vals[valueIdx];
      }
    }
    return total;
  };

  const formatCell = (val: number, valueIdx: number): string => {
    const formatter = values[valueIdx]?.format ?? defaultFormat;
    return formatter(val);
  };

  const sortIndicator = (colKey: string) => {
    if (!sortable) return null;
    if (sortCol !== colKey) return <span className="ml-1 opacity-30">{'\u2195'}</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  // How many row header columns?
  const rowHeaderCount = rows.length;

  return (
    <div
      className={cn('pivot-table-root overflow-auto', accessStyles(state), className)}
      data-testid="pivot-table"
    >
      <table
        className={cn('w-full border-collapse', fontSize, `border ${borderColor}`)}
        role="grid"
        aria-label="Pivot table"
      >
        {/* ── Column headers ── */}
        <thead>
          {/* Top header row: column dimension labels */}
          <tr>
            {/* Empty cells over row headers */}
            {rows.map((field) => (
              <th
                key={`rh-${field}`}
                className={cn(
                  cellPadding,
                  headerBg,
                  `border ${borderColor}`,
                  'text-left font-semibold text-[var(--text-primary)]',
                )}
                rowSpan={values.length > 1 ? 2 : 1}
              >
                {field}
              </th>
            ))}
            {/* Column dimension values */}
            {pivot.colKeys.map((ck) => {
              const parsed = parseKey(ck, columns);
              const display = columns.map((c) => String(parsed[c])).join(' / ');
              return (
                <th
                  key={`ch-${ck}`}
                  className={cn(
                    cellPadding,
                    headerBg,
                    `border ${borderColor}`,
                    'text-center font-semibold text-[var(--text-primary)]',
                    sortable && 'cursor-pointer select-none hover:bg-[var(--surface-hover)]',
                  )}
                  colSpan={values.length}
                  onClick={() => handleSort(ck)}
                  aria-sort={
                    sortCol === ck ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {display}
                  {values.length <= 1 && sortIndicator(ck)}
                </th>
              );
            })}
            {/* Totals header */}
            {showTotals && (
              <th
                className={cn(
                  cellPadding,
                  headerBg,
                  `border ${borderColor}`,
                  'text-center font-semibold text-[var(--text-primary)]',
                )}
                colSpan={values.length}
                rowSpan={values.length > 1 ? 2 : 1}
              >
                Total
              </th>
            )}
          </tr>
          {/* Sub-header row when multiple value columns */}
          {values.length > 1 && (
            <tr>
              {pivot.colKeys.map((ck) =>
                values.map((v, vi) => (
                  <th
                    key={`sh-${ck}-${vi}`}
                    className={cn(
                      cellPadding,
                      headerBg,
                      `border ${borderColor}`,
                      'text-center font-medium text-[var(--text-secondary)]',
                    )}
                  >
                    {v.label ?? v.field}
                  </th>
                )),
              )}
            </tr>
          )}
        </thead>

        {/* ── Data rows ── */}
        <tbody>
          {sortedRowKeys.map((rk) => {
            const parsed = parseKey(rk, rows);
            return (
              <tr key={`row-${rk}`} className="hover:bg-[var(--surface-hover)]">
                {/* Row headers */}
                {rows.map((field) => (
                  <td
                    key={`rd-${rk}-${field}`}
                    className={cn(
                      cellPadding,
                      `border ${borderColor}`,
                      'font-medium text-[var(--text-primary)] whitespace-nowrap',
                    )}
                  >
                    {String(parsed[field] ?? '')}
                  </td>
                ))}
                {/* Data cells */}
                {pivot.colKeys.map((ck) => {
                  const cellVals = pivot.cells.get(`${rk}::${ck}`);
                  return values.map((v, vi) => {
                    const val = cellVals ? cellVals[vi] : 0;
                    return (
                      <td
                        key={`cell-${rk}-${ck}-${vi}`}
                        className={cn(
                          cellPadding,
                          `border ${borderColor}`,
                          'text-right tabular-nums text-[var(--text-primary)]',
                          !isDisabled &&
                            onCellClick &&
                            'cursor-pointer hover:bg-[var(--interactive-primary-hover)]',
                        )}
                        onClick={() => handleCellClick(rk, ck, vi)}
                        role={onCellClick ? 'gridcell' : undefined}
                        tabIndex={onCellClick && !isDisabled ? 0 : undefined}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && onCellClick && !isDisabled) {
                            e.preventDefault();
                            handleCellClick(rk, ck, vi);
                          }
                        }}
                      >
                        {formatCell(val, vi)}
                      </td>
                    );
                  });
                })}
                {/* Row totals */}
                {showTotals &&
                  values.map((_, vi) => (
                    <td
                      key={`rt-${rk}-${vi}`}
                      className={cn(
                        cellPadding,
                        `border ${borderColor}`,
                        headerBg,
                        'text-right tabular-nums font-semibold text-[var(--text-primary)]',
                      )}
                    >
                      {formatCell(computeRowTotal(rk, vi), vi)}
                    </td>
                  ))}
              </tr>
            );
          })}

          {/* ── Totals row ── */}
          {showTotals && (
            <tr className={headerBg}>
              <td
                className={cn(
                  cellPadding,
                  `border ${borderColor}`,
                  'font-semibold text-[var(--text-primary)]',
                )}
                colSpan={rowHeaderCount}
              >
                Total
              </td>
              {pivot.colKeys.map((ck) =>
                values.map((_, vi) => (
                  <td
                    key={`ct-${ck}-${vi}`}
                    className={cn(
                      cellPadding,
                      `border ${borderColor}`,
                      'text-right tabular-nums font-semibold text-[var(--text-primary)]',
                    )}
                  >
                    {formatCell(computeColTotal(ck, vi), vi)}
                  </td>
                )),
              )}
              {/* Grand totals */}
              {values.map((_, vi) => (
                <td
                  key={`gt-${vi}`}
                  className={cn(
                    cellPadding,
                    `border ${borderColor}`,
                    'text-right tabular-nums font-bold text-[var(--text-primary)]',
                  )}
                >
                  {formatCell(computeGrandTotal(vi), vi)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

PivotTable.displayName = 'PivotTable';
