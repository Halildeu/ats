import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  AnchorToc — On-page table of contents with hash sync               */
/* ------------------------------------------------------------------ */

export type AnchorTocDensity = "comfortable" | "compact";

export interface AnchorTocItem {
  id: string;
  label: React.ReactNode;
  level?: 1 | 2 | 3;
  meta?: React.ReactNode;
  disabled?: boolean;
}

/** Props for the AnchorToc component.
 * @example
 * ```tsx
 * <AnchorToc />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/anchor-toc)
 */
export interface AnchorTocProps extends AccessControlledProps {
  /** Ordered list of table-of-contents entries. */
  items: AnchorTocItem[];
  /** Controlled active item ID. */
  value?: string;
  /** Initial active item ID for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the active item changes. */
  onValueChange?: (value: string) => void;
  /** Heading text above the navigation list. */
  title?: React.ReactNode;
  /** Spacing density variant. */
  density?: AnchorTocDensity;
  /** Whether the TOC sticks to the viewport on scroll. */
  sticky?: boolean;
  /** Whether to synchronize active item with the URL hash. */
  syncWithHash?: boolean;
  /** Additional CSS class name. */
  className?: string;
  /** Locale-specific label overrides. */
  localeText?: {
    title?: React.ReactNode;
    navigationLabel?: string;
  };
}

const densityClass: Record<AnchorTocDensity, string> = {
  comfortable: "gap-2 p-3 text-sm",
  compact: "gap-1.5 p-2.5 text-xs",
};

const levelClass: Record<1 | 2 | 3, string> = {
  1: "ps-0",
  2: "ps-4",
  3: "ps-8",
};

const readHashId = () => {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
};

/** On-page table of contents that syncs with URL hash for anchor-based section navigation. */
export const AnchorToc = React.forwardRef<HTMLElement, AnchorTocProps>(
  function AnchorToc(
    {
      items,
      value,
      defaultValue,
      onValueChange,
      title,
      density = "comfortable",
      sticky = false,
      syncWithHash = true,
      className,
      localeText,
      access = "full",
      accessReason,
    },
    ref,
  ) {
    const accessState = resolveAccessState(access);
    const firstItemId =
      items.find((item) => !item.disabled)?.id ?? items[0]?.id ?? "";
    const hashItemId = syncWithHash ? readHashId() : "";
    const initialValue =
      hashItemId && items.some((item) => item.id === hashItemId)
        ? hashItemId
        : (defaultValue ?? firstItemId);
    const isControlled = typeof value === "string";
    const [internalValue, setInternalValue] = React.useState(initialValue);

    React.useEffect(() => {
      if (!syncWithHash || isControlled || typeof window === "undefined")
        return undefined;

      const applyHash = () => {
        const nextHashId = readHashId();
        if (nextHashId && items.some((item) => item.id === nextHashId)) {
          setInternalValue(nextHashId);
        }
      };

      applyHash();
      window.addEventListener("hashchange", applyHash);
      return () => window.removeEventListener("hashchange", applyHash);
    }, [isControlled, items, syncWithHash]);

    if (accessState.isHidden || items.length === 0) {
      return null;
    }

    const currentValue = isControlled ? value ?? firstItemId : internalValue;
    const blocked = accessState.isDisabled || accessState.isReadonly;
    const interactionState: AccessLevel = blocked
      ? "disabled"
      : accessState.state;
    const resolvedTitle = title ?? localeText?.title ?? "Bu sayfada";
    const resolvedNavigationLabel =
      localeText?.navigationLabel ?? "Sayfa ici navigasyon";

    const commit = (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      if (syncWithHash && typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${nextValue}`);
      }
      onValueChange?.(nextValue);
    };

    return (
      <nav
        ref={ref}
        aria-label={resolvedNavigationLabel}
        title={accessReason}
        {...stateAttrs({ component: "anchor-toc", disabled: blocked })}
        data-access-state={accessState.state}
        data-density={density}
        className={cn(
          "rounded-[28px] border border-border-subtle bg-surface-default p-4 shadow-xs",
          sticky && "lg:sticky lg:top-6",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
            {resolvedTitle}
          </span>
          <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
            {items.length}
          </span>
        </div>

        <ol className="mt-4 flex flex-col gap-2">
          {items.map((item) => {
            const level = item.level ?? 1;
            const active = item.id === currentValue;
            const disabled = blocked || Boolean(item.disabled);
            return (
              <li
                key={item.id}
                className={cn("min-w-0", levelClass[level])}
                data-level={String(level)}
              >
                <a
                  href={`#${item.id}`}
                  aria-current={active ? "location" : undefined}
                  aria-disabled={disabled || undefined}
                  data-active={active ? "true" : "false"}
                  className={cn(
                    "group flex min-w-0 items-center justify-between rounded-2xl border transition",
                    focusRingClass("ring"),
                    densityClass[density],
                    active
                      ? "border-[var(--accent-primary))] bg-[var(--accent-soft)] text-text-primary shadow-xs"
                      : "border-transparent bg-transparent text-text-secondary hover:border-border-subtle hover:bg-surface-muted hover:text-text-primary",
                    disabled && "pointer-events-none opacity-55",
                  )}
                  onClick={withAccessGuard<
                    React.MouseEvent<HTMLAnchorElement>
                  >(
                    interactionState,
                    (event) => {
                      event.preventDefault();
                      commit(item.id);
                    },
                    disabled,
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {item.label}
                    </span>
                  </span>
                  {item.meta ? (
                    <span className="ms-3 shrink-0 text-[11px] font-medium text-text-secondary">
                      {item.meta}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  },
);

AnchorToc.displayName = "AnchorToc";

export default AnchorToc;
