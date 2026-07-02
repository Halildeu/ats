import React from "react";
import { cn } from "../../utils/cn";
import { Slot } from "../_shared/Slot";
import {
  resolveAccessState,
  withAccessGuard,
  type AccessControlledProps,
  type AccessLevel,
} from "../../internal/access-controller";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";

/* ------------------------------------------------------------------ */
/*  LinkInline — Inline anchor with tone, underline, and access ctrl   */
/* ------------------------------------------------------------------ */

export type LinkInlineTone = "primary" | "secondary";
export type LinkInlineUnderline = "always" | "hover" | "none";

const toneClasses: Record<LinkInlineTone, string> = {
  primary:
    "text-action-primary visited:text-text-secondary hover:text-accent-primary-hover",
  secondary:
    "text-text-secondary hover:text-text-primary",
};

const underlineClasses: Record<LinkInlineUnderline, string> = {
  always: "underline underline-offset-4",
  hover: "no-underline hover:underline hover:underline-offset-4",
  none: "no-underline",
};

/**
 * LinkInline renders an accessible inline anchor with tone, underline control,
 * access gating, and optional leading/trailing visuals.
 */
export interface LinkInlineProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children">,
    AccessControlledProps {
  /** Link content. */
  children: React.ReactNode;
  /** @deprecated Visual tone. Use `variant` as a modern alias. */
  tone?: LinkInlineTone;
  /** Color variant for the link text. @default "primary" */
  variant?: LinkInlineTone;
  /** Underline behavior. @default "hover" */
  underline?: LinkInlineUnderline;
  /** Whether this link represents the current page (sets aria-current). */
  current?: boolean;
  /** Disable interaction and render as an inert span. */
  disabled?: boolean;
  /** Force external link behavior (target="_blank", rel="noopener"). Auto-detected from href. */
  external?: boolean;
  /** Icon or element rendered before the link text. */
  leadingVisual?: React.ReactNode;
  /** Icon or element rendered after the link text. */
  trailingVisual?: React.ReactNode;
  /** Locale text overrides. */
  localeText?: {
    /** Screen reader label for external link indicator. @default "External link" */
    externalScreenReaderLabel?: React.ReactNode;
  };
  /**
   * Render via Slot — merges LinkInline props onto the child element.
   * Useful for composing with router Link components.
   * @example
   * <LinkInline asChild tone="primary">
   *   <NextLink href="/about">About</NextLink>
   * </LinkInline>
   */
  asChild?: boolean;
}

/** Inline text link with tone control, underline behavior, external indicator, and access gating. */
export const LinkInline = React.forwardRef<HTMLElement, LinkInlineProps>(
  function LinkInline(
    {
      children,
      className,
      tone: toneProp,
      variant,
      underline = "hover",
      current = false,
      disabled = false,
      external,
      leadingVisual,
      trailingVisual,
      localeText,
      access = "full",
      accessReason,
      href,
      onClick,
      rel,
      target,
      title,
      asChild = false,
      ...props
    },
    ref,
  ) {
    const tone = variant ?? toneProp ?? "primary";

    if (process.env.NODE_ENV !== "production" && toneProp !== undefined) {
      console.warn(
        '[DesignSystem] "LinkInline" prop "tone" is deprecated. Use "variant" instead. "tone" will be removed in v3.0.0.',
      );
    }

    const accessState = resolveAccessState(access);
    if (accessState.isHidden) {
      return null;
    }

    const inferredExternal =
      typeof href === "string" && /^https?:\/\//.test(href);
    const isExternal = external ?? inferredExternal;
    const blocked =
      disabled || accessState.isDisabled || accessState.isReadonly;
    const interactionState: AccessLevel = blocked
      ? "disabled"
      : accessState.state;
    const resolvedExternalScreenReaderLabel =
      localeText?.externalScreenReaderLabel ?? "External link";

    const handleClick = withAccessGuard<React.MouseEvent<HTMLAnchorElement>>(
      interactionState,
      onClick,
      blocked,
    );

    const baseClassName = cn(
      "inline-flex items-center gap-1 rounded-md font-medium transition",
      focusRingClass("ring"),
      toneClasses[tone],
      underlineClasses[underline],
      current &&
        "font-semibold text-text-primary decoration-[var(--action-primary)] underline underline-offset-4",
      blocked &&
        "cursor-not-allowed border border-border-subtle bg-surface-muted px-2 py-1 text-[var(--text-disabled)] no-underline opacity-100",
      className,
    );

    const titleText = accessReason ?? title;

    if (blocked || !href) {
      return (
        <span
          className={baseClassName}
          data-access-state={accessState.state}
          data-link-state="blocked"
          aria-disabled="true"
          title={titleText}
        >
          {leadingVisual ? (
            <span aria-hidden="true">{leadingVisual}</span>
          ) : null}
          <span>{children}</span>
          {trailingVisual ? (
            <span aria-hidden="true">{trailingVisual}</span>
          ) : null}
        </span>
      );
    }

    const linkProps = {
      ...props,
      href,
      onClick: handleClick,
      className: baseClassName,
      ...stateAttrs({ component: "link-inline", disabled: blocked }),
      "data-access-state": accessState.state,
      "data-link-state": current ? "current" : isExternal ? "external" : "internal",
      "aria-current": current ? ("page" as const) : undefined,
      target: isExternal ? ("_blank" as const) : target,
      rel: isExternal ? "noopener noreferrer" : rel,
      title: titleText,
    };

    // asChild: render via Slot, merging props onto the child element
    if (asChild) {
      return (
        <Slot ref={ref} {...linkProps}>
          {children}
        </Slot>
      );
    }

    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        {...linkProps}
      >
        {leadingVisual ? (
          <span aria-hidden="true">{leadingVisual}</span>
        ) : null}
        <span>{children}</span>
        {trailingVisual ? (
          <span aria-hidden="true">{trailingVisual}</span>
        ) : null}
        {isExternal && !trailingVisual ? (
          <span aria-hidden="true">↗</span>
        ) : null}
        {isExternal ? (
          <span className="sr-only">{resolvedExternalScreenReaderLabel}</span>
        ) : null}
      </a>
    );
  },
);

LinkInline.displayName = "LinkInline";

export default LinkInline;
