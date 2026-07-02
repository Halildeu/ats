import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Tooltip } from '../../primitives/tooltip/Tooltip';
import { Text } from '../../primitives/text/Text';
import type { EligibilityReason } from '../../types/approval';

export type ApprovalEligibilityGuardVariant = 'inline' | 'banner';

export interface ApprovalEligibilityGuardBlockedInfo {
  reasons: EligibilityReason[];
  event?: React.SyntheticEvent;
}

export interface ApprovalEligibilityGuardProps {
  /**
   * Eligibility violations. Empty (or absent) means the user is eligible and
   * children render as a transparent passthrough.
   */
  reasons?: EligibilityReason[];
  /** Action UI being guarded (typically a Button or DialogTrigger). */
  children: React.ReactNode;
  /**
   * Audit/telemetry hook fired the first time a blocked render mounts and
   * each time a blocked interaction is intercepted.
   */
  onBlocked?: (info: ApprovalEligibilityGuardBlockedInfo) => void;
  /**
   * `inline` (default) wraps children in a Tooltip listing the reasons.
   * `banner` additionally renders a warning-tone notice above the children
   * with the first reason as headline and the rest expanded inline.
   */
  variant?: ApprovalEligibilityGuardVariant;
  /** Title rendered on the banner variant. */
  bannerTitle?: React.ReactNode;
  /** Suppress the wrapping Tooltip (still intercepts interaction). */
  silentTooltip?: boolean;
  className?: string;
}

function formatReasonList(reasons: EligibilityReason[]): React.ReactNode {
  if (reasons.length === 1) return reasons[0].message;
  return (
    <ul className="list-disc pl-5">
      {reasons.map((r) => (
        <li key={r.code + '-' + r.message}>
          {r.message}
          {r.helpUrl ? (
            <>
              {' '}
              <a
                href={r.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="underline text-action-primary"
              >
                Detay
              </a>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export const ApprovalEligibilityGuard = React.forwardRef<
  HTMLSpanElement,
  ApprovalEligibilityGuardProps
>(
  (
    {
      reasons = [],
      children,
      onBlocked,
      variant = 'inline',
      bannerTitle = 'Bu islem icin uygun degilsin',
      silentTooltip = false,
      className = '',
    },
    ref,
  ) => {
    const isBlocked = reasons.length > 0;
    const blockedSignature = useMemo(
      () => reasons.map((r) => r.code + '|' + r.message).join('::'),
      [reasons],
    );
    const lastNotifiedRef = useRef<string | null>(null);

    // Fire onBlocked once per unique reason signature
    useEffect(() => {
      if (!isBlocked) {
        lastNotifiedRef.current = null;
        return;
      }
      if (lastNotifiedRef.current === blockedSignature) return;
      lastNotifiedRef.current = blockedSignature;
      onBlocked?.({ reasons });
    }, [blockedSignature, isBlocked, onBlocked, reasons]);

    const handleCapture = useCallback(
      (event: React.SyntheticEvent) => {
        if (!isBlocked) return;
        event.preventDefault();
        event.stopPropagation();
        onBlocked?.({ reasons, event });
      },
      [isBlocked, onBlocked, reasons],
    );

    // Passthrough when eligible
    if (!isBlocked) {
      return (
        <span
          ref={ref}
          data-component="approval-eligibility-guard"
          data-blocked="false"
          className={className}
        >
          {children}
        </span>
      );
    }

    const tooltipContent = silentTooltip ? undefined : formatReasonList(reasons);

    const guardedChildren = (
      <span
        ref={variant === 'inline' ? ref : undefined}
        data-component="approval-eligibility-guard"
        data-blocked="true"
        data-variant={variant}
        aria-disabled="true"
        role="group"
        aria-label={bannerTitle ? String(bannerTitle) : 'Yetkisiz islem'}
        className={`relative inline-block ${className}`.trim()}
        onPointerDownCapture={handleCapture}
        onClickCapture={handleCapture}
        onKeyDownCapture={(event) => {
          // intercept Enter / Space activations
          if (event.key === 'Enter' || event.key === ' ') {
            handleCapture(event);
          }
        }}
      >
        {children}
      </span>
    );

    const wrappedInline = silentTooltip ? (
      guardedChildren
    ) : (
      <Tooltip content={tooltipContent} placement="top" openDelay={120}>
        {guardedChildren}
      </Tooltip>
    );

    if (variant === 'inline') {
      return wrappedInline;
    }

    // banner variant
    return (
      <span
        ref={ref}
        data-component="approval-eligibility-guard"
        data-blocked="true"
        data-variant="banner"
        role="group"
        aria-label={bannerTitle ? String(bannerTitle) : 'Yetkisiz islem'}
        className={`block ${className}`.trim()}
      >
        <span
          className="mb-2 flex flex-col gap-1 rounded-lg border border-state-warning-border bg-state-warning-bg p-3 text-sm text-state-warning-text"
          role="status"
        >
          <Text className="font-semibold text-state-warning-text">{bannerTitle}</Text>
          <span>{formatReasonList(reasons)}</span>
        </span>
        {wrappedInline}
      </span>
    );
  },
);

ApprovalEligibilityGuard.displayName = 'ApprovalEligibilityGuard';

export default ApprovalEligibilityGuard;
