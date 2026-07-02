import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import {
  formatValue,
  getTrendIcon,
  getTrendColor,
  type FormatOptions,
  type TrendDirection,
} from '../../utils/format-helpers';

// ── Types ──

export interface ComparisonRow {
  id: string;
  label: string;
  actual: number;
  target: number;
  format?: FormatOptions;
  children?: ComparisonRow[];
}

export interface ComparisonColumnLabels {
  label?: string;
  actual?: string;
  target?: string;
  variance?: string;
  variancePercent?: string;
}

/** Table comparing actual vs target values with variance and trend indicators.
 * @example
 * ```tsx
 * <ComparisonTable />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/comparison-table)
 */
export interface ComparisonTableProps extends AccessControlledProps {
  /** Data rows to display, supports nested children for hierarchical grouping */
  rows: ComparisonRow[];
  /** Custom column header labels */
  columns?: ComparisonColumnLabels;
  /** Default number formatting applied when a row does not specify its own */
  defaultFormat?: FormatOptions;
  /** Row IDs that should be expanded on initial render */
  defaultExpandedIds?: string[];
  /** When true, negative variance is shown as positive (e.g., cost reduction) */
  invertVarianceColors?: boolean;
  /** Called when a data row is clicked */
  onRowClick?: (row: ComparisonRow) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ── Helpers ──

function computeVariance(
  actual: number,
  target: number,
): { absolute: number; percent: number; direction: TrendDirection } {
  const absolute = actual - target;
  const percent = target !== 0 ? (absolute / Math.abs(target)) * 100 : 0;
  const direction: TrendDirection = absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat';
  return { absolute, percent, direction };
}

function getVarianceClass(direction: TrendDirection, invert: boolean): string {
  if (direction === 'flat') return 'text-text-secondary';
  const isPositive = invert ? direction === 'down' : direction === 'up';
  return isPositive ? 'text-state-success-text' : 'text-state-danger-text';
}

function flattenRows(rows: ComparisonRow[]): { totals: { actual: number; target: number } } {
  let actual = 0;
  let target = 0;
  for (const row of rows) {
    if (row.children && row.children.length > 0) {
      // Parent rows aggregate from children
      const sub = flattenRows(row.children);
      actual += sub.totals.actual;
      target += sub.totals.target;
    } else {
      actual += row.actual;
      target += row.target;
    }
  }
  return { totals: { actual, target } };
}

// ── Row component ──

interface RowRendererProps {
  row: ComparisonRow;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  defaultFormat: FormatOptions;
  invertVarianceColors: boolean;
  onRowClick?: (row: ComparisonRow) => void;
}

const RowRenderer: React.FC<RowRendererProps> = ({
  row,
  depth,
  expandedIds,
  onToggle,
  defaultFormat,
  invertVarianceColors,
  onRowClick,
}) => {
  const hasChildren = row.children && row.children.length > 0;
  const isExpanded = expandedIds.has(row.id);
  const fmt = row.format ?? defaultFormat;
  const variance = computeVariance(row.actual, row.target);
  const varClass = getVarianceClass(variance.direction, invertVarianceColors);
  const indent = depth * 20;

  return (
    <>
      <tr
        className={cn(
          'border-b border-border-subtle transition-colors',
          onRowClick && 'cursor-pointer hover:bg-surface-muted',
          hasChildren && 'font-medium',
        )}
        onClick={() => onRowClick?.(row)}
      >
        {/* Label */}
        <td className="py-2.5 px-3 text-sm text-text-primary">
          <div className="flex items-center" style={{ paddingLeft: indent }}>
            {hasChildren && (
              <button
                className="mr-1.5 text-[10px] text-[var(--text-tertiary)] hover:text-text-primary w-4 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(row.id);
                }}
              >
                {isExpanded ? '\u25BC' : '\u25B6'}
              </button>
            )}
            {!hasChildren && depth > 0 && <span className="w-4 shrink-0" />}
            <span className="truncate">{row.label}</span>
          </div>
        </td>

        {/* Actual */}
        <td className="py-2.5 px-3 text-sm text-right font-mono text-text-primary">
          {formatValue(row.actual, fmt)}
        </td>

        {/* Target */}
        <td className="py-2.5 px-3 text-sm text-right font-mono text-text-secondary">
          {formatValue(row.target, fmt)}
        </td>

        {/* Variance */}
        <td className={cn('py-2.5 px-3 text-sm text-right font-mono', varClass)}>
          {variance.absolute >= 0 ? '+' : ''}
          {formatValue(variance.absolute, fmt)}
        </td>

        {/* Variance % */}
        <td className={cn('py-2.5 px-3 text-sm text-right whitespace-nowrap', varClass)}>
          <span className="inline-flex items-center gap-1">
            <span style={{ color: getTrendColor(variance.direction, invertVarianceColors) }}>
              {getTrendIcon(variance.direction)}
            </span>
            <span className="font-mono">{Math.abs(Math.round(variance.percent * 10) / 10)}%</span>
          </span>
        </td>
      </tr>

      {/* Children */}
      {hasChildren &&
        isExpanded &&
        row.children!.map((child) => (
          <RowRenderer
            key={child.id}
            row={child}
            depth={depth + 1}
            expandedIds={expandedIds}
            onToggle={onToggle}
            defaultFormat={defaultFormat}
            invertVarianceColors={invertVarianceColors}
            onRowClick={onRowClick}
          />
        ))}
    </>
  );
};

// ── Component ──

/** Table comparing actual vs target values with variance and trend indicators. */
export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  rows,
  columns = {},
  defaultFormat = { format: 'currency' },
  defaultExpandedIds = [],
  invertVarianceColors = false,
  onRowClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { totals } = flattenRows(rows);
  const totalVariance = computeVariance(totals.actual, totals.target);
  const totalVarClass = getVarianceClass(totalVariance.direction, invertVarianceColors);

  const colLabels = {
    label: columns.label ?? 'Item',
    actual: columns.actual ?? 'Actual',
    target: columns.target ?? 'Target',
    variance: columns.variance ?? 'Variance',
    variancePercent: columns.variancePercent ?? '%',
  };

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg bg-surface-default overflow-hidden',
        accessStyles(accessState.state),
        className,
      )}
      data-component="comparison-table"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-muted border-b border-border-default">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {colLabels.label}
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide w-28">
                {colLabels.actual}
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide w-28">
                {colLabels.target}
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide w-28">
                {colLabels.variance}
              </th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wide w-20">
                {colLabels.variancePercent}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <RowRenderer
                key={row.id}
                row={row}
                depth={0}
                expandedIds={expandedIds}
                onToggle={toggleExpand}
                defaultFormat={defaultFormat}
                invertVarianceColors={invertVarianceColors}
                onRowClick={onRowClick}
              />
            ))}
          </tbody>

          {/* Footer totals */}
          <tfoot>
            <tr className="bg-surface-muted border-t-2 border-border-default">
              <td className="py-3 px-3 text-sm font-bold text-text-primary">Total</td>
              <td className="py-3 px-3 text-sm text-right font-mono font-bold text-text-primary">
                {formatValue(totals.actual, defaultFormat)}
              </td>
              <td className="py-3 px-3 text-sm text-right font-mono font-bold text-text-secondary">
                {formatValue(totals.target, defaultFormat)}
              </td>
              <td className={cn('py-3 px-3 text-sm text-right font-mono font-bold', totalVarClass)}>
                {totalVariance.absolute >= 0 ? '+' : ''}
                {formatValue(totalVariance.absolute, defaultFormat)}
              </td>
              <td className={cn('py-3 px-3 text-sm text-right font-bold', totalVarClass)}>
                <span className="inline-flex items-center gap-1">
                  <span
                    style={{ color: getTrendColor(totalVariance.direction, invertVarianceColors) }}
                  >
                    {getTrendIcon(totalVariance.direction)}
                  </span>
                  <span className="font-mono">
                    {Math.abs(Math.round(totalVariance.percent * 10) / 10)}%
                  </span>
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

ComparisonTable.displayName = 'ComparisonTable';
export default ComparisonTable;
