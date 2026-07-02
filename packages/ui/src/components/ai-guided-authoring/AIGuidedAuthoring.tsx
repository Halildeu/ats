import React from "react";
import { Button } from "../../primitives/button/Button";
import { Text } from "../../primitives/text/Text";
import {
  ConfidenceBadge,
  type ConfidenceLevel,
} from "../confidence-badge/ConfidenceBadge";
import {
  CommandPalette,
  type CommandPaletteItem,
} from "../command-palette";
import {
  PromptComposer,
  type PromptComposerProps,
} from "../prompt-composer/PromptComposer";
import {
  RecommendationCard,
  type RecommendationCardProps,
} from "../recommendation-card/RecommendationCard";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

export type { CommandPaletteItem };

export interface AIGuidedAuthoringRecommendation
  extends Omit<
    RecommendationCardProps,
    "onPrimaryAction" | "onSecondaryAction"
  > {
  id: string;
}

/**
 * AIGuidedAuthoring orchestrates a prompt composer, recommendation stack,
 * confidence badge, and command palette into a unified authoring workflow.
 * @example
 * ```tsx
 * <AIGuidedAuthoring />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/a-i-guided-authoring)

 */
export interface AIGuidedAuthoringProps extends AccessControlledProps {
  /** Section heading. @default "AI guided authoring" */
  title?: React.ReactNode;
  /** Explanatory text below the title. */
  description?: React.ReactNode;
  /** Props forwarded to the embedded PromptComposer. */
  promptComposerProps?: Partial<PromptComposerProps>;
  /** List of recommendation cards to display alongside the composer. */
  recommendations?: AIGuidedAuthoringRecommendation[];
  /** Items available in the command palette. */
  commandItems?: CommandPaletteItem[];
  /** Overall confidence level indicator. @default "medium" */
  confidenceLevel?: ConfidenceLevel;
  /** Numeric confidence score (0-100). */
  confidenceScore?: number;
  /** Number of sources contributing to the confidence. */
  sourceCount?: number;
  /** Label above the confidence badge. */
  confidenceLabel?: React.ReactNode;
  /** Controlled open state for the command palette. */
  paletteOpen?: boolean;
  /** Initial palette open state for uncontrolled mode. @default false */
  defaultPaletteOpen?: boolean;
  /** Callback fired when the palette open state changes. */
  onPaletteOpenChange?: (open: boolean) => void;
  /** Callback fired when a recommendation's primary action is triggered. */
  onApplyRecommendation?: (
    id: string,
    item: AIGuidedAuthoringRecommendation,
  ) => void;
  /** Callback fired when a recommendation's secondary action is triggered. */
  onReviewRecommendation?: (
    id: string,
    item: AIGuidedAuthoringRecommendation,
  ) => void;
  /** Additional CSS class name. */
  className?: string;
}

/**
 * AI-guided authoring wizard that provides step-by-step content creation
 * with intelligent suggestions, recommendation cards and command palette integration.
 */
export const AIGuidedAuthoring = React.forwardRef<HTMLElement, AIGuidedAuthoringProps>(({
  title = "AI guided authoring",
  description = "Prompt yazimi, recommendation stack ve command palette ayni authoring recipe altinda birlikte calisir.",
  promptComposerProps,
  recommendations = [],
  commandItems = [],
  confidenceLevel = "medium",
  confidenceScore,
  sourceCount,
  confidenceLabel = "MEVCUT GUVEN",
  paletteOpen,
  defaultPaletteOpen = false,
  onPaletteOpenChange,
  onApplyRecommendation,
  onReviewRecommendation,
  className = "",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [internalPaletteOpen, setInternalPaletteOpen] =
    React.useState(defaultPaletteOpen);

  if (accessState.isHidden) {
    return null;
  }

  const currentPaletteOpen = paletteOpen ?? internalPaletteOpen;

  const setPaletteOpen = (next: boolean) => {
    if (paletteOpen === undefined) {
      setInternalPaletteOpen(next);
    }
    onPaletteOpenChange?.(next);
  };

  return (
    <section
      ref={ref}
      className={`rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs ${className}`.trim()}
      data-access-state={accessState.state}
      data-component="ai-guided-authoring"
      title={accessReason}
    >
      <div className="flex flex-wrap gap-3" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <Text
            as="div"
            className="text-base font-semibold text-text-primary"
          >
            {title}
          </Text>
          <Text variant="secondary" className="mt-1 block text-sm leading-6">
            {description}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-border-subtle bg-surface-default px-4 py-3">
            <Text
              variant="secondary"
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              {confidenceLabel}
            </Text>
            <div className="mt-2">
              <ConfidenceBadge
                level={confidenceLevel}
                score={confidenceScore}
                sourceCount={sourceCount}
              />
            </div>
          </div>
          {commandItems.length ? (
            <Button
              fullWidth={false}
              variant="secondary"
              onClick={() => setPaletteOpen(true)}
              access={access}
              accessReason={accessReason}
            >
              Komut paleti
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <PromptComposer
          className="min-w-0"
          access={access}
          accessReason={accessReason}
          {...promptComposerProps}
        />

        <div className="flex flex-col min-w-0 gap-4">
          {recommendations.length ? (
            recommendations.map((recommendation) => (
              <RecommendationCard
                key={recommendation.id}
                {...recommendation}
                access={access}
                accessReason={accessReason}
                onPrimaryAction={() =>
                  onApplyRecommendation?.(recommendation.id, recommendation)
                }
                onSecondaryAction={() =>
                  onReviewRecommendation?.(recommendation.id, recommendation)
                }
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-border-subtle bg-surface-default p-4">
              <Text
                variant="secondary"
                className="block text-sm leading-6"
              >
                Recommendation yok. Prompt ve command kararlarini ekledikce
                recipe ayni yan paneli tekrar kullanir.
              </Text>
            </div>
          )}
        </div>
      </div>

      {commandItems.length ? (
        <CommandPalette
          open={currentPaletteOpen}
          items={commandItems}
          onClose={() => setPaletteOpen(false)}
          access={access}
          accessReason={accessReason}
        />
      ) : null}
    </section>
  );
});

AIGuidedAuthoring.displayName = 'AIGuidedAuthoring';

export default AIGuidedAuthoring;
