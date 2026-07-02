import React from "react";
import { Badge } from "../../primitives/badge/Badge";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

export type ConfidenceLevel = "low" | "medium" | "high" | "very-high";

/** Props for the ConfidenceBadge component.
 * @example
 * ```tsx
 * <ConfidenceBadge />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/confidence-badge)
 */
export interface ConfidenceBadgeProps extends AccessControlledProps {
  /** Confidence tier determining the badge tone. */
  level?: ConfidenceLevel;
  /** Numeric confidence score (0-100). */
  score?: number;
  /** Number of sources backing the confidence. */
  sourceCount?: number;
  /** Whether to render in compact mode with fewer details. */
  compact?: boolean;
  /** Whether to display the numeric score. */
  showScore?: boolean;
  /** Custom label overriding the default level text. */
  label?: React.ReactNode;
  /** Additional CSS class name. */
  className?: string;
}

const toneByLevel: Record<
  ConfidenceLevel,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  low: "warning",
  medium: "info",
  high: "success",
  "very-high": "success",
};

const labelByLevel: Record<ConfidenceLevel, string> = {
  low: "Dusuk guven",
  medium: "Orta guven",
  high: "Yuksek guven",
  "very-high": "Cok yuksek guven",
};

/** Badge displaying AI confidence level with optional numeric score and source count. */
export const ConfidenceBadge = React.forwardRef<HTMLSpanElement, ConfidenceBadgeProps>(({
  level = "medium",
  score,
  sourceCount,
  compact = false,
  showScore = true,
  label,
  className,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  parts.push(label ?? labelByLevel[level]);

  if (showScore && typeof score === "number") {
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    parts.push(`${normalizedScore}%`);
  }

  if (!compact && typeof sourceCount === "number") {
    parts.push(`${sourceCount} source${sourceCount === 1 ? "" : "s"}`);
  }

  return (
    <Badge
      ref={ref}
      variant={toneByLevel[level]}
      className={cn("text-text-primary", className)}
      aria-label={labelByLevel[level]}
      data-confidence-level={level}
      data-access-state={accessState.state}
      title={accessReason}
    >
      {compact ? parts.slice(0, 2).join(" · ") : parts.join(" · ")}
    </Badge>
  );
});

ConfidenceBadge.displayName = 'ConfidenceBadge';

export default ConfidenceBadge;
