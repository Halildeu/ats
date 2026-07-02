import React, { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Steps — Progress indicator for multi-step workflows                */
/* ------------------------------------------------------------------ */

export type StepsSize = "sm" | "md" | "lg";
export type StepsDirection = "horizontal" | "vertical";
export type StepStatus = "wait" | "process" | "finish" | "error";

export interface StepItem {
  /** Unique key */
  key: string;
  /** Step label */
  title: React.ReactNode;
  /** Optional description */
  description?: React.ReactNode;
  /** Optional icon override */
  icon?: React.ReactNode;
  /** Disable this step */
  disabled?: boolean;
}

export interface StepsProps extends AccessControlledProps {
  /** Step definitions */
  items: StepItem[];
  /** Currently active step index (0-based) */
  current?: number;
  /** Initial active step index for uncontrolled mode. Ignored when `current` is provided. */
  defaultCurrent?: number;
  /** Direction */
  direction?: StepsDirection;
  /** Size */
  size?: StepsSize;
  /** Called when a step is clicked */
  onChange?: (index: number) => void;
  /** Mark current step as error */
  status?: StepStatus;
  /** Use dot style instead of numbers */
  dot?: boolean;
  className?: string;
}

/* ---- Size maps ---- */

const sizeMap: Record<StepsSize, { indicator: string; title: string; desc: string; connector: string }> = {
  sm: { indicator: "h-6 w-6 text-xs", title: "text-xs", desc: "text-[11px]", connector: "top-3" },
  md: { indicator: "h-8 w-8 text-sm", title: "text-sm", desc: "text-xs", connector: "top-4" },
  lg: { indicator: "h-10 w-10 text-base", title: "text-base", desc: "text-sm", connector: "top-5" },
};

const dotSizeMap: Record<StepsSize, string> = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

/* ---- Status helpers ---- */

function getStepStatus(index: number, current: number, status?: StepStatus): StepStatus {
  if (index === current) return status ?? "process";
  if (index < current) return "finish";
  return "wait";
}

const statusColors: Record<StepStatus, { bg: string; border: string; text: string; titleText: string }> = {
  finish: {
    bg: "bg-action-primary",
    border: "border-action-primary",
    text: "text-text-inverse",
    titleText: "text-text-primary",
  },
  process: {
    bg: "bg-action-primary",
    border: "border-action-primary",
    text: "text-text-inverse",
    titleText: "text-text-primary",
  },
  wait: {
    bg: "bg-transparent",
    border: "border-border-default",
    text: "text-[var(--text-tertiary)]",
    titleText: "text-[var(--text-tertiary)]",
  },
  error: {
    bg: "bg-transparent",
    border: "border-[var(--state-danger-text)]",
    text: "text-[var(--state-danger-text)]",
    titleText: "text-[var(--state-danger-text)]",
  },
};

/* ---- Check icon ---- */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5L6.5 11.5L12.5 5" />
    </svg>
  );
}

/* ---- Main component ---- */

/**
 * Progress indicator for multi-step workflows with numbered or dot variants.
 *
 * @example
 * ```tsx
 * <Steps
 *   current={1}
 *   items={[
 *     { key: 'info', title: 'Information' },
 *     { key: 'review', title: 'Review' },
 *     { key: 'confirm', title: 'Confirm' },
 *   ]}
 *   onChange={setStep}
 * />
 * ```
 */
export const Steps = React.forwardRef<HTMLDivElement, StepsProps>(({
  items,
  current: currentProp,
  defaultCurrent,
  direction = "horizontal",
  size = "md",
  onChange: onChangeProp,
  status,
  dot = false,
  className,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  // Uncontrolled mode: track internal step index when `current` prop is not provided
  const [internalCurrent, setInternalCurrent] = useState(defaultCurrent ?? 0);
  const isControlled = currentProp !== undefined;
  const current = isControlled ? currentProp : internalCurrent;

  const onChange = onChangeProp
    ? (index: number) => {
        if (!isControlled) {
          setInternalCurrent(index);
        }
        onChangeProp(index);
      }
    : undefined;
  const sizes = sizeMap[size];
  const isVertical = direction === "vertical";

  return (
    <div
      ref={ref}
      className={cn(
        "flex",
        isVertical ? "flex-col gap-0" : "flex-row items-start",
        accessState.isDisabled && "pointer-events-none opacity-50",
        className,
      )}
      title={accessReason}
      data-access-state={accessState.state}
      role="list"
      aria-label="Progress steps"
      {...stateAttrs({ component: "steps" })}
    >
      {items.map((item, index) => {
        const stepStatus = getStepStatus(index, current, status);
        const colors = statusColors[stepStatus];
        const isLast = index === items.length - 1;
        const clickable = !!onChange && !item.disabled;

        const itemKey = item.key;

        return (
          <div
            key={itemKey || index}
            role="listitem"
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex",
              isVertical ? "flex-row" : "flex-col items-center flex-1",
              isVertical && !isLast && "pb-6",
            )}
          >
            {/* Indicator row */}
            <div
              className={cn(
                "flex items-center",
                isVertical ? "flex-col" : "flex-row w-full",
              )}
            >
              {/* Connector before (horizontal only, not first) */}
              {!isVertical && index > 0 && (
                <div
                  className={cn(
                    "flex-1 h-px",
                    index <= current
                      ? "bg-action-primary"
                      : "bg-border-default",
                  )}
                />
              )}

              {/* Step indicator */}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onChange?.(index)}
                className={cn(
                  "relative shrink-0 flex items-center justify-center rounded-full transition-colors",
                  focusRingClass("ring"),
                  clickable && "cursor-pointer",
                  !clickable && "cursor-default",
                  dot
                    ? cn(dotSizeMap[size], stepStatus === "wait" ? "bg-border-default" : colors.bg)
                    : cn(sizes.indicator, "border-2", colors.border, colors.bg, colors.text),
                )}
                aria-label={`Step ${index + 1}: ${typeof item.title === "string" ? item.title : ""}`}
              >
                {!dot && (
                  <>
                    {item.icon ? (
                      item.icon
                    ) : stepStatus === "finish" ? (
                      <CheckIcon className="h-3.5 w-3.5" />
                    ) : stepStatus === "error" ? (
                      <span className="font-bold">!</span>
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </>
                )}
              </button>

              {/* Connector after (horizontal only, not last) */}
              {!isVertical && !isLast && (
                <div
                  className={cn(
                    "flex-1 h-px",
                    index < current
                      ? "bg-action-primary"
                      : "bg-border-default",
                  )}
                />
              )}

              {/* Vertical connector */}
              {isVertical && !isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-[24px] my-1",
                    index < current
                      ? "bg-action-primary"
                      : "bg-border-default",
                  )}
                />
              )}
            </div>

            {/* Title & description */}
            <div
              className={cn(
                isVertical ? "ms-3 pt-0.5" : "mt-2 text-center px-1",
              )}
            >
              <div className={cn(sizes.title, "font-medium leading-tight", colors.titleText)}>
                {item.title}
              </div>
              {item.description && (
                <div className={cn(sizes.desc, "mt-0.5 text-[var(--text-tertiary)] leading-snug")}>
                  {item.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

Steps.displayName = "Steps";
