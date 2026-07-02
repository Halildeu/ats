import React from "react";
import { Badge, type BadgeVariant } from "../../primitives/badge/Badge";
import { Text } from "../../primitives/text/Text";
import { EmptyState as Empty } from "../empty-state";
import {
  resolveAccessState, _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";

export type CitationKind = "policy" | "doc" | "code" | "log" | "dataset";

export interface CitationPanelItem {
  id: string;
  title: React.ReactNode;
  excerpt: React.ReactNode;
  source: React.ReactNode;
  locator?: React.ReactNode;
  kind?: CitationKind;
  badges?: React.ReactNode[];
}

/** Props for the CitationPanel component.
 * @example
 * ```tsx
 * <CitationPanel />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/citation-panel)
 */
export interface CitationPanelProps extends AccessControlledProps {
  /** Citation items to display in the panel. */
  items: CitationPanelItem[];
  /** Heading text above the citation list. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Whether to use a compact layout. */
  compact?: boolean;
  /** ID of the currently selected citation. */
  activeCitationId?: string | null;
  /** Label shown when there are no citations. */
  emptyStateLabel?: React.ReactNode;
  /** Callback fired when a citation is clicked. */
  onOpenCitation?: (id: string, item: CitationPanelItem) => void;
  /** Additional CSS class name. */
  className?: string;
}

const kindTone: Record<CitationKind, BadgeVariant> = {
  policy: "info",
  doc: "default",
  code: "success",
  log: "warning",
  dataset: "muted",
};

const citationPanelSurfaceClassName =
  "relative overflow-hidden rounded-[32px] border border-border-subtle/80 bg-surface-raised bg-[var(--surface-card)] p-5 shadow-[0_24px_52px_-36px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-7 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--border-subtle)_40%,transparent)] before:to-transparent";

/** Panel displaying a list of source citations with excerpt, kind badge, and selection support. */
export const CitationPanel = React.forwardRef<HTMLElement, CitationPanelProps>(({
  items,
  title = "Alintilar",
  description = "Kaynak seffafligi ve alinti parcasi tek panel yuzeyinde okunur.",
  compact = false,
  activeCitationId = null,
  emptyStateLabel = "Kaynak bulunamadi.",
  onOpenCitation,
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
    <section
      ref={ref}
      className={`${citationPanelSurfaceClassName} ${className}`.trim()}
      data-access-state={accessState.state}
      data-component="citation-panel"
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

      {items.length === 0 ? (
        <div className="mt-4 rounded-[24px] border border-border-subtle/70 bg-[var(--surface-card)] p-4 shadow-[0_18px_32px_-28px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs">
          <Empty
            description={
              typeof emptyStateLabel === "string"
                ? emptyStateLabel
                : "Kaynak bulunamadi."
            }
          />
        </div>
      ) : (
        <div className="flex flex-col mt-4 gap-3">
          {items.map((item) => {
            const selected = item.id === activeCitationId;
            const blocked = accessState.isDisabled || accessState.isReadonly;
            const body = (
              <div className="flex flex-col min-w-0 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {item.kind ? (
                    <Badge variant={kindTone[item.kind]}>{item.kind}</Badge>
                  ) : null}
                  {item.locator ? (
                    <Badge variant="muted">{item.locator}</Badge>
                  ) : null}
                  {item.badges?.map((badge, index) => (
                    <React.Fragment key={`${item.id}-badge-${index}`}>
                      {badge}
                    </React.Fragment>
                  ))}
                </div>
                <div className="min-w-0">
                  <Text
                    as="div"
                    className="text-sm font-semibold text-text-primary break-words"
                  >
                    {item.title}
                  </Text>
                  <Text
                    variant="secondary"
                    className="mt-1 block text-sm leading-6 break-words"
                  >
                    {item.source}
                  </Text>
                </div>
                <div
                  className={`rounded-[20px] border border-border-subtle/70 bg-[var(--surface-card)] px-4 py-3 shadow-[0_14px_28px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs ${compact ? "text-sm" : "text-sm leading-7"} text-text-primary`}
                >
                  {item.excerpt}
                </div>
              </div>
            );

            return onOpenCitation ? (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-[26px] border px-4 py-4 text-left transition duration-(--motion-duration-medium) ${selected ? "border-action-primary-border/70 bg-[var(--surface-card-alt)] shadow-[0_20px_36px_-28px_var(--shadow-color)] ring-1 ring-border-subtle/20" : "border-border-subtle/75 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)] hover:-translate-y-px hover:bg-[var(--surface-hover)] hover:shadow-[0_20px_34px_-28px_var(--shadow-color)]"} ${blocked ? "cursor-not-allowed opacity-70" : ""}`}
                onClick={withAccessGuard<React.MouseEvent<HTMLButtonElement>>(
                  interactionState,
                  () => onOpenCitation(item.id, item),
                  accessState.isDisabled,
                )}
                aria-current={selected ? "true" : undefined}
                title={accessReason}
              >
                {body}
              </button>
            ) : (
              <div
                key={item.id}
                className={`rounded-[26px] border px-4 py-4 ${selected ? "border-action-primary-border/70 bg-[var(--surface-card-alt)] shadow-[0_20px_36px_-28px_var(--shadow-color)] ring-1 ring-border-subtle/20" : "border-border-subtle/75 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]"}`}
              >
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
});

CitationPanel.displayName = 'CitationPanel';

export default CitationPanel;
