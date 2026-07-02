import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

export interface GanttTask {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  progress?: number; // 0-100
  color?: string;
  type?: 'task' | 'milestone';
  group?: string;
  dependencies?: string[]; // IDs of tasks this depends on
}

export type GanttViewMode = 'day' | 'week' | 'month' | 'quarter';

/** Props for the GanttTimeline component.
 * @example
 * ```tsx
 * <GanttTimeline />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/gantt-timeline)
 */
export interface GanttTimelineProps extends AccessControlledProps {
  /** Task data to render in the timeline. */
  tasks: GanttTask[];
  /** Time-axis granularity for the timeline header. */
  viewMode?: GanttViewMode;
  /** Group tasks by the specified field. */
  groupBy?: 'group';
  /** Whether to render dependency arrows between tasks. */
  showDependencies?: boolean;
  /** Callback fired when a task bar is clicked. */
  onTaskClick?: (task: GanttTask) => void;
  /** Callback fired when a task bar is dragged to new dates. */
  onTaskDrag?: (task: GanttTask, newStart: Date, newEnd: Date) => void;
  /** Additional CSS class name. */
  className?: string;
}

// ── Helpers ──

const DAY_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / DAY_MS);
}

function getColumnWidth(mode: GanttViewMode): number {
  switch (mode) {
    case 'day':
      return 36;
    case 'week':
      return 20;
    case 'month':
      return 6;
    case 'quarter':
      return 2;
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateHeader(date: Date, mode: GanttViewMode): string {
  const locale = 'tr-TR';
  switch (mode) {
    case 'day':
      return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    case 'week': {
      const end = addDays(date, 6);
      return `${date.toLocaleDateString(locale, { day: 'numeric' })}-${end.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
    }
    case 'month':
      return date.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    case 'quarter': {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `Q${q} ${date.getFullYear()}`;
    }
  }
}

function getTimeSlots(start: Date, end: Date, mode: GanttViewMode): Date[] {
  const slots: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    slots.push(new Date(current));
    switch (mode) {
      case 'day':
        current.setDate(current.getDate() + 1);
        break;
      case 'week':
        current.setDate(current.getDate() + 7);
        break;
      case 'month':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'quarter':
        current.setMonth(current.getMonth() + 3);
        break;
    }
  }
  return slots;
}

/** Parse ISO string or Date to Date object */
function toDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

function computeDateRange(tasks: GanttTask[]): { rangeStart: Date; rangeEnd: Date } {
  if (tasks.length === 0) {
    const now = new Date();
    return { rangeStart: now, rangeEnd: addDays(now, 30) };
  }
  let minStr = tasks[0].startDate;
  let maxStr = tasks[0].endDate;
  for (const t of tasks) {
    if (t.startDate < minStr) minStr = t.startDate;
    if (t.endDate > maxStr) maxStr = t.endDate;
  }
  return {
    rangeStart: addDays(toDate(minStr), -2),
    rangeEnd: addDays(toDate(maxStr), 2),
  };
}

// ── Dependency Arrow ──

interface ArrowProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

const DependencyArrow: React.FC<ArrowProps> = ({ fromX, fromY, toX, toY }) => {
  const midX = (fromX + toX) / 2;
  const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
  return (
    <g>
      <path d={path} fill="none" stroke="var(--border-default)" strokeWidth={1.5} />
      <polygon
        points={`${toX},${toY} ${toX - 5},${toY - 3} ${toX - 5},${toY + 3}`}
        fill="var(--border-default)"
      />
    </g>
  );
};

// ── Row height ──

const ROW_HEIGHT = 40;
const TASK_LABEL_WIDTH = 200;

// ── Component ──

/** Horizontal Gantt timeline displaying tasks, milestones, dependencies, and progress across time. */
export const GanttTimeline: React.FC<GanttTimelineProps> = ({
  tasks,
  viewMode = 'week',
  groupBy,
  showDependencies = false,
  onTaskClick,
  onTaskDrag,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const [dragging, setDragging] = React.useState<{
    taskId: string;
    startX: number;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { rangeStart, rangeEnd } = computeDateRange(tasks);
  const totalDays = daysBetween(rangeStart, rangeEnd);
  const colWidth = getColumnWidth(viewMode);
  const timelineWidth = totalDays * colWidth;

  const timeSlots = getTimeSlots(rangeStart, rangeEnd, viewMode);

  // Build grouped or flat list
  const groups = React.useMemo(() => {
    if (!groupBy) return [{ key: '__all__', label: '', tasks }];

    const map = new Map<string, GanttTask[]>();
    for (const t of tasks) {
      const key = t.group ?? 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([key, tasks]) => ({ key, label: key, tasks }));
  }, [tasks, groupBy]);

  // Flatten visible rows
  const visibleRows: Array<
    { type: 'group'; label: string; key: string; count: number } | { type: 'task'; task: GanttTask }
  > = [];
  for (const group of groups) {
    if (groupBy) {
      visibleRows.push({
        type: 'group',
        label: group.label,
        key: group.key,
        count: group.tasks.length,
      });
      if (collapsedGroups.has(group.key)) continue;
    }
    for (const task of group.tasks) {
      visibleRows.push({ type: 'task', task });
    }
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Today marker position
  const today = new Date();
  const todayOffset = daysBetween(rangeStart, today) * colWidth;
  const showTodayMarker = today >= rangeStart && today <= rangeEnd;

  // Task position map for dependency arrows
  const taskPositionMap = new Map<string, { x: number; y: number; width: number }>();
  let rowIndex = 0;
  for (const row of visibleRows) {
    if (row.type === 'task') {
      const t = row.task;
      const left = daysBetween(rangeStart, toDate(t.startDate)) * colWidth;
      const width = Math.max(daysBetween(toDate(t.startDate), toDate(t.endDate)) * colWidth, 8);
      taskPositionMap.set(t.id, { x: left, y: rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2, width });
    }
    rowIndex++;
  }

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, task: GanttTask) => {
    if (!onTaskDrag || accessState.isReadonly || accessState.isDisabled) return;
    e.preventDefault();
    setDragging({
      taskId: task.id,
      startX: e.clientX,
      originalStart: task.startDate,
      originalEnd: task.endDate,
    });
  };

  React.useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      const deltaX = e.clientX - dragging.startX;
      const deltaDays = Math.round(deltaX / colWidth);
      if (deltaDays === 0) return;
      const newStart = addDays(dragging.originalStart, deltaDays);
      const newEnd = addDays(dragging.originalEnd, deltaDays);
      onTaskDrag?.(tasks.find((t) => t.id === dragging.taskId)!, newStart, newEnd);
    };
    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, colWidth, onTaskDrag, tasks]);

  const totalHeight = visibleRows.length * ROW_HEIGHT;

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg overflow-hidden bg-surface-default',
        accessStyles(accessState.state),
        className,
      )}
      data-component="gantt-timeline"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <div className="flex overflow-x-auto" ref={containerRef}>
        {/* Left: Task labels */}
        <div
          className="shrink-0 border-r border-border-default"
          style={{ width: TASK_LABEL_WIDTH }}
        >
          {/* Header */}
          <div className="h-10 border-b border-border-default bg-surface-muted px-3 flex items-center">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Tasks
            </span>
          </div>
          {/* Rows */}
          {visibleRows.map((row, i) => (
            <div
              key={i}
              className="flex items-center border-b border-border-subtle px-3"
              style={{ height: ROW_HEIGHT }}
            >
              {row.type === 'group' ? (
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-text-primary w-full text-left"
                  onClick={() => toggleGroup(row.key)}
                >
                  <span className="text-[10px]">
                    {collapsedGroups.has(row.key) ? '\u25B6' : '\u25BC'}
                  </span>
                  {row.label}
                  <span className="ml-auto text-[var(--text-tertiary)]">({row.count})</span>
                </button>
              ) : (
                <span
                  role={onTaskClick ? 'button' : undefined}
                  tabIndex={onTaskClick ? 0 : undefined}
                  className={cn(
                    'text-sm text-text-primary truncate',
                    onTaskClick && 'cursor-pointer hover:underline',
                  )}
                  onClick={() => onTaskClick?.(row.task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTaskClick?.(row.task);
                    }
                  }}
                  title={row.task.title}
                >
                  {row.task.type === 'milestone' && (
                    <span className="mr-1 text-state-warning-text">{'\u25C6'}</span>
                  )}
                  {row.task.title}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Right: Timeline area */}
        <div className="flex-1 overflow-x-auto">
          {/* Time header */}
          <div
            className="flex h-10 border-b border-border-default bg-surface-muted"
            style={{ width: timelineWidth }}
          >
            {timeSlots.map((slot, i) => {
              const slotDays =
                viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : viewMode === 'month' ? 30 : 90;
              return (
                <div
                  key={i}
                  className="shrink-0 border-r border-border-subtle flex items-center justify-center"
                  style={{ width: slotDays * colWidth }}
                >
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium whitespace-nowrap">
                    {formatDateHeader(slot, viewMode)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bars area */}
          <div className="relative" style={{ width: timelineWidth, height: totalHeight }}>
            {/* Grid lines */}
            {timeSlots.map((_, i) => {
              const slotDays =
                viewMode === 'day' ? 1 : viewMode === 'week' ? 7 : viewMode === 'month' ? 30 : 90;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r border-border-subtle opacity-30"
                  style={{ left: i * slotDays * colWidth }}
                />
              );
            })}

            {/* Row backgrounds */}
            {visibleRows.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'absolute left-0 right-0 border-b border-border-subtle',
                  i % 2 === 0 && 'bg-surface-muted/30',
                )}
                style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            ))}

            {/* Task bars */}
            {visibleRows.map((row, i) => {
              if (row.type !== 'task') return null;
              const t = row.task;
              const left = daysBetween(rangeStart, toDate(t.startDate)) * colWidth;
              const width = Math.max(
                daysBetween(toDate(t.startDate), toDate(t.endDate)) * colWidth,
                8,
              );
              const barColor = t.color ?? 'var(--interactive-primary)';
              const progress = Math.min(Math.max(t.progress ?? 0, 0), 100);

              if (t.type === 'milestone') {
                return (
                  <div
                    key={t.id}
                    role={onTaskClick ? 'button' : undefined}
                    tabIndex={onTaskClick ? 0 : undefined}
                    className="absolute flex items-center justify-center cursor-pointer"
                    style={{ left: left - 8, top: i * ROW_HEIGHT + 8, width: 24, height: 24 }}
                    onClick={() => onTaskClick?.(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTaskClick?.(t);
                      }
                    }}
                    title={t.title}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <polygon points="10,0 20,10 10,20 0,10" fill={barColor} />
                    </svg>
                  </div>
                );
              }

              return (
                <div
                  key={t.id}
                  role={onTaskClick ? 'button' : undefined}
                  tabIndex={onTaskClick ? 0 : undefined}
                  className={cn(
                    'absolute rounded-xs overflow-hidden',
                    onTaskClick && 'cursor-pointer',
                    onTaskDrag && 'cursor-grab active:cursor-grabbing',
                  )}
                  style={{ left, top: i * ROW_HEIGHT + 10, width, height: ROW_HEIGHT - 20 }}
                  onClick={() => onTaskClick?.(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTaskClick?.(t);
                    }
                  }}
                  onMouseDown={(e) => handleMouseDown(e, t)}
                  title={`${t.title} (${progress}%)`}
                >
                  {/* Background */}
                  <div
                    className="absolute inset-0 rounded-xs opacity-30"
                    style={{ backgroundColor: barColor }}
                  />
                  {/* Progress fill */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-xs"
                    style={{ width: `${progress}%`, backgroundColor: barColor }}
                  />
                  {/* Label */}
                  {width > 60 && (
                    <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-text-primary truncate pointer-events-none">
                      {t.title}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Today marker */}
            {showTodayMarker && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-state-danger-text z-10 pointer-events-none"
                style={{ left: todayOffset }}
              >
                <div className="absolute -top-1 -left-1.5 w-3 h-3 rounded-full bg-state-danger-text" />
              </div>
            )}

            {/* Dependency arrows (SVG overlay) */}
            {showDependencies && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width={timelineWidth}
                height={totalHeight}
              >
                {visibleRows.map((row) => {
                  if (row.type !== 'task' || !row.task.dependencies?.length) return null;
                  const toPos = taskPositionMap.get(row.task.id);
                  if (!toPos) return null;
                  return row.task.dependencies.map((depId) => {
                    const fromPos = taskPositionMap.get(depId);
                    if (!fromPos) return null;
                    return (
                      <DependencyArrow
                        key={`${depId}-${row.task.id}`}
                        fromX={fromPos.x + fromPos.width}
                        fromY={fromPos.y}
                        toX={toPos.x}
                        toY={toPos.y}
                      />
                    );
                  });
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

GanttTimeline.displayName = 'GanttTimeline';
export default GanttTimeline;
