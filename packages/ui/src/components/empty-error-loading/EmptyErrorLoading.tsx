import React from "react";
import { Button } from "../../primitives/button/Button";
import { EmptyState as Empty } from "../empty-state/EmptyState";
import { Skeleton } from "../../primitives/skeleton/Skeleton";
import { Spinner } from "../../primitives/spinner/Spinner";
import { Text } from "../../primitives/text/Text";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  EmptyErrorLoading — Tri-state feedback recipe                       */
/*                                                                     */
/*  Displays one of: empty, error, or loading state with consistent    */
/*  styling. Combines Empty, Spinner, and Skeleton subcomponents.      */
/* ------------------------------------------------------------------ */

export type EmptyErrorLoadingMode = "empty" | "error" | "loading";

/** Props for the EmptyErrorLoading component.
 * @example
 * ```tsx
 * <EmptyErrorLoading />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/empty-error-loading)
 */
export interface EmptyErrorLoadingProps extends AccessControlledProps {
  /** Current display mode: empty, error, or loading. */
  mode: EmptyErrorLoadingMode;
  /** Heading text displayed above the feedback area. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Message shown when mode is error. */
  errorLabel?: React.ReactNode;
  /** Label for the retry button in error state. */
  retryLabel?: string;
  /** Callback fired when the retry button is clicked. */
  onRetry?: () => void;
  /** Accessible label for the loading spinner. */
  loadingLabel?: string;
  /** Whether to show skeleton placeholders during loading. */
  showSkeleton?: boolean;
  /** Additional CSS class name. */
  className?: string;
}

/** Tri-state feedback component that renders empty, error, or loading state with consistent styling. */
export const EmptyErrorLoading = React.forwardRef<HTMLElement, EmptyErrorLoadingProps>(({
  mode,
  title = "Durum tarifi",
  description = "Bos, hata ve yukleme durumlari ayni geri bildirim dilini kullanir.",
  errorLabel = "Something went wrong. Check the evidence set and upstream connections.",
  retryLabel = "Retry",
  onRetry,
  loadingLabel = "Loading",
  showSkeleton = true,
  className = "",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  return (
    <section
      ref={ref}
      className={`rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs ${className}`.trim()}
      data-access-state={accessState.state}
      data-component="empty-error-loading"
      data-mode={mode}
      title={accessReason}
    >
      <Text
        as="div"
        className="text-base font-semibold text-text-primary"
      >
        {title}
      </Text>
      <Text variant="secondary" className="mt-1 block text-sm leading-6">
        {description}
      </Text>

      <div className="mt-4 rounded-[24px] border border-border-subtle bg-surface-default p-4">
        {mode === "loading" ? (
          <div className="flex flex-col gap-4">
            <Spinner mode="block" label={loadingLabel} />
            {showSkeleton ? (
              <div className="grid grid-cols-1 gap-3">
                <Skeleton lines={2} />
                <Skeleton className="h-28" />
                <Skeleton height={40} />
              </div>
            ) : null}
          </div>
        ) : mode === "error" ? (
          <div className="flex flex-col gap-4">
            <Empty
              description={
                typeof errorLabel === "string"
                  ? errorLabel
                  : "Bir hata olustu"
              }
            />
            {onRetry ? (
              <div className="flex justify-center">
                <Button
                  fullWidth={false}
                  variant="secondary"
                  onClick={onRetry}
                  access={access}
                >
                  {retryLabel}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty description="Veri bulunamadi." />
        )}
      </div>
    </section>
  );
});

EmptyErrorLoading.displayName = "EmptyErrorLoading";

export default EmptyErrorLoading;
