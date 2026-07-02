import React, { forwardRef, useMemo } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Progress — Linear, Circular, Dashboard & Stepped progress bar      */
/* ------------------------------------------------------------------ */

export type ProgressType = 'line' | 'circle' | 'dashboard';
export type ProgressStatus = 'normal' | 'active' | 'success' | 'exception';
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Progress type. @default 'line' */
  type?: ProgressType;
  /** Completion percentage (0-100). @default 0 */
  percent?: number;
  /** Status variant. @default 'normal' */
  status?: ProgressStatus;
  /** Size preset. @default 'md' */
  size?: ProgressSize;
  /** Show percentage text. @default true */
  showInfo?: boolean;
  /** Custom format for info text. */
  format?: (percent: number) => React.ReactNode;
  /** Number of segments (stepped mode, line only). */
  steps?: number;
  /** Line thickness override. */
  strokeWidth?: number;
  /** Custom stroke color (overrides status). */
  strokeColor?: string;
  /** Track background color. */
  trailColor?: string;
}

/* ---- Constants ---- */

const statusColors: Record<ProgressStatus, string> = {
  normal: 'var(--action-primary)',
  active: 'var(--action-primary)',
  success: 'var(--state-success-text)',
  exception: 'var(--state-danger-text)',
};

const statusTrailColors: Record<ProgressStatus, string> = {
  normal: 'var(--border-subtle)',
  active: 'var(--border-subtle)',
  success: 'var(--state-success-bg)',
  exception: 'var(--state-danger-bg)',
};

const statusTextColors: Record<ProgressStatus, string> = {
  normal: 'text-text-secondary',
  active: 'text-action-primary',
  success: 'text-state-success-text',
  exception: 'text-state-danger-text',
};

const lineSizeMap: Record<ProgressSize, { height: number; fontSize: string }> = {
  sm: { height: 4, fontSize: 'text-xs' },
  md: { height: 8, fontSize: 'text-sm' },
  lg: { height: 12, fontSize: 'text-base' },
};

const circleSizeMap: Record<ProgressSize, { diameter: number; strokeWidth: number; fontSize: string }> = {
  sm: { diameter: 60, strokeWidth: 4, fontSize: 'text-sm' },
  md: { diameter: 80, strokeWidth: 6, fontSize: 'text-lg' },
  lg: { diameter: 120, strokeWidth: 8, fontSize: 'text-2xl' },
};

/* ---- Status icons ---- */

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/* ---- Line Progress ---- */

const LineProgress: React.FC<{
  percent: number; status: ProgressStatus; size: ProgressSize;
  showInfo: boolean; format?: (p: number) => React.ReactNode;
  steps?: number; strokeWidth?: number; strokeColor?: string; trailColor?: string;
}> = ({ percent, status, size, showInfo, format, steps, strokeWidth, strokeColor, trailColor }) => {
  const { height, fontSize } = lineSizeMap[size];
  const h = strokeWidth ?? height;
  const resolvedStatus = percent >= 100 && status === 'normal' ? 'success' : status;
  const fill = strokeColor ?? statusColors[resolvedStatus];
  const trail = trailColor ?? statusTrailColors[resolvedStatus];
  const clamped = Math.max(0, Math.min(100, percent));

  const infoContent = useMemo(() => {
    if (!showInfo) return null;
    if (format) return format(clamped);
    if (resolvedStatus === 'success') return <CheckIcon className="h-4 w-4" />;
    if (resolvedStatus === 'exception') return <XIcon className="h-4 w-4" />;
    return `${Math.round(clamped)}%`;
  }, [showInfo, format, clamped, resolvedStatus]);

  if (steps) {
    const stepWidth = 100 / steps;
    const filledSteps = Math.round((clamped / 100) * steps);
    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-0.5">
          {Array.from({ length: steps }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors duration-(--motion-duration-slow)"
              style={{
                height: h,
                backgroundColor: i < filledSteps ? fill : trail,
              }}
            />
          ))}
        </div>
        {showInfo && <span className={cn(fontSize, 'shrink-0 font-medium', statusTextColors[resolvedStatus])}>{infoContent}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 overflow-hidden rounded-full" style={{ height: h, backgroundColor: trail }}>
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-(--motion-duration-slow) ease-out',
            status === 'active' && 'animate-pulse',
          )}
          style={{ width: `${clamped}%`, backgroundColor: fill }}
        />
      </div>
      {showInfo && <span className={cn(fontSize, 'shrink-0 font-medium', statusTextColors[resolvedStatus])}>{infoContent}</span>}
    </div>
  );
};

/* ---- Circle / Dashboard Progress ---- */

const CircleProgress: React.FC<{
  percent: number; status: ProgressStatus; size: ProgressSize; type: 'circle' | 'dashboard';
  showInfo: boolean; format?: (p: number) => React.ReactNode;
  strokeWidth?: number; strokeColor?: string; trailColor?: string;
}> = ({ percent, status, size, type, showInfo, format, strokeWidth: sw, strokeColor, trailColor }) => {
  const { diameter, strokeWidth: defaultSw, fontSize } = circleSizeMap[size];
  const strokeWidth = sw ?? defaultSw;
  const resolvedStatus = percent >= 100 && status === 'normal' ? 'success' : status;
  const fill = strokeColor ?? statusColors[resolvedStatus];
  const trail = trailColor ?? statusTrailColors[resolvedStatus];
  const clamped = Math.max(0, Math.min(100, percent));

  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapDeg = type === 'dashboard' ? 75 : 0;
  const gapRad = (gapDeg / 180) * Math.PI;
  const arcLength = circumference * (1 - gapDeg / 360);
  const dashOffset = arcLength * (1 - clamped / 100);
  const rotation = type === 'dashboard' ? 90 + gapDeg / 2 : -90;

  const infoContent = useMemo(() => {
    if (!showInfo) return null;
    if (format) return format(clamped);
    if (resolvedStatus === 'success') return <CheckIcon className="h-6 w-6" />;
    if (resolvedStatus === 'exception') return <XIcon className="h-6 w-6" />;
    return `${Math.round(clamped)}%`;
  }, [showInfo, format, clamped, resolvedStatus]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: diameter, height: diameter }}>
      <svg viewBox={`0 0 ${diameter} ${diameter}`} className="transform" style={{ transform: `rotate(${rotation}deg)` }}>
        {/* Trail */}
        <circle
          cx={diameter / 2} cy={diameter / 2} r={radius}
          fill="none" stroke={trail} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
        />
        {/* Fill */}
        <circle
          cx={diameter / 2} cy={diameter / 2} r={radius}
          fill="none" stroke={fill} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          className="transition-all duration-(--motion-duration-slow) ease-out"
        />
      </svg>
      {showInfo && (
        <span className={cn('absolute inset-0 flex items-center justify-center font-semibold', fontSize, statusTextColors[resolvedStatus])}>
          {infoContent}
        </span>
      )}
    </div>
  );
};

/* ---- Main Component ---- */

/**
 * Progress indicator with line, circle, dashboard, and stepped variants.
 * Supports status-based coloring via design tokens, custom formatting,
 * and animated fill transitions.
 *
 * @example
 * ```tsx
 * <Progress percent={65} status="active" />
 * <Progress type="circle" percent={80} size="lg" />
 * <Progress type="dashboard" percent={45} />
 * <Progress percent={30} steps={5} />
 * ```
 *
 * @since 1.1.0
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  function Progress(
    {
      type = 'line',
      percent = 0,
      status = 'normal',
      size = 'md',
      showInfo = true,
      format,
      steps,
      strokeWidth,
      strokeColor,
      trailColor,
      className,
      ...rest
    },
    ref,
  ) {
    const shared = { percent, status, size, showInfo, format, strokeWidth, strokeColor, trailColor };

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={Math.round(Math.max(0, Math.min(100, percent)))}
        aria-valuemin={0}
        aria-valuemax={100}
        {...stateAttrs({ component: 'progress', status: status === 'exception' ? 'error' : status === 'success' ? 'success' : undefined })}
        className={cn('w-full', className)}
        {...rest}
      >
        {type === 'line' ? (
          <LineProgress {...shared} steps={steps} />
        ) : (
          <CircleProgress {...shared} type={type} />
        )}
      </div>
    );
  },
);

Progress.displayName = 'Progress';
