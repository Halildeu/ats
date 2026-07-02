import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Timeline — Chronological event display                             */
/*                                                                     */
/*  Inspired by Ant Design, MUI, and Mantine timeline components.      */
/*  Supports left/right/alternate layout, color-coded dots, custom     */
/*  icons, pending state, labels, and access control.                  */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */

export type TimelineColor =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type TimelineMode = "left" | "right" | "alternate";
export type TimelineSize = "sm" | "md";

export interface TimelineItemProps {
  /** Unique key for the item */
  key: React.Key;
  /** Item content */
  children: React.ReactNode;
  /** Dot color/variant */
  color?: TimelineColor;
  /** Custom dot icon — replaces the default dot */
  dot?: React.ReactNode;
  /** Label (shown on opposite side in alternate mode, or above content in left/right mode) */
  label?: React.ReactNode;
  /** Timestamp or meta info */
  meta?: React.ReactNode;
  /** Pending state — shows a pulsing dot animation */
  pending?: boolean;
}

export interface TimelineProps extends AccessControlledProps {
  /** Timeline items */
  items: TimelineItemProps[];
  /** Layout mode — left-aligned, right-aligned, or alternating */
  mode?: TimelineMode;
  /** Reverse order of items */
  reverse?: boolean;
  /** Pending item content shown at the end */
  pending?: React.ReactNode;
  /** Custom pending dot */
  pendingDot?: React.ReactNode;
  /** Size variant */
  size?: TimelineSize;
  /** Show connector line between dots (default: true) */
  showConnector?: boolean;
  /** Additional CSS class */
  className?: string;
}

/* ---- Color mapping ---- */

const dotColorMap: Record<
  TimelineColor,
  { bg: string; border: string; ring: string }
> = {
  default: {
    bg: "bg-border-default",
    border: "border-border-default",
    ring: "ring-border-default/20",
  },
  primary: {
    bg: "bg-action-primary",
    border: "border-action-primary",
    ring: "ring-action-primary/20",
  },
  success: {
    bg: "bg-[var(--state-success-text)]",
    border: "border-[var(--state-success-text)]",
    ring: "ring-[color-mix(in_oklab,var(--state-success-text)_20%,transparent)]",
  },
  warning: {
    bg: "bg-[var(--state-warning-text)]",
    border: "border-[var(--state-warning-text)]",
    ring: "ring-[color-mix(in_oklab,var(--state-warning-text)_20%,transparent)]",
  },
  danger: {
    bg: "bg-[var(--state-danger-text)]",
    border: "border-[var(--state-danger-text)]",
    ring: "ring-[color-mix(in_oklab,var(--state-danger-text)_20%,transparent)]",
  },
  info: {
    bg: "bg-[var(--state-info-text)]",
    border: "border-[var(--state-info-text)]",
    ring: "ring-[color-mix(in_oklab,var(--state-info-text)_20%,transparent)]",
  },
};

/* ---- Size maps ---- */

const sizeConfig: Record<
  TimelineSize,
  {
    dot: string;
    customDot: string;
    connector: string;
    content: string;
    meta: string;
    label: string;
    gap: string;
    dotOffset: string;
  }
> = {
  sm: {
    dot: "h-2 w-2",
    customDot: "h-5 w-5 text-xs",
    connector: "w-px",
    content: "text-sm",
    meta: "text-xs",
    label: "text-xs",
    gap: "pb-6",
    dotOffset: "top-1",
  },
  md: {
    dot: "h-2.5 w-2.5",
    customDot: "h-6 w-6 text-sm",
    connector: "w-px",
    content: "text-sm",
    meta: "text-xs",
    label: "text-sm",
    gap: "pb-8",
    dotOffset: "top-1.5",
  },
};

/* ---- Pending dot (loading spinner) ---- */

function PendingDot({ size, className }: { size: TimelineSize; className?: string }) {
  const s = sizeConfig[size] ?? sizeConfig['md'];
  return (
    <span
      className={cn(
        "relative inline-flex rounded-full",
        s.dot,
        "bg-action-primary",
        className,
      )}
      data-testid="timeline-pending-dot"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          "bg-action-primary",
          "animate-ping opacity-75",
        )}
      />
    </span>
  );
}

/* ---- Dot component ---- */

function TimelineDot({
  color = "default",
  dot,
  pending,
  size,
}: {
  color?: TimelineColor;
  dot?: React.ReactNode;
  pending?: boolean;
  size: TimelineSize;
}) {
  const s = sizeConfig[size] ?? sizeConfig['md'];
  const colors = dotColorMap[color];

  if (pending && !dot) {
    return <PendingDot size={size} />;
  }

  if (dot) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "border-2",
          s.customDot,
          colors.border,
          "bg-surface-page",
          "text-current",
        )}
        data-testid="timeline-custom-dot"
      >
        {dot}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex rounded-full", s.dot, colors.bg)}
      data-testid="timeline-dot"
    />
  );
}

/* ---- Main component ---- */

/**
 * Chronological event display with left, right, or alternating layout and color-coded dots.
 *
 * @example
 * ```tsx
 * <Timeline
 *   items={[
 *     { key: '1', color: 'success', children: 'Order placed' },
 *     { key: '2', color: 'primary', children: 'Shipped', pending: true },
 *   ]}
 *   mode="left"
 * />
 * ```
 */
export const Timeline = React.forwardRef<HTMLDivElement, TimelineProps>(({
  items,
  mode = "left",
  reverse = false,
  pending,
  pendingDot,
  size = "md",
  showConnector = true,
  className,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);

  if (accessState.isHidden) {
    return null;
  }

  if (process.env.NODE_ENV !== 'production' && !sizeConfig[size]) {
    console.warn(`[Timeline] Invalid size "${String(size)}", falling back to "md".`);
  }
  const s = sizeConfig[size] ?? sizeConfig['md'];

  // Build final item list
  let finalItems = [...items];

  if (pending !== undefined && pending !== null) {
    finalItems = [
      ...finalItems,
      {
        key: "__timeline-pending__",
        children: pending,
        pending: true,
        dot: pendingDot,
      } as TimelineItemProps,
    ];
  }

  if (reverse) {
    finalItems = [...finalItems].reverse();
  }

  const isAlternate = mode === "alternate";
  const isRight = mode === "right";

  return (
    <div
      ref={ref}
      role="list"
      aria-label="Timeline"
      className={cn("relative", className)}
      data-access-state={accessState.state}
      data-component="timeline"
      title={accessReason}
    >
      {finalItems.map((item, index) => {
        const isLast = index === finalItems.length - 1;
        const color = item.color ?? "default";

        // Determine side for alternate mode
        const isItemRight = isAlternate
          ? index % 2 === 1
          : isRight;

        return (
          <div
            key={item.key}
            role="listitem"
            className={cn(
              "relative flex",
              !isLast && s.gap,
              isAlternate && "justify-center",
            )}
          >
            {/* LEFT CONTENT AREA (label for left mode, content for right mode) */}
            {isAlternate && (
              <div
                className={cn(
                  "flex-1 min-w-0",
                  isItemRight ? "text-end pe-4" : "text-end pe-4",
                )}
              >
                {isItemRight ? (
                  /* Label on left side */
                  item.label ? (
                    <div
                      className={cn(
                        s.label,
                        "text-[var(--text-tertiary)]",
                        s.dotOffset,
                        "relative",
                      )}
                      data-testid="timeline-label"
                    >
                      {item.label}
                    </div>
                  ) : null
                ) : (
                  /* Content on left side */
                  <div className={cn(s.dotOffset, "relative")}>
                    <div className={s.content}>{item.children}</div>
                    {item.meta && (
                      <div
                        className={cn(
                          s.meta,
                          "mt-1 text-[var(--text-tertiary)]",
                        )}
                        data-testid="timeline-meta"
                      >
                        {item.meta}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* DOT + CONNECTOR COLUMN */}
            <div className="relative flex flex-col items-center shrink-0">
              <TimelineDot
                color={color}
                dot={item.dot}
                pending={item.pending}
                size={size}
              />
              {/* Connector line */}
              {showConnector && !isLast && (
                <div
                  className={cn(
                    s.connector,
                    "flex-1 min-h-[16px] mt-1",
                    "bg-border-default",
                  )}
                  data-testid="timeline-connector"
                />
              )}
            </div>

            {/* RIGHT CONTENT AREA */}
            {isAlternate ? (
              <div
                className={cn(
                  "flex-1 min-w-0",
                  isItemRight ? "text-start ps-4" : "text-start ps-4",
                )}
              >
                {isItemRight ? (
                  /* Content on right side */
                  <div className={cn(s.dotOffset, "relative")}>
                    <div className={s.content}>{item.children}</div>
                    {item.meta && (
                      <div
                        className={cn(
                          s.meta,
                          "mt-1 text-[var(--text-tertiary)]",
                        )}
                        data-testid="timeline-meta"
                      >
                        {item.meta}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Label on right side */
                  item.label ? (
                    <div
                      className={cn(
                        s.label,
                        "text-[var(--text-tertiary)]",
                        s.dotOffset,
                        "relative",
                      )}
                      data-testid="timeline-label"
                    >
                      {item.label}
                    </div>
                  ) : null
                )}
              </div>
            ) : (
              /* Non-alternate: single content column */
              <div
                className={cn(
                  "flex-1 min-w-0",
                  isRight ? "pe-4 text-end order-first" : "ps-4",
                )}
              >
                {/* Label above content in non-alternate modes */}
                {item.label && (
                  <div
                    className={cn(
                      s.label,
                      "text-[var(--text-tertiary)] mb-0.5",
                    )}
                    data-testid="timeline-label"
                  >
                    {item.label}
                  </div>
                )}
                <div className={s.content}>{item.children}</div>
                {item.meta && (
                  <div
                    className={cn(
                      s.meta,
                      "mt-1 text-[var(--text-tertiary)]",
                    )}
                    data-testid="timeline-meta"
                  >
                    {item.meta}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

Timeline.displayName = "Timeline";
