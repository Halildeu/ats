import React from "react";
import {
  resolveAccessState, _accessStyles,
  shouldBlockInteraction,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { Badge, type BadgeVariant } from "../../primitives/badge/Badge";
import { EmptyState as Empty } from "../empty-state/EmptyState";
import { Skeleton } from "../../primitives/skeleton/Skeleton";
import { Text } from "../../primitives/text/Text";

/* ------------------------------------------------------------------ */
/*  List — Vertical list of interactive or static items               */
/* ------------------------------------------------------------------ */

export type ListDensity = "comfortable" | "compact";
export type ListTone = "default" | "info" | "success" | "warning" | "danger";

export type ListItem = {
  key: React.Key;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  badges?: Array<React.ReactNode | string>;
  tone?: ListTone;
  disabled?: boolean;
};

/** Props for the List component.
 * @example
 * ```tsx
 * <List />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/list)
 */
export interface ListProps extends AccessControlledProps {
  /** Data items to render in the list. */
  items: ListItem[];
  /** Heading text above the list. */
  title?: React.ReactNode;
  /** Descriptive text below the heading. */
  description?: React.ReactNode;
  /** Row spacing density variant. */
  density?: ListDensity;
  /** Whether to show a border around the list container. */
  bordered?: boolean;
  /** Label shown when the list is empty. */
  emptyStateLabel?: React.ReactNode;
  /** Locale-specific label overrides. */
  localeText?: {
    emptyFallbackDescription?: React.ReactNode;
  };
  /** Whether to show loading skeleton rows. */
  loading?: boolean;
  /** Key of the currently selected item. */
  selectedKey?: React.Key | null;
  /** Callback fired when a list item is selected. */
  onItemSelect?: (key: React.Key) => void;
  /** Whether the list spans the full container width. */
  fullWidth?: boolean;
}

const densityClass: Record<ListDensity, string> = {
  comfortable: "px-4 py-4",
  compact: "px-4 py-3",
};

const listSurfaceClassName =
  "relative overflow-hidden rounded-[28px] bg-[var(--surface-card)] shadow-[0_22px_48px_-34px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent";

const toneClass: Record<ListTone, string> = {
  default:
    "border border-border-subtle/75 bg-[var(--surface-card-alt)] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]",
  info:
    "border border-state-info-border/55 bg-[var(--surface-card-alt),rgba(246,247,255,0.88)))] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]",
  success:
    "border border-state-success-border/55 bg-[var(--surface-card-alt),rgba(247,250,255,0.88)))] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]",
  warning:
    "border border-state-warning-border/55 bg-[var(--surface-card-alt),rgba(255,247,237,0.88)))] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]",
  danger:
    "border border-state-danger-border/55 bg-[var(--surface-card-alt),rgba(255,247,247,0.88)))] ring-1 ring-border-subtle/20 shadow-[0_16px_30px_-28px_var(--shadow-color)]",
};

const badgeToneMap: Record<ListTone, BadgeVariant> = {
  default: "default",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

/** Vertical list of interactive or static items with optional selection, badges, and tone indicators. */
export const List = React.forwardRef<HTMLElement, ListProps>(({
  items,
  title,
  description,
  density = "comfortable",
  bordered = true,
  emptyStateLabel = "No records found for this list.",
  localeText,
  loading = false,
  selectedKey = null,
  onItemSelect,
  fullWidth = true,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const resolvedEmptyFallbackDescription =
    localeText?.emptyFallbackDescription ??
    (typeof emptyStateLabel === "string" ? emptyStateLabel : "No records found.");

  if (accessState.isHidden) {
    return null;
  }

  const showEmpty = !loading && items.length === 0;

  return (
    <section
      ref={ref}
      className={fullWidth ? "w-full" : undefined}
      data-access-state={accessState.state}
      data-component="list"
      data-surface-appearance="premium"
      data-loading={loading ? "true" : "false"}
      data-testid="list-loading-state"
      aria-busy={loading || undefined}
      title={accessReason}
    >
      {title ? (
        <Text as="div" className="text-base font-semibold tracking-[-0.02em] text-text-primary">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="secondary" className="mt-1 block text-sm leading-6">
          {description}
        </Text>
      ) : null}

      <div
        className={[
          "mt-4",
          listSurfaceClassName,
          bordered ? "border border-border-subtle/80" : "border border-transparent",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {showEmpty ? (
          <div className="p-5">
            <Empty description={resolvedEmptyFallbackDescription} />
          </div>
        ) : (
          <ul className="flex flex-col gap-3 p-3">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <li
                    key={`loading-${index}`}
                    className={`${toneClass.default} overflow-hidden rounded-[24px]`}
                  >
                    <div className={densityClass[density]}>
                      <div className="flex items-start gap-3">
                        <Skeleton circle height={40} className="shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1 gap-2">
                          <Skeleton lines={1} />
                          <Skeleton lines={1} animated={false} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              : items.map((item) => {
                  const itemTone = item.tone ?? "default";
                  const selected = selectedKey === item.key;
                  const interactive = typeof onItemSelect === "function";
                  const blocked = shouldBlockInteraction(accessState.state, item.disabled);
                  const sharedClassName = [
                    "w-full rounded-[24px] text-left transition duration-(--motion-duration-medium)",
                    densityClass[density],
                    selected
                      ? "bg-[color-mix(in_oklab,var(--action-primary-soft)_60%,transparent)] shadow-[0_18px_34px_-28px_var(--action-primary-shadow,hsl(var(--accent-hue,245)_67%_59%/0.38))]"
                      : "",
                    blocked
                      ? "cursor-not-allowed opacity-70"
                      : interactive
                        ? "hover:-translate-y-px hover:bg-[var(--surface-card)] hover:shadow-[0_18px_30px_-26px_var(--shadow-color)] active:translate-y-0"
                        : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const content = (
                    <div className="flex items-start gap-3">
                      {item.prefix ? <div className="flex shrink-0 pt-0.5">{item.prefix}</div> : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-col min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Text as="div" className="min-w-0 text-sm font-semibold text-text-primary">
                                {item.title}
                              </Text>
                              {item.badges?.map((badge, badgeIndex) =>
                                typeof badge === "string" ? (
                                  <Badge key={`${item.key}-badge-${badgeIndex}`} variant={badgeToneMap[itemTone]}>
                                    {badge}
                                  </Badge>
                                ) : (
                                  <React.Fragment key={`${item.key}-badge-${badgeIndex}`}>{badge}</React.Fragment>
                                ),
                              )}
                            </div>
                            {item.description ? (
                              <Text variant="secondary" className="block text-sm leading-6">
                                {item.description}
                              </Text>
                            ) : null}
                          </div>
                          {(item.meta || item.suffix) ? (
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              {item.meta ? (
                                <Text variant="secondary" className="rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] shadow-[0_12px_24px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs">
                                  {item.meta}
                                </Text>
                              ) : null}
                              {item.suffix}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <li
                      key={item.key}
                      className={`${toneClass[itemTone]} overflow-hidden rounded-[24px]`}
                      data-selected={selected ? "true" : "false"}
                    >
                      {interactive ? (
                        <button
                          type="button"
                          className={sharedClassName}
                          aria-current={selected ? "true" : undefined}
                          onClick={(event) => {
                            if (blocked) {
                              event.preventDefault();
                              event.stopPropagation();
                              return;
                            }
                            onItemSelect?.(item.key);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={sharedClassName}>{content}</div>
                      )}
                    </li>
                  );
                })}
          </ul>
        )}
      </div>
    </section>
  );
});

List.displayName = "List";

export default List;
