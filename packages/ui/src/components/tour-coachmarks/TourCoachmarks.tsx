import React, { useEffect, useId, useMemo, useState } from "react";
import { Button } from "../../primitives/button/Button";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  TourCoachmarks — Guided tour / onboarding walkthrough              */
/* ------------------------------------------------------------------ */

export type TourCoachmarkStep = {
  id: string;
  title: React.ReactNode;
  description: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "info" | "success" | "warning";
};

/** Props for the TourCoachmarks component.
 * @example
 * ```tsx
 * <TourCoachmarks />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/tour-coachmarks)
 */
export interface TourCoachmarksProps extends AccessControlledProps {
  /** Ordered list of tour steps. */
  steps: TourCoachmarkStep[];
  /** Heading text for the tour overlay. */
  title?: React.ReactNode;
  /** Controlled open state of the tour. */
  open?: boolean;
  /** Initial open state for uncontrolled mode. */
  defaultOpen?: boolean;
  /** Controlled current step index. */
  currentStep?: number;
  /** Initial step index for uncontrolled mode. */
  defaultStep?: number;
  /** Callback fired when the active step changes. */
  onStepChange?: (index: number) => void;
  /** Callback fired when the tour is dismissed. */
  onClose?: () => void;
  /** Callback fired when the final step is completed. */
  onFinish?: () => void;
  /** Whether the user can skip the tour. */
  allowSkip?: boolean;
  /** Whether to show the step progress indicator. */
  showProgress?: boolean;
  /** Interaction mode: guided allows navigation, readonly disables it. */
  mode?: "guided" | "readonly";
  /** Locale-specific label overrides. */
  localeText?: {
    title?: React.ReactNode;
    skipLabel?: React.ReactNode;
    closeLabel?: React.ReactNode;
    previousLabel?: React.ReactNode;
    nextStepLabel?: React.ReactNode;
    finishLabel?: React.ReactNode;
    readonlyFinishLabel?: React.ReactNode;
  };
  className?: string;
  testIdPrefix?: string;
}

const clampIndex = (value: number, max: number) => {
  if (max < 0) return 0;
  return Math.min(Math.max(value, 0), max);
};

/** Step-by-step guided tour overlay for onboarding walkthroughs with progress and skip support. */
export const TourCoachmarks = React.forwardRef<HTMLDivElement, TourCoachmarksProps>(({
  steps,
  title,
  open,
  defaultOpen = false,
  currentStep,
  defaultStep = 0,
  onStepChange,
  onClose,
  onFinish,
  allowSkip = true,
  showProgress = true,
  mode = "guided",
  localeText,
  className = "",
  access = "full",
  accessReason,
  testIdPrefix,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [uncontrolledStep, setUncontrolledStep] = useState(defaultStep);
  const titleId = useId();
  const panelId = useId();
  const resolvedOpen = open ?? uncontrolledOpen;
  const maxStep = steps.length - 1;
  const resolvedStep = clampIndex(
    currentStep ?? uncontrolledStep,
    maxStep,
  );
  const step = steps[resolvedStep];
  const isReadonly = mode === "readonly" || accessState.isReadonly;
  const resolvedTitle = title ?? localeText?.title ?? "Guided tour";
  const resolvedSkipLabel = localeText?.skipLabel ?? "Skip";
  const resolvedCloseLabel = localeText?.closeLabel ?? "Close";
  const resolvedPreviousLabel = localeText?.previousLabel ?? "Back";
  const resolvedNextStepLabel = localeText?.nextStepLabel ?? "Next step";
  const resolvedFinishLabel = localeText?.finishLabel ?? "Finish";
  const resolvedReadonlyFinishLabel =
    localeText?.readonlyFinishLabel ?? "Tour complete";

  const setOpen = (next: boolean) => {
    if (open === undefined) {
      setUncontrolledOpen(next);
    }
    if (!next) {
      onClose?.();
    }
  };

  const setStep = (next: number) => {
    const clamped = clampIndex(next, maxStep);
    if (currentStep === undefined) {
      setUncontrolledStep(clamped);
    }
    onStepChange?.(clamped);
  };

  useEffect(() => {
    if (!resolvedOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [resolvedOpen]);

  const toneClasses = useMemo(
    () => ({
      info: "bg-action-primary/10 text-text-primary",
      success: "bg-state-success-bg/15 text-text-primary",
      warning: "bg-state-warning-bg/15 text-text-primary",
    }),
    [],
  );

  if (accessState.isHidden || !step) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={`relative ${className}`.trim()}
      data-access-state={accessState.state}
      data-testid={testIdPrefix ? `${testIdPrefix}-root` : undefined}
    >
      {resolvedOpen ? (
        <div
          className="relative overflow-hidden rounded-[2rem] border border-border-subtle bg-surface-muted shadow-2xl"
          data-testid={testIdPrefix ? `${testIdPrefix}-panel` : undefined}
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-[var(--action-primary)] via-[var(--action-primary-hover)] to-[var(--action-primary)]" />
          <div
            className="flex flex-col gap-6 p-6 pt-7"
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            aria-describedby={panelId}
            title={accessReason}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">
                  {resolvedTitle}
                </div>
                <div
                  id={titleId}
                  className="text-xl font-semibold text-text-primary"
                >
                  {step.title}
                </div>
              </div>
              {showProgress ? (
                <div className="rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold text-text-secondary">
                  {resolvedStep + 1} / {steps.length}
                </div>
              ) : null}
            </div>
            <div id={panelId} className="flex flex-col gap-4">
              <div className="text-sm leading-7 text-text-secondary">
                {step.description}
              </div>
              {step.meta ? (
                <div
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[step.tone ?? "info"]}`}
                >
                  {step.meta}
                </div>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
                {steps.map((candidate, index) => {
                  const active = index === resolvedStep;
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setStep(index)}
                      data-testid={
                        testIdPrefix
                          ? `${testIdPrefix}-step-${candidate.id}`
                          : undefined
                      }
                      className={`rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
                        active
                          ? "border-action-primary bg-action-primary/10 text-text-primary"
                          : "border-border-subtle bg-surface-muted text-text-secondary hover:bg-surface-default"
                      } ${isReadonly ? "pointer-events-none" : ""}`}
                      aria-current={active ? "step" : undefined}
                    >
                      {index + 1}. {candidate.id}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {allowSkip ? (
                  <Button
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    data-testid={
                      testIdPrefix
                        ? `${testIdPrefix}-skip`
                        : undefined
                    }
                  >
                    {isReadonly ? resolvedCloseLabel : resolvedSkipLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => setStep(resolvedStep - 1)}
                  disabled={resolvedStep === 0}
                  data-testid={
                    testIdPrefix
                      ? `${testIdPrefix}-previous`
                      : undefined
                  }
                >
                  {resolvedPreviousLabel}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {resolvedStep < maxStep ? (
                  <Button
                    onClick={() => setStep(resolvedStep + 1)}
                    data-testid={
                      testIdPrefix
                        ? `${testIdPrefix}-next`
                        : undefined
                    }
                  >
                    {resolvedNextStepLabel}
                  </Button>
                ) : (
                  <Button
                    variant={isReadonly ? "secondary" : "primary"}
                    onClick={() => {
                      onFinish?.();
                      setOpen(false);
                    }}
                    data-testid={
                      testIdPrefix
                        ? `${testIdPrefix}-finish`
                        : undefined
                    }
                  >
                    {isReadonly
                      ? resolvedReadonlyFinishLabel
                      : resolvedFinishLabel}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

TourCoachmarks.displayName = "TourCoachmarks";

export default TourCoachmarks;
