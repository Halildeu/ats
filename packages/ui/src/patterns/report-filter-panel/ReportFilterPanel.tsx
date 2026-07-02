import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  ReportFilterPanel — Horizontal filter form with submit/reset       */
/* ------------------------------------------------------------------ */

/** Props for {@link ReportFilterPanel}.
 * @example
 * ```tsx
 * <ReportFilterPanel />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/report-filter-panel)
 */
export interface ReportFilterPanelProps extends AccessControlledProps {
  /** Whether a filter request is in progress (disables submit/reset). */
  loading?: boolean;
  /** Label for the submit button. @default "Filtrele" */
  submitLabel?: string;
  /** Label for the reset button. @default "Sifirla" */
  resetLabel?: string;
  /** Callback fired when the filter form is submitted. */
  onSubmit?: () => void;
  /** Callback fired when the reset button is clicked. */
  onReset?: () => void;
  /** Test ID applied to the form element. */
  testId?: string;
  /** Test ID applied to the submit button. */
  submitTestId?: string;
  /** Test ID applied to the reset button. */
  resetTestId?: string;
  /** Filter form controls rendered as flex children. */
  children: React.ReactNode;
}

/** Horizontal filter form panel with submit/reset buttons and loading state for report screens. */
export const ReportFilterPanel = React.forwardRef<HTMLFormElement, ReportFilterPanelProps>(({
  loading,
  submitLabel = "Filtrele",
  resetLabel = "Sifirla",
  onSubmit,
  onReset,
  testId,
  submitTestId,
  resetTestId,
  children,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const canSubmit = accessState.state === "full";
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || loading) {
      return;
    }
    onSubmit?.();
  };
  const handleReset = onReset
    ? withAccessGuard<React.MouseEvent<HTMLButtonElement>>(
        accessState.state,
        onReset,
        loading || accessState.isDisabled,
      )
    : undefined;

  const buttonBase = cn(
    "inline-flex items-center justify-center rounded-md border text-sm font-semibold transition-colors",
    "focus:outline-hidden focus:ring-2 focus:ring-[var(--selection-outline))] focus:ring-offset-1",
    "disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2",
  );

  return (
    <form
      ref={ref}
      onSubmit={handleSubmit}
      className="w-full"
      data-access-state={accessState.state}
      data-testid={testId}
    >
      <div className="flex w-full flex-wrap items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-3">
          {React.Children.map(children, (child, index) => (
            <div key={index} className="min-w-[200px] flex-1">
              {child}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            data-testid={submitTestId}
            className={cn(
              buttonBase,
              "border-transparent bg-action-primary text-action-primary-text hover:opacity-90",
            )}
            disabled={loading || !canSubmit}
            title={accessReason}
          >
            {submitLabel}
          </button>
          {onReset && (
            <button
              type="button"
              data-testid={resetTestId}
              className={cn(
                buttonBase,
                "border border-border-subtle bg-surface-default text-text-secondary hover:bg-surface-muted",
              )}
              onClick={handleReset}
              disabled={
                loading || accessState.isDisabled || accessState.isReadonly
              }
              aria-disabled={
                loading || accessState.isDisabled || accessState.isReadonly ||
                undefined
              }
              title={accessReason}
            >
              {resetLabel}
            </button>
          )}
        </div>
      </div>
    </form>
  );
});

ReportFilterPanel.displayName = "ReportFilterPanel";

/** Type alias for ReportFilterPanel ref. */
export type ReportFilterPanelRef = React.Ref<HTMLElement>;
/** Type alias for ReportFilterPanel element. */
export type ReportFilterPanelElement = HTMLElement;
/** Type alias for ReportFilterPanel cssproperties. */
export type ReportFilterPanelCSSProperties = React.CSSProperties;
