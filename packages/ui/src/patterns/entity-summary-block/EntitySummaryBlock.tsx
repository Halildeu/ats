import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { Avatar } from "../../primitives/avatar/Avatar";
import {
  Descriptions,
  type DescriptionsItem,
} from "../../components/descriptions/Descriptions";
import { Text } from "../../primitives/text/Text";

/* ------------------------------------------------------------------ */
/*  EntitySummaryBlock — Summary card with avatar, title & key-values  */
/* ------------------------------------------------------------------ */

/** Props for {@link EntitySummaryBlock}.
 * @example
 * ```tsx
 * <EntitySummaryBlock />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/entity-summary-block)
 */
export interface EntitySummaryBlockProps extends AccessControlledProps {
  /** Primary heading for the entity. */
  title: React.ReactNode;
  /** Secondary text displayed below the title. */
  subtitle?: React.ReactNode;
  /** Badge rendered inline next to the title. */
  badge?: React.ReactNode;
  /** Avatar configuration displayed beside the title area. */
  avatar?: {
    /** Image source URL for the avatar. */
    src?: string;
    /** Alt text for the avatar image. */
    alt?: string;
    /** Name used to derive initials when no image is available. */
    name?: string;
    /** Icon rendered as a fallback when no image or initials are available. */
    fallbackIcon?: React.ReactNode;
  };
  /** Action buttons rendered in the top-right corner. */
  actions?: React.ReactNode;
  /** Key-value description items displayed in a two-column grid. */
  items: DescriptionsItem[];
  /** Additional CSS class for the outer section element. */
  className?: string;
}

const entitySummarySurfaceClassName =
  "relative overflow-hidden rounded-[32px] border border-border-subtle/80 bg-[var(--surface-card)] p-6 shadow-[0_24px_52px_-36px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-7 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent";

/** Summary card displaying an entity with avatar, title, badges, actions, and key-value items. */
export const EntitySummaryBlock = React.forwardRef<HTMLElement, EntitySummaryBlockProps>(({
  title,
  subtitle,
  badge,
  avatar,
  actions,
  items,
  className,
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
      className={cn(entitySummarySurfaceClassName, className)}
      data-access-state={accessState.state}
      data-component="entity-summary-block"
      data-surface-appearance="premium"
      title={accessReason}
    >
      <div className="flex flex-wrap gap-4 border-b border-border-subtle/70 pb-5" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
        <div className="flex min-w-0 items-start gap-4">
          {avatar ? (
            <Avatar
              src={avatar.src}
              alt={avatar.alt}
              initials={avatar.name}
              icon={avatar.fallbackIcon}
              size="xl"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Text
                as="h3"
                className="text-xl font-semibold tracking-[-0.03em] text-text-primary break-words"
              >
                {title}
              </Text>
              {badge ? <div>{badge}</div> : null}
            </div>
            {subtitle ? (
              <Text variant="secondary" className="mt-2 block text-sm leading-7">
                {subtitle}
              </Text>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <Descriptions items={items} columns={2} className="mt-0" />
    </section>
  );
});

EntitySummaryBlock.displayName = "EntitySummaryBlock";

export default EntitySummaryBlock;

/** Type alias for EntitySummaryBlock ref. */
export type EntitySummaryBlockRef = React.Ref<HTMLElement>;
/** Type alias for EntitySummaryBlock element. */
export type EntitySummaryBlockElement = HTMLElement;
/** Type alias for EntitySummaryBlock cssproperties. */
export type EntitySummaryBlockCSSProperties = React.CSSProperties;
