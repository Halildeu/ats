import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

export type ComplianceStatus =
  | 'compliant'
  | 'non-compliant'
  | 'partially-compliant'
  | 'not-assessed';
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface GovernanceItem {
  id: string;
  title: string;
  domain: string;
  status: ComplianceStatus;
  severity: SeverityLevel;
  owner?: string;
  findingsCount: number;
  nextReviewDate?: Date;
}

export type GovernanceGroupBy = 'domain' | 'status' | 'severity';

/** Compliance governance board with summary strip, severity indicators, and collapsible groups.
 * @example
 * ```tsx
 * <GovernanceBoard />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/governance-board)
 */
export interface GovernanceBoardProps extends AccessControlledProps {
  /** Governance control items to display */
  items: GovernanceItem[];
  /** Grouping strategy for organizing items */
  groupBy?: GovernanceGroupBy;
  /** Called when a governance item row is clicked */
  onItemClick?: (item: GovernanceItem) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ── Status & Severity config ──

const STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  compliant: {
    label: 'Compliant',
    bg: 'bg-state-success-bg',
    text: 'text-state-success-text',
    dot: 'bg-state-success-text',
  },
  'non-compliant': {
    label: 'Non-Compliant',
    bg: 'bg-state-danger-bg',
    text: 'text-state-danger-text',
    dot: 'bg-state-danger-text',
  },
  'partially-compliant': {
    label: 'Partial',
    bg: 'bg-state-warning-bg',
    text: 'text-state-warning-text',
    dot: 'bg-state-warning-text',
  },
  'not-assessed': {
    label: 'Not Assessed',
    bg: 'bg-surface-muted',
    text: 'text-[var(--text-tertiary)]',
    dot: 'bg-[var(--text-tertiary)]',
  },
};

const SEVERITY_CONFIG: Record<
  SeverityLevel,
  { label: string; borderColor: string; textColor: string }
> = {
  critical: {
    label: 'Critical',
    borderColor: 'border-l-[var(--state-error-text)]',
    textColor: 'text-state-danger-text',
  },
  high: {
    label: 'High',
    borderColor: 'border-l-[var(--state-warning-text)]',
    textColor: 'text-state-warning-text',
  },
  medium: {
    label: 'Medium',
    borderColor: 'border-l-[var(--state-warning-text)]',
    textColor: 'text-state-warning-text',
  },
  low: {
    label: 'Low',
    borderColor: 'border-l-[var(--state-success-text)]',
    textColor: 'text-state-success-text',
  },
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupItems(
  items: GovernanceItem[],
  groupBy: GovernanceGroupBy,
): Map<string, GovernanceItem[]> {
  const map = new Map<string, GovernanceItem[]>();
  for (const item of items) {
    let key: string;
    switch (groupBy) {
      case 'domain':
        key = item.domain;
        break;
      case 'status':
        key = STATUS_CONFIG[item.status].label;
        break;
      case 'severity':
        key = SEVERITY_CONFIG[item.severity].label;
        break;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

// ── Summary Strip ──

interface SummaryStripProps {
  items: GovernanceItem[];
}

const SummaryStrip: React.FC<SummaryStripProps> = ({ items }) => {
  const counts: Record<ComplianceStatus, number> = {
    compliant: 0,
    'non-compliant': 0,
    'partially-compliant': 0,
    'not-assessed': 0,
  };
  for (const item of items) {
    counts[item.status]++;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border-default bg-surface-muted px-4 py-3">
      {(Object.entries(counts) as [ComplianceStatus, number][]).map(([status, count]) => {
        const cfg = STATUS_CONFIG[status];
        return (
          <div key={status} className="flex items-center gap-2">
            <div className={cn('h-2.5 w-2.5 rounded-full', cfg.dot)} />
            <span className="text-xs font-medium text-text-secondary">{cfg.label}</span>
            <span
              className={cn(
                'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                cfg.bg,
                cfg.text,
              )}
            >
              {count}
            </span>
          </div>
        );
      })}
      <div className="ml-auto text-xs text-[var(--text-tertiary)]">
        {items.length} total controls
      </div>
    </div>
  );
};

// ── Component ──

/** Compliance governance board with summary strip, severity indicators, and collapsible groups. */
export const GovernanceBoard: React.FC<GovernanceBoardProps> = ({
  items,
  groupBy = 'domain',
  onItemClick,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const grouped = groupItems(items, groupBy);

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg bg-surface-default overflow-hidden',
        accessStyles(accessState.state),
        className,
      )}
      data-component="governance-board"
      data-access-state={accessState.state}
      title={accessReason}
    >
      {/* Summary strip */}
      <SummaryStrip items={items} />

      {/* Grouped items */}
      <div className="divide-y divide-border-subtle">
        {Array.from(grouped.entries()).map(([groupKey, groupItems]) => {
          const isCollapsed = collapsedGroups.has(groupKey);

          // Group-level stats
          const nonCompliantCount = groupItems.filter((i) => i.status === 'non-compliant').length;
          const criticalCount = groupItems.filter((i) => i.severity === 'critical').length;

          return (
            <div key={groupKey}>
              {/* Group header */}
              <button
                className="flex w-full items-center gap-2 bg-surface-muted/40 px-4 py-2.5 text-left hover:bg-surface-muted"
                onClick={() => toggleGroup(groupKey)}
              >
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {isCollapsed ? '\u25B6' : '\u25BC'}
                </span>
                <span className="text-sm font-semibold text-text-primary">{groupKey}</span>
                <span className="text-xs text-[var(--text-tertiary)]">({groupItems.length})</span>
                {nonCompliantCount > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-state-danger-bg px-2 py-0.5 text-[10px] font-semibold text-state-danger-text">
                    {nonCompliantCount} non-compliant
                  </span>
                )}
                {criticalCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-state-danger-bg px-2 py-0.5 text-[10px] font-semibold text-state-danger-text">
                    {criticalCount} critical
                  </span>
                )}
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="divide-y divide-border-subtle">
                  {groupItems.map((item) => {
                    const statusCfg = STATUS_CONFIG[item.status];
                    const severityCfg = SEVERITY_CONFIG[item.severity];
                    const isReviewOverdue = item.nextReviewDate && item.nextReviewDate < new Date();

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'flex items-center gap-3 border-l-3 px-4 py-3 transition-colors',
                          severityCfg.borderColor,
                          onItemClick && 'cursor-pointer hover:bg-surface-muted/40',
                        )}
                        onClick={() => onItemClick?.(item)}
                      >
                        {/* Title + Domain badge */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary truncate">
                              {item.title}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-secondary shrink-0">
                              {item.domain}
                            </span>
                          </div>

                          {/* Owner + findings + review */}
                          <div className="mt-1 flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                            {item.owner && (
                              <span className="flex items-center gap-1">
                                <span className="opacity-60">{'\u{1F464}'}</span>
                                {item.owner}
                              </span>
                            )}
                            {item.findingsCount > 0 && (
                              <span
                                className={cn(
                                  'flex items-center gap-1',
                                  item.findingsCount > 3 ? 'text-state-danger-text' : '',
                                )}
                              >
                                {item.findingsCount} finding{item.findingsCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {item.nextReviewDate && (
                              <span
                                className={cn(
                                  'flex items-center gap-1',
                                  isReviewOverdue ? 'text-state-danger-text font-medium' : '',
                                )}
                              >
                                Review: {formatDate(item.nextReviewDate)}
                                {isReviewOverdue && ' (overdue)'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Severity indicator */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-xs px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0',
                            severityCfg.textColor,
                          )}
                        >
                          {severityCfg.label}
                        </span>

                        {/* Status badge */}
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold shrink-0',
                            statusCfg.bg,
                            statusCfg.text,
                          )}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">
          No governance controls defined
        </div>
      )}
    </div>
  );
};

GovernanceBoard.displayName = 'GovernanceBoard';
export default GovernanceBoard;
