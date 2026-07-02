import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Result — Status page component (success, error, 403, 404, 500)     */
/* ------------------------------------------------------------------ */

export type ResultStatus = 'success' | 'info' | 'warning' | 'error' | '403' | '404' | '500';

export interface ResultProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Status type controlling icon and color. */
  status: ResultStatus;
  /** Main heading. */
  title?: React.ReactNode;
  /** Secondary description text. */
  subTitle?: React.ReactNode;
  /** Custom icon (overrides default). */
  icon?: React.ReactNode;
  /** Action buttons area. */
  extra?: React.ReactNode;
}

/* ---- Status icons (inline SVG) ---- */

const statusIcons: Record<ResultStatus, React.FC<{ className?: string }>> = {
  success: ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" stroke="var(--state-success-text)" strokeWidth="2" fill="var(--state-success-bg)" />
      <polyline points="20 33 28 41 44 25" stroke="var(--state-success-text)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  info: ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" stroke="var(--state-info-text)" strokeWidth="2" fill="var(--state-info-bg)" />
      <line x1="32" y1="28" x2="32" y2="44" stroke="var(--state-info-text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="21" r="2" fill="var(--state-info-text)" />
    </svg>
  ),
  warning: ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <path d="M32 4L2 58h60L32 4z" stroke="var(--state-warning-text)" strokeWidth="2" fill="var(--state-warning-bg)" strokeLinejoin="round" />
      <line x1="32" y1="24" x2="32" y2="40" stroke="var(--state-warning-text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="48" r="2" fill="var(--state-warning-text)" />
    </svg>
  ),
  error: ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" stroke="var(--state-danger-text)" strokeWidth="2" fill="var(--state-danger-bg)" />
      <line x1="22" y1="22" x2="42" y2="42" stroke="var(--state-danger-text)" strokeWidth="3" strokeLinecap="round" />
      <line x1="42" y1="22" x2="22" y2="42" stroke="var(--state-danger-text)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  '403': ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="18" y="28" width="28" height="24" rx="3" stroke="var(--state-warning-text)" strokeWidth="2" fill="var(--state-warning-bg)" />
      <path d="M24 28V20a8 8 0 0116 0v8" stroke="var(--state-warning-text)" strokeWidth="2" fill="none" />
      <circle cx="32" cy="40" r="3" fill="var(--state-warning-text)" />
    </svg>
  ),
  '404': ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <circle cx="26" cy="30" r="12" stroke="var(--state-info-text)" strokeWidth="2" fill="var(--state-info-bg)" />
      <line x1="35" y1="39" x2="48" y2="52" stroke="var(--state-info-text)" strokeWidth="3" strokeLinecap="round" />
      <line x1="22" y1="30" x2="30" y2="30" stroke="var(--state-info-text)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  '500': ({ className }) => (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden>
      <rect x="14" y="12" width="36" height="40" rx="3" stroke="var(--state-danger-text)" strokeWidth="2" fill="var(--state-danger-bg)" />
      <line x1="22" y1="24" x2="42" y2="24" stroke="var(--state-danger-text)" strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="32" x2="36" y2="32" stroke="var(--state-danger-text)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="44" r="4" stroke="var(--state-danger-text)" strokeWidth="2" fill="none" />
      <line x1="38" y1="42" x2="42" y2="46" stroke="var(--state-danger-text)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const statusTitles: Record<ResultStatus, string> = {
  success: 'Success',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  '403': '403 — Access Denied',
  '404': '404 — Not Found',
  '500': '500 — Server Error',
};

/**
 * Result page component for displaying operation outcomes, error states,
 * and HTTP status pages. Includes built-in SVG illustrations per status.
 *
 * @example
 * ```tsx
 * <Result status="success" title="Payment Successful" extra={<Button>Back Home</Button>} />
 * <Result status="404" title="Page Not Found" subTitle="The page you visited does not exist." />
 * ```
 *
 * @since 1.1.0
 */
export const Result = forwardRef<HTMLDivElement, ResultProps>(
  function Result({ status, title, subTitle, icon, extra, children, className, ...rest }, ref) {
    const StatusIcon = statusIcons[status];
    const defaultTitle = statusTitles[status];

    return (
      <div
        ref={ref}
        {...stateAttrs({ component: 'result', status: status === 'error' || status === '500' ? 'error' : status === 'warning' || status === '403' ? 'warning' : status === 'success' ? 'success' : undefined })}
        className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
        {...rest}
      >
        <div className="mb-6">
          {icon ?? <StatusIcon className="h-20 w-20" />}
        </div>
        <h2 className="text-xl font-semibold text-text-primary">
          {title ?? defaultTitle}
        </h2>
        {subTitle && (
          <p className="mt-2 max-w-md text-sm text-text-secondary">{subTitle}</p>
        )}
        {extra && (
          <div className="mt-6 flex items-center gap-3">{extra}</div>
        )}
        {children && (
          <div className="mt-6 w-full max-w-lg">{children}</div>
        )}
      </div>
    );
  },
);

Result.displayName = 'Result';
