import React, { useState, useCallback, useRef, useEffect } from 'react';
import { resolveAccessState, accessStyles } from '../../internal/access-controller';
import type { AccessLevel } from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStepStatus = 'pending' | 'in-review' | 'approved' | 'rejected' | 'skipped';

export interface ApprovalAssignee {
  id: string;
  name: string;
  avatarUrl?: string;
  initials?: string;
}

export interface ApprovalStep {
  id: string;
  label: string;
  status: ApprovalStepStatus;
  assignee?: ApprovalAssignee;
  timestamp?: string;
  comment?: string;
}

/** Multi-step approval workflow with approve, reject, and delegate actions.
 * @example
 * ```tsx
 * <ApprovalWorkflow />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/approval-workflow)
 */
export interface ApprovalWorkflowProps {
  /** Ordered list of approval steps to render */
  steps: ApprovalStep[];
  /** Index of the step currently active (0-based). Defaults to first non-completed step. */
  currentStepIndex?: number;
  /** Layout direction of the workflow steps */
  orientation?: 'horizontal' | 'vertical';
  /** Compact hides timestamps and comments inline */
  compact?: boolean;
  /** Access level controlling visibility and interactivity */
  access?: AccessLevel;
  /** Tooltip text explaining the current access restriction */
  accessReason?: string;
  /** Called when the current step is approved */
  onApprove?: (stepId: string) => void;
  /** Called when the current step is rejected with a comment */
  onReject?: (stepId: string, comment: string) => void;
  /** Called when the current step is delegated to a new assignee */
  onDelegate?: (stepId: string, newAssignee: string) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<ApprovalStepStatus, { path: string; color: string; label: string }> = {
  pending: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    color: 'var(--text-secondary)',
    label: 'Pending',
  },
  'in-review': {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4v6l4 2',
    color: 'var(--state-info-text)',
    label: 'In review',
  },
  approved: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.5 14.5L6 12l1.4-1.4 3.1 3.1 6.1-6.1L18 9l-7.5 7.5z',
    color: 'var(--state-success-text)',
    label: 'Approved',
  },
  rejected: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.3 12.9L14.9 16.3 12 13.4l-2.9 2.9-1.4-1.4L10.6 12 7.7 9.1l1.4-1.4L12 10.6l2.9-2.9 1.4 1.4L13.4 12l2.9 2.9z',
    color: 'var(--state-error-text)',
    label: 'Rejected',
  },
  skipped: {
    path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-4 9h8v2H8v-2z',
    color: 'var(--text-secondary)',
    label: 'Skipped',
  },
};

function StatusIcon({ status, size = 24 }: { status: ApprovalStepStatus; size?: number }) {
  const cfg = STATUS_ICONS[status];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={cfg.label}
      role="img"
      className="shrink-0"
    >
      <path d={cfg.path} fill={cfg.color} fillRule="evenodd" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ assignee, size = 28 }: { assignee: ApprovalAssignee; size?: number }) {
  const initials =
    assignee.initials ??
    assignee.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  if (assignee.avatarUrl) {
    return (
      <img
        src={assignee.avatarUrl}
        alt={assignee.name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-surface-muted text-text-secondary text-xs font-medium shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Connector line
// ---------------------------------------------------------------------------

function Connector({
  completed,
  orientation,
}: {
  completed: boolean;
  orientation: 'horizontal' | 'vertical';
}) {
  const base =
    orientation === 'horizontal'
      ? 'flex-1 h-0.5 min-w-[16px] self-center mx-1'
      : 'w-0.5 min-h-[24px] self-center my-1 ml-[11px]';

  return (
    <div
      className={`${base} ${completed ? 'bg-state-success-text' : 'border-border-default'}`}
      style={
        completed
          ? undefined
          : {
              backgroundImage:
                orientation === 'horizontal'
                  ? 'repeating-linear-gradient(to right, var(--border-default), var(--border-default) 4px, transparent 4px, transparent 8px)'
                  : 'repeating-linear-gradient(to bottom, var(--border-default), var(--border-default) 4px, transparent 4px, transparent 8px)',
              backgroundSize: orientation === 'horizontal' ? '8px 2px' : '2px 8px',
              height: orientation === 'horizontal' ? '2px' : undefined,
              width: orientation === 'vertical' ? '2px' : undefined,
            }
      }
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

interface StepCardProps {
  step: ApprovalStep;
  isCurrent: boolean;
  compact: boolean;
  orientation: 'horizontal' | 'vertical';
  canAct: boolean;
  onApprove?: () => void;
  onReject?: (comment: string) => void;
  onDelegate?: (assignee: string) => void;
}

function StepCard({
  step,
  isCurrent,
  compact,
  orientation,
  canAct,
  onApprove,
  onReject,
  onDelegate,
}: StepCardProps) {
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showDelegateBox, setShowDelegateBox] = useState(false);
  const [delegateValue, setDelegateValue] = useState('');
  const rejectRef = useRef<HTMLTextAreaElement>(null);
  const delegateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showRejectBox && rejectRef.current) rejectRef.current.focus();
  }, [showRejectBox]);

  useEffect(() => {
    if (showDelegateBox && delegateRef.current) delegateRef.current.focus();
  }, [showDelegateBox]);

  const handleRejectSubmit = useCallback(() => {
    if (rejectComment.trim() && onReject) {
      onReject(rejectComment.trim());
      setRejectComment('');
      setShowRejectBox(false);
    }
  }, [rejectComment, onReject]);

  const handleDelegateSubmit = useCallback(() => {
    if (delegateValue.trim() && onDelegate) {
      onDelegate(delegateValue.trim());
      setDelegateValue('');
      setShowDelegateBox(false);
    }
  }, [delegateValue, onDelegate]);

  const _isCompleted =
    step.status === 'approved' || step.status === 'rejected' || step.status === 'skipped';
  const widthClass = orientation === 'horizontal' ? 'min-w-[160px] max-w-[220px] flex-1' : 'w-full';

  return (
    <div
      role="listitem"
      aria-current={isCurrent ? 'step' : undefined}
      tabIndex={0}
      className={[
        widthClass,
        'rounded-lg border p-3 transition-colors duration-(--motion-duration-fast)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]',
        isCurrent
          ? 'border-[var(--brand-primary)] bg-surface-default shadow-xs'
          : 'border-border-default bg-surface-default',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <StatusIcon status={step.status} size={20} />
        <span className="text-sm font-medium text-text-primary truncate">{step.label}</span>
      </div>

      {/* Assignee */}
      {step.assignee && (
        <div className="flex items-center gap-1.5 mb-1">
          <Avatar assignee={step.assignee} size={22} />
          <span className="text-xs text-text-secondary truncate">{step.assignee.name}</span>
        </div>
      )}

      {/* Timestamp */}
      {!compact && step.timestamp && (
        <time className="block text-[10px] text-text-secondary mb-1" dateTime={step.timestamp}>
          {formatTimestamp(step.timestamp)}
        </time>
      )}

      {/* Comment */}
      {!compact && step.comment && (
        <p className="text-xs text-text-secondary italic border-l-2 border-border-default pl-2 mt-1 mb-1 line-clamp-2">
          {step.comment}
        </p>
      )}

      {/* Actions — only on current step when callbacks provided */}
      {isCurrent && canAct && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="flex gap-1.5 flex-wrap">
            {onApprove && (
              <button
                type="button"
                onClick={onApprove}
                className="px-3 py-1 text-xs font-medium rounded-xs bg-[var(--brand-primary)] text-text-inverse hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
              >
                Approve
              </button>
            )}
            {onReject && !showRejectBox && (
              <button
                type="button"
                onClick={() => setShowRejectBox(true)}
                className="px-3 py-1 text-xs font-medium rounded-xs bg-state-danger-bg text-state-danger-text hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
              >
                Reject
              </button>
            )}
            {onDelegate && !showDelegateBox && (
              <button
                type="button"
                onClick={() => setShowDelegateBox(true)}
                className="px-3 py-1 text-xs font-medium rounded-xs border border-border-default text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]"
              >
                Delegate
              </button>
            )}
          </div>

          {/* Reject comment area */}
          {showRejectBox && (
            <div className="flex flex-col gap-1">
              <textarea
                ref={rejectRef}
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Reason for rejection (required)"
                rows={2}
                className="text-xs rounded-xs border border-border-default bg-surface-default text-text-primary p-1.5 resize-none focus:outline-hidden focus:ring-1 focus:ring-[var(--focus-ring)]"
                aria-label="Rejection reason"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleRejectSubmit}
                  disabled={!rejectComment.trim()}
                  className="px-2 py-0.5 text-[10px] font-medium rounded-xs bg-state-danger-text text-text-inverse disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  Confirm Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectBox(false);
                    setRejectComment('');
                  }}
                  className="px-2 py-0.5 text-[10px] rounded-xs border border-border-default text-text-secondary focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Delegate input */}
          {showDelegateBox && (
            <div className="flex flex-col gap-1">
              <input
                ref={delegateRef}
                type="text"
                value={delegateValue}
                onChange={(e) => setDelegateValue(e.target.value)}
                placeholder="New assignee name or email"
                className="text-xs rounded-xs border border-border-default bg-surface-default text-text-primary p-1.5 focus:outline-hidden focus:ring-1 focus:ring-[var(--focus-ring)]"
                aria-label="New assignee"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDelegateSubmit();
                }}
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleDelegateSubmit}
                  disabled={!delegateValue.trim()}
                  className="px-2 py-0.5 text-[10px] font-medium rounded-xs bg-[var(--brand-primary)] text-text-inverse disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  Confirm Delegate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDelegateBox(false);
                    setDelegateValue('');
                  }}
                  className="px-2 py-0.5 text-[10px] rounded-xs border border-border-default text-text-secondary focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Multi-step approval workflow with approve, reject, and delegate actions. */
export function ApprovalWorkflow({
  steps,
  currentStepIndex,
  orientation = 'horizontal',
  compact = false,
  access,
  accessReason,
  onApprove,
  onReject,
  onDelegate,
  className = '',
}: ApprovalWorkflowProps) {
  const accessState = resolveAccessState(access);
  const { isHidden, isDisabled, isReadonly } = accessState;
  if (isHidden) return null;

  // Derive current step if not provided: first step that is pending or in-review
  const activeIndex =
    currentStepIndex ?? steps.findIndex((s) => s.status === 'pending' || s.status === 'in-review');
  const resolvedActiveIndex = activeIndex === -1 ? steps.length - 1 : activeIndex;

  const canAct = !isDisabled && !isReadonly;

  const containerClass =
    orientation === 'horizontal'
      ? 'flex flex-row items-start overflow-x-auto'
      : 'flex flex-col items-stretch';

  return (
    <div
      role="list"
      aria-label="Approval workflow"
      data-orientation={orientation}
      {...(isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
      data-access-state={accessState.state}
      className={`${containerClass} gap-0 ${accessStyles(accessState.state)} ${className}`}
    >
      {steps.map((step, idx) => {
        const isCurrent = idx === resolvedActiveIndex;
        const isCompleted =
          step.status === 'approved' || step.status === 'rejected' || step.status === 'skipped';

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <Connector
                completed={isCompleted || steps[idx - 1]?.status === 'approved'}
                orientation={orientation}
              />
            )}
            <StepCard
              step={step}
              isCurrent={isCurrent}
              compact={compact}
              orientation={orientation}
              canAct={canAct}
              onApprove={isCurrent && onApprove ? () => onApprove(step.id) : undefined}
              onReject={
                isCurrent && onReject ? (comment: string) => onReject(step.id, comment) : undefined
              }
              onDelegate={
                isCurrent && onDelegate
                  ? (assignee: string) => onDelegate(step.id, assignee)
                  : undefined
              }
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

ApprovalWorkflow.displayName = 'ApprovalWorkflow';

export default ApprovalWorkflow;
