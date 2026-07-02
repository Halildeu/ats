import React, { useMemo } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepCategory = 'value-add' | 'necessary-waste' | 'waste';

export type TimeUnit = 'minutes' | 'hours' | 'days';

export interface ValueStreamStep {
  id: string;
  label: string;
  processTime: number;
  resources?: number;
  fpy?: number; // First Pass Yield as percent (e.g., 95)
  inventory?: number;
  category?: StepCategory;
}

export interface ValueStreamWait {
  duration: number;
  inventory?: number;
}

/** Lean value stream map showing process steps, wait times, and PCE metrics. */
export interface ValueStreamProps extends AccessControlledProps {
  /** Process steps in the value stream */
  steps: ValueStreamStep[];
  /** Wait/queue times between consecutive steps */
  waits?: ValueStreamWait[];
  /** Unit of measurement for all time values */
  timeUnit?: TimeUnit;
  /** Called when a process step box is clicked */
  onStepClick?: (stepId: string) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<StepCategory, { border: string; bg: string }> = {
  'value-add': { border: 'border-state-success-text', bg: 'bg-state-success-bg' },
  'necessary-waste': { border: 'border-state-warning-text', bg: 'bg-state-warning-bg' },
  waste: { border: 'border-state-danger-text', bg: 'bg-state-danger-bg' },
};

function formatTime(value: number, unit: TimeUnit): string {
  switch (unit) {
    case 'minutes':
      if (value >= 60) return `${(value / 60).toFixed(1)}h`;
      return `${value}m`;
    case 'hours':
      if (value >= 24) return `${(value / 24).toFixed(1)}d`;
      return `${value}h`;
    case 'days':
      return `${value}d`;
    default:
      return `${value}`;
  }
}

function computeMetrics(steps: ValueStreamStep[], waits: ValueStreamWait[], unit: TimeUnit) {
  const totalProcess = steps.reduce((sum, s) => sum + s.processTime, 0);
  const totalWait = waits.reduce((sum, w) => sum + w.duration, 0);
  const leadTime = totalProcess + totalWait;
  const pce = leadTime > 0 ? (totalProcess / leadTime) * 100 : 0;
  return {
    totalProcess,
    totalWait,
    leadTime,
    pce,
    processFormatted: formatTime(totalProcess, unit),
    waitFormatted: formatTime(totalWait, unit),
    leadFormatted: formatTime(leadTime, unit),
    pceFormatted: `${pce.toFixed(1)}%`,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepBox({
  step,
  unit,
  onClick,
  disabled,
}: {
  step: ValueStreamStep;
  unit: TimeUnit;
  onClick?: () => void;
  disabled: boolean;
}) {
  const cat = step.category ?? 'value-add';
  const styles = CATEGORY_STYLES[cat];

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg border-2 px-4 py-3 min-w-[120px] transition-shadow',
        styles.border,
        styles.bg,
        !disabled && onClick && 'cursor-pointer hover:shadow-md',
      )}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled) onClick();
      }}
    >
      <span className="text-sm font-semibold text-text-primary text-center leading-tight">
        {step.label}
      </span>
      <div className="mt-1 flex flex-col items-center gap-0.5 text-xs text-text-secondary">
        <span>
          PT: <strong className="text-text-primary">{formatTime(step.processTime, unit)}</strong>
        </span>
        {step.resources !== undefined && (
          <span>
            Res: <strong className="text-text-primary">{step.resources}</strong>
          </span>
        )}
        {step.fpy !== undefined && (
          <span>
            FPY: <strong className="text-text-primary">{step.fpy}%</strong>
          </span>
        )}
      </div>
      {step.inventory !== undefined && (
        <span className="mt-1 inline-flex items-center rounded-full bg-state-info-bg px-2 py-0.5 text-[10px] font-medium text-action-primary">
          inv: {step.inventory}
        </span>
      )}
    </div>
  );
}

function WaitArrow({ wait, unit }: { wait: ValueStreamWait; unit: TimeUnit }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <div className="flex items-center gap-1">
        <div className="h-0.5 w-6 bg-border-default" />
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6h8M7 3l3 3-3 3"
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-xs font-medium text-state-danger-text">
        {formatTime(wait.duration, unit)}
      </span>
      {wait.inventory !== undefined && (
        <span className="text-[10px] text-text-secondary">inv: {wait.inventory}</span>
      )}
    </div>
  );
}

function TimelineBar({
  totalProcess,
  totalWait,
  leadFormatted,
  processFormatted,
  waitFormatted,
  pceFormatted,
}: {
  totalProcess: number;
  totalWait: number;
  leadFormatted: string;
  processFormatted: string;
  waitFormatted: string;
  pceFormatted: string;
}) {
  const total = totalProcess + totalWait;
  const processPct = total > 0 ? (totalProcess / total) * 100 : 50;
  const waitPct = total > 0 ? (totalWait / total) * 100 : 50;

  return (
    <div className="flex flex-col mt-4 gap-2 border-t border-border-default pt-3">
      {/* Bar */}
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center bg-state-success-text text-[10px] font-bold text-text-inverse transition-all"
          style={{ width: `${processPct}%`, minWidth: '30px' }}
        >
          {processFormatted}
        </div>
        <div
          className="flex items-center justify-center bg-state-danger-text text-[10px] font-bold text-text-inverse transition-all"
          style={{ width: `${waitPct}%`, minWidth: '30px' }}
        >
          {waitFormatted}
        </div>
      </div>

      {/* Summary stats */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <span>
          Process: <strong className="text-state-success-text">{processFormatted}</strong>
        </span>
        <span className="text-border-default">|</span>
        <span>
          Wait: <strong className="text-state-danger-text">{waitFormatted}</strong>
        </span>
        <span className="text-border-default">|</span>
        <span>
          Lead: <strong className="text-text-primary">{leadFormatted}</strong>
        </span>
        <span className="text-border-default">|</span>
        <span>
          PCE: <strong className="text-action-primary">{pceFormatted}</strong>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValueStream component
// ---------------------------------------------------------------------------

/**
 * Lean value stream map showing process steps, wait times, and PCE metrics.
 *
 * @example
 * ```tsx
 * <ValueStream
 *   steps={[
 *     { id: 'cut', label: 'Cutting', processTime: 30, category: 'value-add' },
 *     { id: 'weld', label: 'Welding', processTime: 45, category: 'value-add' },
 *   ]}
 *   waits={[{ duration: 120 }]}
 *   timeUnit="minutes"
 * />
 * ```
 */
export function ValueStream({
  steps,
  waits = [],
  timeUnit = 'minutes',
  onStepClick,
  access,
  accessReason,
  className,
}: ValueStreamProps) {
  const { state, isHidden, isDisabled } = resolveAccessState(access);

  const metrics = useMemo(() => computeMetrics(steps, waits, timeUnit), [steps, waits, timeUnit]);

  if (isHidden) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-border-default bg-[var(--surface-primary)] p-4',
        accessStyles(state),
        className,
      )}
      data-access-state={state}
      role="figure"
      aria-label="Value stream map"
      title={accessReason}
    >
      {/* Flow row */}
      <div className="flex items-center overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <StepBox
              step={step}
              unit={timeUnit}
              onClick={onStepClick ? () => onStepClick(step.id) : undefined}
              disabled={isDisabled}
            />
            {i < steps.length - 1 && (
              <WaitArrow wait={waits[i] ?? { duration: 0 }} unit={timeUnit} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Timeline bar */}
      <TimelineBar
        totalProcess={metrics.totalProcess}
        totalWait={metrics.totalWait}
        leadFormatted={metrics.leadFormatted}
        processFormatted={metrics.processFormatted}
        waitFormatted={metrics.waitFormatted}
        pceFormatted={metrics.pceFormatted}
      />
    </div>
  );
}

ValueStream.displayName = 'ValueStream';
