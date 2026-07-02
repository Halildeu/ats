import React from "react";
import {
  ApprovalCheckpoint,
  type ApprovalCheckpointProps,
} from "../approval-checkpoint/ApprovalCheckpoint";
import {
  CitationPanel,
  type CitationPanelItem,
} from "../citation-panel/CitationPanel";
import {
  AIActionAuditTimeline,
  type AIActionAuditTimelineItem,
} from "../ai-action-audit-timeline/AIActionAuditTimeline";
import { Text } from "../../primitives/text/Text";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/**
 * ApprovalReview combines a human checkpoint, citation evidence, and audit trail
 * into a single review surface for AI-generated actions.
 * @example
 * ```tsx
 * <ApprovalReview />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/approval-review)

 */
export interface ApprovalReviewProps extends AccessControlledProps {
  /** Section heading. @default "Approval review" */
  title?: React.ReactNode;
  /** Explanatory text below the title. */
  description?: React.ReactNode;
  /** Props forwarded to the ApprovalCheckpoint sub-component. */
  checkpoint: ApprovalCheckpointProps;
  /** Citation items displayed in the evidence panel. */
  citations: CitationPanelItem[];
  /** Audit trail entries for the AI action timeline. */
  auditItems: AIActionAuditTimelineItem[];
  /** Controlled active citation ID. */
  selectedCitationId?: string | null;
  /** Initial citation ID for uncontrolled mode. */
  defaultSelectedCitationId?: string | null;
  /** Callback when a citation is selected. */
  onCitationSelect?: (citationId: string, item: CitationPanelItem) => void;
  /** Controlled active audit item ID. */
  selectedAuditId?: string | null;
  /** Initial audit item ID for uncontrolled mode. */
  defaultSelectedAuditId?: string | null;
  /** Callback when an audit item is selected. */
  onAuditSelect?: (
    auditId: string,
    item: AIActionAuditTimelineItem,
  ) => void;
  /** Additional CSS class name. */
  className?: string;
}

const approvalReviewSurfaceClassName =
  "relative overflow-hidden rounded-[32px] border border-border-subtle/80 bg-[var(--surface-card)] p-5 shadow-[0_24px_52px_-36px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-7 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--border-subtle)_40%,transparent)] before:to-transparent";

export const ApprovalReview = React.forwardRef<HTMLElement, ApprovalReviewProps>(({
  title = "Approval review",
  description = "Human checkpoint, source evidence ve audit izleri ayni review recipe altinda gorunur.",
  checkpoint,
  citations,
  auditItems,
  selectedCitationId,
  defaultSelectedCitationId = null,
  onCitationSelect,
  selectedAuditId,
  defaultSelectedAuditId = null,
  onAuditSelect,
  className = "",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const [internalCitationId, setInternalCitationId] = React.useState<
    string | null
  >(defaultSelectedCitationId);
  const [internalAuditId, setInternalAuditId] = React.useState<string | null>(
    defaultSelectedAuditId,
  );

  if (accessState.isHidden) {
    return null;
  }

  const currentCitationId = selectedCitationId ?? internalCitationId;
  const currentAuditId = selectedAuditId ?? internalAuditId;

  return (
    <section
      ref={ref}
      className={`${approvalReviewSurfaceClassName} ${className}`.trim()}
      data-access-state={accessState.state}
      data-component="approval-review"
      data-surface-appearance="premium"
      title={accessReason}
    >
      <Text
        as="div"
        className="text-base font-semibold tracking-[-0.02em] text-text-primary"
      >
        {title}
      </Text>
      <Text variant="secondary" className="mt-1 block text-sm leading-6">
        {description}
      </Text>

      <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <ApprovalCheckpoint className="min-w-0"
          {...checkpoint}
          access={access}
          accessReason={accessReason}
        />
        <CitationPanel
          className="min-w-0"
          items={citations}
          activeCitationId={currentCitationId}
          onOpenCitation={(citationId, item) => {
            if (selectedCitationId === undefined) {
              setInternalCitationId(citationId);
            }
            onCitationSelect?.(citationId, item);
          }}
          access={access}
          accessReason={accessReason}
        />
      </div>

      <div className="mt-4">
        <AIActionAuditTimeline
          items={auditItems}
          selectedId={currentAuditId}
          onSelectItem={(auditId, item) => {
            if (selectedAuditId === undefined) {
              setInternalAuditId(auditId);
            }
            onAuditSelect?.(auditId, item);
          }}
          access={access}
          accessReason={accessReason}
        />
      </div>
    </section>
  );
});

ApprovalReview.displayName = 'ApprovalReview';

export default ApprovalReview;

/** Type alias for ApprovalReview ref. */
export type ApprovalReviewRef = React.Ref<HTMLElement>;
/** Type alias for ApprovalReview element. */
export type ApprovalReviewElement = HTMLElement;
/** Type alias for ApprovalReview cssproperties. */
export type ApprovalReviewCSSProperties = React.CSSProperties;
