import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Notification types                                                  */
/* ------------------------------------------------------------------ */

export type NotificationItemType =
  | "success"
  | "info"
  | "warning"
  | "error"
  | "loading";
export type NotificationItemPriority = "normal" | "high";

export type NotificationSurfaceItem = {
  id: string;
  message: string;
  description?: string;
  type?: NotificationItemType;
  priority?: NotificationItemPriority;
  pinned?: boolean;
  createdAt?: number;
  read?: boolean;
  meta?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ */
/*  NotificationItemCard                                                */
/* ------------------------------------------------------------------ */

/** Props for the NotificationItemCard component.
 * @example
 * ```tsx
 * <NotificationItemCard />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/notification-item-card)
 */
export interface NotificationItemCardProps extends AccessControlledProps {
  /** Notification data to render. */
  item: NotificationSurfaceItem;
  /** Additional CSS class name. */
  className?: string;
  /** Accessible label for the remove button. */
  removeLabel?: string;
  /** Returns the primary action button label for a given item, or null to hide it. */
  getPrimaryActionLabel?: (
    item: NotificationSurfaceItem,
  ) => string | null | undefined;
  /** Callback fired when the primary action button is clicked. */
  onPrimaryAction?: (item: NotificationSurfaceItem) => void;
  /** Callback fired when the remove button is clicked. */
  onRemove?: (id: string) => void;
  /** Custom formatter for the notification timestamp. */
  formatTimestamp?: (
    timestamp: number | undefined,
    item: NotificationSurfaceItem,
  ) => React.ReactNode;
  /** Whether the card shows a selection checkbox. */
  selectable?: boolean;
  /** Whether the card is currently selected. */
  selected?: boolean;
  /** Accessible label for the selection checkbox. */
  selectLabel?: string;
  /** Callback fired when the selection state changes. */
  onSelectedChange?: (
    item: NotificationSurfaceItem,
    selected: boolean,
  ) => void;
}

type BadgeTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "muted";

const badgeToneMap: Record<NotificationItemType, BadgeTone> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "danger",
  loading: "muted",
};

const badgeToneClassName: Record<BadgeTone, string> = {
  success:
    "border-state-success-border/70 bg-state-success/10 text-state-success-text",
  info: "border-state-info-border/70 bg-state-info/10 text-state-info-text",
  warning:
    "border-state-warning-border/70 bg-state-warning/10 text-state-warning-text",
  danger:
    "border-state-danger-border/70 bg-state-danger/10 text-state-danger-text",
  muted: "border-border-subtle/70 bg-surface-panel text-text-secondary",
};

const defaultFormatTimestamp = (timestamp: number | undefined) => {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return null;
  }
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return String(timestamp);
  }
};

/** Individual notification card with type indicator, timestamp, and optional primary action. */
export const NotificationItemCard = React.forwardRef<HTMLDivElement, NotificationItemCardProps>(({
  item,
  className = "",
  removeLabel = "Bildirimi kapat",
  getPrimaryActionLabel,
  onPrimaryAction,
  onRemove,
  formatTimestamp = defaultFormatTimestamp,
  selectable = false,
  selected = false,
  selectLabel,
  onSelectedChange,
  access = "full",
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) {
    return null;
  }

  const resolvedType = item.type ?? "info";
  const resolvedPriority = item.priority ?? "normal";
  const primaryActionLabel = getPrimaryActionLabel?.(item) ?? null;
  const timestampLabel = formatTimestamp(item.createdAt, item);
  const actionState = accessState.isDisabled
    ? "disabled"
    : accessState.isReadonly
      ? "readonly"
      : accessState.state;

  const handlePrimaryAction = withAccessGuard<
    React.MouseEvent<HTMLButtonElement>
  >(actionState, () => onPrimaryAction?.(item));
  const handleRemove = withAccessGuard<
    React.MouseEvent<HTMLButtonElement>
  >(actionState, () => onRemove?.(item.id));
  const handleSelectedChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (accessState.isReadonly || accessState.isDisabled) {
      event.preventDefault();
      return;
    }
    onSelectedChange?.(item, event.target.checked);
  };
  const resolvedSelectLabel =
    selectLabel ?? `${item.message} bildirimini sec`;

  return (
    <article
      data-component="notification-item-card"
      data-surface-appearance="premium"
      data-access-state={accessState.state}
      data-type={resolvedType}
      data-priority={resolvedPriority}
      data-pinned={item.pinned ? "true" : "false"}
      data-read={item.read ? "true" : "false"}
      title={accessReason}
      className={cn(
        "relative overflow-hidden rounded-[24px] border p-4 ring-1 ring-border-subtle/20 shadow-[0_26px_54px_-34px_var(--shadow-color)] backdrop-blur-xs before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent",
        resolvedPriority === "high"
          ? "border-state-warning-border/80 bg-[linear-gradient(180deg,var(--color-state-warning-bg),var(--color-state-warning-bg-subtle))] ring-state-warning-border/35"
          : "border-border-subtle/75 bg-[var(--surface-card)]",
        item.pinned &&
          "shadow-[0_30px_62px_-34px_var(--shadow-color)]",
        item.read && "opacity-80",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <div className="pt-0.5">
            <input
              type="checkbox"
              aria-label={resolvedSelectLabel}
              checked={selected}
              disabled={accessState.isReadonly || accessState.isDisabled}
              onChange={handleSelectedChange}
              className="h-4 w-4 rounded-xs border border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
              style={{ accentColor: "var(--color-action-primary-bg)" }}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  badgeToneClassName[badgeToneMap[resolvedType]],
                )}
              >
                {resolvedType.toUpperCase()}
              </span>
              {resolvedPriority === "high" ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    badgeToneClassName.warning,
                  )}
                >
                  ONCELIKLI
                </span>
              ) : null}
              {item.pinned ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    badgeToneClassName.muted,
                  )}
                >
                  PINLENMIS
                </span>
              ) : null}
            </div>
            <div
              className={
                item.read
                  ? "leading-6 text-text-secondary"
                  : "font-semibold leading-6 text-text-primary"
              }
            >
              {item.message}
            </div>
            {item.description ? (
              <div className="leading-6 text-xs text-text-secondary">
                {item.description}
              </div>
            ) : null}
            {timestampLabel ? (
              <div className="text-[11px] font-medium text-text-subtle">
                {timestampLabel}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {primaryActionLabel && onPrimaryAction ? (
              <button
                type="button"
                className="rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-3 py-1 text-xs font-semibold text-action-primary-text shadow-[0_14px_28px_-24px_var(--shadow-color)] transition hover:-translate-y-px hover:border-border-default hover:bg-[var(--surface-card)] hover:no-underline hover:shadow-[0_18px_32px_-22px_var(--shadow-color)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handlePrimaryAction}
                disabled={accessState.isReadonly || accessState.isDisabled}
              >
                {primaryActionLabel}
              </button>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                aria-label={removeLabel}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle/70 bg-[var(--surface-card)] text-text-subtle shadow-[0_14px_28px_-24px_var(--shadow-color)] transition hover:-translate-y-px hover:border-border-default hover:bg-[var(--surface-card)] hover:text-text-primary hover:shadow-[0_18px_32px_-22px_var(--shadow-color)] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleRemove}
                disabled={accessState.isReadonly || accessState.isDisabled}
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
});

NotificationItemCard.displayName = "NotificationItemCard";

export default NotificationItemCard;
