import React from "react";
import { cn } from "../../utils/cn";
import {
  Descriptions,
  type DescriptionsItem,
} from "../../components/descriptions/Descriptions";
import { PageHeader } from "../page-header/PageHeader";
import {
  SummaryStrip,
  type SummaryStripItem,
} from "../summary-strip/SummaryStrip";
import {
  EntitySummaryBlock,
  type EntitySummaryBlockProps,
} from "../entity-summary-block/EntitySummaryBlock";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  DetailSummary — Full detail page combining header, summary,       */
/*  entity block, descriptions and optional JSON viewer               */
/* ------------------------------------------------------------------ */

/** Props for the DetailSummary component.
 * @example
 * ```tsx
 * <DetailSummary />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/detail-summary)
 */
export interface DetailSummaryProps extends AccessControlledProps {
  /** Breadcrumb or eyebrow text above the title */
  eyebrow?: React.ReactNode;
  /** Primary heading for the detail page */
  title: React.ReactNode;
  /** Subtitle or description below the title */
  description?: React.ReactNode;
  /** Secondary metadata (version, date, etc.) */
  meta?: React.ReactNode;
  /** Status badge or indicator */
  status?: React.ReactNode;
  /** Action buttons (edit, delete, etc.) */
  actions?: React.ReactNode;
  /** Aside slot rendered next to the header */
  aside?: React.ReactNode;
  /** KPI items for the summary strip */
  summaryItems?: SummaryStripItem[];
  /** Entity summary block configuration */
  entity: EntitySummaryBlockProps;
  /** Key-value description list items */
  detailItems?: DescriptionsItem[];
  /** Heading for the detail descriptions panel */
  detailTitle?: React.ReactNode;
  /** Description for the detail descriptions panel */
  detailDescription?: React.ReactNode;
  /** Raw JSON value for the debug viewer panel */
  jsonValue?: unknown;
  /** Heading for the JSON viewer panel */
  jsonTitle?: React.ReactNode;
  /** Description for the JSON viewer panel */
  jsonDescription?: React.ReactNode;
  /** Additional CSS class for the root section */
  className?: string;
}

const detailSummaryPanelClassName =
  "relative overflow-hidden rounded-[28px] border border-border-subtle/80 bg-[var(--surface-card))] p-5 shadow-[0_22px_48px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card))] before:to-transparent";

/* ---- Inline JSON viewer (no external dependency) ---- */

interface InlineJsonViewerProps {
  value: unknown;
  title?: React.ReactNode;
  description?: React.ReactNode;
}

const InlineJsonViewer: React.FC<InlineJsonViewerProps> = ({
  value,
  title,
  description,
}) => (
  <div>
    {(title || description) && (
      <div className="mb-3">
        {title && (
          <h4 className="text-sm font-semibold text-text-primary">
            {title}
          </h4>
        )}
        {description && (
          <p className="mt-0.5 text-xs text-text-secondary">
            {description}
          </p>
        )}
      </div>
    )}
    <pre className="overflow-auto rounded-lg bg-surface-muted p-4 text-xs leading-relaxed text-text-primary">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

/**
 * Full detail page layout combining page header, summary strip, entity block,
 * description list and optional JSON viewer into a single composable pattern.
 */
export const DetailSummary = React.forwardRef<HTMLElement, DetailSummaryProps>(({
  eyebrow,
  title,
  description,
  meta,
  status,
  actions,
  aside,
  summaryItems = [],
  entity,
  detailItems = [],
  detailTitle = "Detail contract",
  detailDescription = "Summary, entity context ve machine-readable payload ayni recipe altinda tutulur.",
  jsonValue,
  jsonTitle = "JSON payload",
  jsonDescription = "Denetim, debug ve support akislarinda ayni veri gorunumu tekrar kullanilir.",
  className = "",
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  /* Map ui-kit PageHeader props to design-system PageHeader props */
  const headerExtra =
    meta || status ? (
      <div className="flex items-center gap-3">
        {status}
        {meta}
      </div>
    ) : undefined;

  return (
    <section
      ref={ref}
      className={cn("flex flex-col gap-4", className)}
      data-access-state={accessState.state}
      data-component="detail-summary"
      data-surface-appearance="premium"
      title={accessReason}
    >
      <PageHeader
        breadcrumb={eyebrow}
        title={title}
        subtitle={description}
        extra={
          headerExtra || aside ? (
            <div className="flex items-center justify-between gap-3">
              {headerExtra}
              {aside}
            </div>
          ) : undefined
        }
        actions={actions}
      />

      {summaryItems.length ? (
        <div className={detailSummaryPanelClassName}>
          <SummaryStrip
            items={summaryItems}
            columns={4}
          />
        </div>
      ) : null}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))" }}>
        <EntitySummaryBlock
          className="min-w-0"
          {...entity}
          access={access}
          accessReason={accessReason}
        />

        <div className="flex flex-col min-w-0 gap-4">
          {detailItems.length ? (
            <div className={detailSummaryPanelClassName}>
              <Descriptions
                title={detailTitle}
                description={detailDescription}
                items={detailItems}
                columns={2}
              />
            </div>
          ) : null}

          {typeof jsonValue !== "undefined" ? (
            <div className={detailSummaryPanelClassName}>
              <InlineJsonViewer
                value={jsonValue}
                title={jsonTitle}
                description={jsonDescription}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});

DetailSummary.displayName = 'DetailSummary';

export default DetailSummary;

/** Type alias for DetailSummary ref. */
export type DetailSummaryRef = React.Ref<HTMLElement>;
/** Type alias for DetailSummary element. */
export type DetailSummaryElement = HTMLElement;
/** Type alias for DetailSummary cssproperties. */
export type DetailSummaryCSSProperties = React.CSSProperties;
