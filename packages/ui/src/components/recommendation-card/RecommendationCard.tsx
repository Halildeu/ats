import React from "react";
import { Badge } from "../../primitives/badge/Badge";
import { Button } from "../../primitives/button/Button";
import { Text } from "../../primitives/text/Text";
import {
  ConfidenceBadge,
  type ConfidenceLevel,
} from "../confidence-badge/ConfidenceBadge";
import {
  resolveAccessState, _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";

export type RecommendationCardTone = "info" | "success" | "warning";

/**
 * RecommendationCard displays an AI-generated recommendation with confidence scoring,
 * rationale, citation badges, and primary/secondary action buttons.
 * @example
 * ```tsx
 * <RecommendationCard />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/recommendation-card)

 */
export interface RecommendationCardProps extends AccessControlledProps {
  /** Recommendation heading. */
  title: React.ReactNode;
  /** Brief summary of the recommendation. */
  summary: React.ReactNode;
  /** Category label shown as a badge (e.g. "Recommendation"). */
  recommendationType?: React.ReactNode;
  /** List of reasons supporting the recommendation. */
  rationale?: string[];
  /** Source citation labels shown as muted badges. */
  citations?: string[];
  /** AI confidence level indicator. @default "medium" */
  confidenceLevel?: ConfidenceLevel;
  /** Numeric confidence score (0-100). */
  confidenceScore?: number;
  /** Number of sources used for the recommendation. */
  sourceCount?: number;
  /** Label for the primary action button. @default "Apply" */
  primaryActionLabel?: string;
  /** Label for the secondary action button. @default "Review" */
  secondaryActionLabel?: string;
  /** Callback fired when the primary action is clicked. */
  onPrimaryAction?: () => void;
  /** Callback fired when the secondary action is clicked. */
  onSecondaryAction?: () => void;
  /** Semantic tone affecting the card's accent color. @default "info" */
  tone?: RecommendationCardTone;
  /** Use compact layout for the confidence badge. @default false */
  compact?: boolean;
  /** Additional badge elements rendered beside the type badge. */
  badges?: React.ReactNode[];
  /** Optional footer note below the action buttons. */
  footerNote?: React.ReactNode;
  /** Additional CSS class name. */
  className?: string;
}

const toneClasses: Record<RecommendationCardTone, string> = {
  info: "border-state-info-border bg-state-info",
  success: "border-state-success-border bg-state-success",
  warning: "border-state-warning-border bg-state-warning",
};

export const RecommendationCard = React.forwardRef<HTMLElement, RecommendationCardProps>(({
  title,
  summary,
  recommendationType = "Recommendation",
  rationale = [],
  citations = [],
  confidenceLevel = "medium",
  confidenceScore,
  sourceCount,
  primaryActionLabel = "Apply",
  secondaryActionLabel = "Review",
  onPrimaryAction,
  onSecondaryAction,
  tone = "info",
  compact = false,
  badges = [],
  footerNote,
  className = "",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const interactionState: AccessLevel = accessState.isDisabled
    ? "disabled"
    : accessState.isReadonly
      ? "readonly"
      : accessState.state;

  return (
    <article
      ref={ref}
      className={`rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs ${className}`.trim()}
      data-access-state={accessState.state}
      data-tone={tone}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={tone} className={toneClasses[tone]}>
              {recommendationType}
            </Badge>
            <ConfidenceBadge
              level={confidenceLevel}
              score={confidenceScore}
              sourceCount={sourceCount}
              compact={compact}
            />
            {badges.map((badge, index) => (
              <React.Fragment key={`recommendation-badge-${index}`}>
                {badge}
              </React.Fragment>
            ))}
          </div>
          <div>
            <Text as="h3" size="lg" weight="semibold">{title}</Text>
            <Text
              variant="secondary"
              className="mt-2 block leading-7"
            >
              {summary}
            </Text>
          </div>
        </div>
      </div>

      {rationale.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-border-subtle bg-surface-muted p-4">
          <Text variant="secondary" size="xs" weight="medium">Why this recommendation</Text>
          <ul className="flex flex-col mt-3 gap-2 text-sm text-text-secondary">
            {rationale.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {citations.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {citations.map((citation) => (
            <Badge key={citation} variant="muted">
              {citation}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            fullWidth={false}
            onClick={withAccessGuard(
              interactionState,
              () => onPrimaryAction?.(),
              accessState.isDisabled,
            )}
            access={accessState.isReadonly ? "readonly" : access}
            title={accessReason}
          >
            {primaryActionLabel}
          </Button>
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={withAccessGuard(
              interactionState,
              () => onSecondaryAction?.(),
              accessState.isDisabled,
            )}
            access={accessState.isReadonly ? "readonly" : access}
            title={accessReason}
          >
            {secondaryActionLabel}
          </Button>
        </div>
        {footerNote ? (
          <Text variant="secondary">{footerNote}</Text>
        ) : null}
      </div>
    </article>
  );
});

RecommendationCard.displayName = 'RecommendationCard';

export default RecommendationCard;
