import React from "react";
import { stateAttrs, focusRingClass } from "../../internal/interaction-core";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";
import type { SlotProps } from "../../primitives/_shared/slot-types";

export type AccordionSelectionMode = "single" | "multiple";
export type AccordionSize = "sm" | "md";
export type AccordionExpandIconPosition = "start" | "end";
export type AccordionCollapsible = "header" | "icon" | "disabled";

export interface AccordionSectionInput {
  key: string;
  title: React.ReactNode;
  content?: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  defaultExpanded?: boolean;
  disabled?: boolean;
  sections?: AccordionSectionInput[];
}

export interface CreateAccordionItemsFromSectionsOptions {
  nestedSelectionMode?: AccordionSelectionMode;
  nestedSize?: AccordionSize;
  nestedBordered?: boolean;
  nestedGhost?: boolean;
  nestedDisableGutters?: boolean;
  nestedCollapsible?: AccordionCollapsible;
  renderSectionContent?: (section: AccordionSectionInput) => React.ReactNode;
}

export type AccordionPresetKind = "faq" | "compact" | "settings";

export interface AccordionClasses {
  root?: string;
  item?: string;
  trigger?: string;
  header?: string;
  titleRow?: string;
  title?: string;
  description?: string;
  extra?: string;
  iconButton?: string;
  icon?: string;
  panel?: string;
  panelInner?: string;
}

export interface AccordionItem {
  value: string;
  title: React.ReactNode;
  content: React.ReactNode;
  description?: React.ReactNode;
  extra?: React.ReactNode;
  disabled?: boolean;
  defaultExpanded?: boolean;
  forceRender?: boolean;
  destroyOnHidden?: boolean;
  collapsible?: AccordionCollapsible;
  headerClassName?: string;
  panelClassName?: string;
}

export type AccordionSlot = "root" | "item" | "trigger" | "content";

/** Props for the Accordion component. */
export interface AccordionProps extends AccessControlledProps {
  /** Accordion section items to render. */
  items: AccordionItem[];
  /** Controlled expanded section value(s). */
  value?: string | string[];
  /** Initially expanded section(s) for uncontrolled mode. */
  defaultValue?: string | string[];
  /** Callback fired when the expanded sections change. */
  onValueChange?: (nextValue: string[]) => void;
  /** Callback fired when a single item is toggled. */
  onItemToggle?: (itemValue: string, expanded: boolean) => void;
  /** Whether one or multiple sections can be open simultaneously. */
  selectionMode?: AccordionSelectionMode;
  /** Accessible label for the accordion. */
  ariaLabel?: string;
  /** Size variant for header and content spacing. */
  size?: AccordionSize;
  /** Whether to show borders between sections. */
  bordered?: boolean;
  /** Whether to use the ghost (transparent) appearance. */
  ghost?: boolean;
  /** Whether to show the expand/collapse arrow indicator. */
  showArrow?: boolean;
  /** Custom expand icon element. */
  expandIcon?: React.ReactNode;
  /** Position of the expand icon relative to the header. */
  expandIconPosition?: AccordionExpandIconPosition;
  /** Whether to remove horizontal padding from sections. */
  disableGutters?: boolean;
  /** Whether to unmount collapsed section content from the DOM. */
  destroyOnHidden?: boolean;
  /** Controls which part of the header triggers collapse. */
  collapsible?: AccordionCollapsible;
  /** Custom class name overrides for sub-elements. */
  classes?: AccordionClasses;
  /** Additional CSS class name. */
  className?: string;
  /** Override props (className, style, etc.) on internal slot elements */
  slotProps?: SlotProps<AccordionSlot>;
}

export interface AccordionPreset {
  selectionMode: AccordionSelectionMode;
  size: AccordionSize;
  bordered: boolean;
  ghost: boolean;
  showArrow: boolean;
  expandIconPosition: AccordionExpandIconPosition;
  disableGutters: boolean;
  destroyOnHidden: boolean;
  collapsible: AccordionCollapsible;
}

function normalizeExpandedValue(
  value: AccordionProps["value"] | AccordionProps["defaultValue"],
): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [];
}

function getInitialExpandedItems(
  items: AccordionItem[],
  selectionMode: AccordionSelectionMode,
  defaultValue?: AccordionProps["defaultValue"],
) {
  const explicit = normalizeExpandedValue(defaultValue);
  if (explicit.length > 0) {
    return selectionMode === "single" ? explicit.slice(0, 1) : explicit;
  }

  const defaults = items
    .filter((item) => item.defaultExpanded)
    .map((item) => item.value);
  return selectionMode === "single" ? defaults.slice(0, 1) : defaults;
}

function getChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

const sizeClassNames: Record<AccordionSize, string> = {
  sm: "px-4 py-3 text-sm",
  md: "px-5 py-4 text-sm",
};

const descriptionClassNames: Record<AccordionSize, string> = {
  sm: "text-xs leading-5",
  md: "text-sm leading-6",
};

const gutterlessSizeClassNames: Record<AccordionSize, string> = {
  sm: "py-3 text-sm",
  md: "py-4 text-sm",
};

const accordionPremiumSurfaceClassName =
  "border border-border-subtle/80 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_28px_60px_-34px_var(--shadow-color)] backdrop-blur-xs";

/**
 * Collapsible content panels with single or multiple expand modes, keyboard navigation, and preset support.
 *
 * @example
 * ```tsx
 * <Accordion
 *   items={[
 *     { value: 'faq-1', title: 'How do I reset my password?', content: <p>Go to Settings...</p> },
 *     { value: 'faq-2', title: 'Where is my order?', content: <p>Track your order...</p> },
 *   ]}
 *   selectionMode="single"
 * />
 * ```
 */
export const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(({
  items,
  value,
  defaultValue,
  onValueChange,
  onItemToggle,
  selectionMode = "multiple",
  ariaLabel = "Accordion",
  size = "md",
  bordered = true,
  ghost = false,
  showArrow = true,
  expandIcon,
  expandIconPosition = "start",
  disableGutters = false,
  destroyOnHidden = true,
  collapsible = "header",
  classes,
  className,
  slotProps,
  access = "full",
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  const isControlled = value !== undefined;
  const [internalExpanded, setInternalExpanded] = React.useState<string[]>(
    () => getInitialExpandedItems(items, selectionMode, defaultValue),
  );

  if (accessState.isHidden) {
    return null;
  }

  const expandedItems = isControlled
    ? normalizeExpandedValue(value)
    : internalExpanded;

  const commitExpandedItems = React.useCallback(
    (nextValue: string[]) => {
      if (!isControlled) {
        setInternalExpanded(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [isControlled, onValueChange],
  );

  const resolvedIcon = expandIcon ?? getChevronIcon();

  return (
    <div
      ref={ref}
      {...slotProps?.root}
      className={cn(
        "accordion-root flex flex-col rounded-[24px]",
        bordered && !ghost && accordionPremiumSurfaceClassName,
        ghost && "bg-transparent",
        classes?.root,
        className,
        slotProps?.root?.className,
      )}
      data-component="accordion"
      data-surface-appearance={bordered && !ghost ? "premium" : undefined}
      data-access-state={accessState.state}
      data-selection-mode={selectionMode}
      aria-label={ariaLabel}
      title={accessReason}
    >
      {items.map((item, index) => {
        const expanded = expandedItems.includes(item.value);
        const itemCollapsible = item.collapsible ?? collapsible;
        const blocked =
          item.disabled ||
          itemCollapsible === "disabled" ||
          accessState.isDisabled ||
          accessState.isReadonly;
        const headerId = `accordion-header-${index}-${item.value}`;
        const panelId = `accordion-panel-${index}-${item.value}`;
        const resolvedDestroyOnHidden = item.destroyOnHidden ?? destroyOnHidden;
        const shouldRenderPanel =
          expanded || !resolvedDestroyOnHidden || Boolean(item.forceRender);
        const triggerPaddingClass = disableGutters
          ? gutterlessSizeClassNames[size]
          : sizeClassNames[size];

        const handleToggle = () => {
          if (blocked) {
            return;
          }

          let nextValue: string[];
          if (selectionMode === "single") {
            nextValue = expanded ? [] : [item.value];
          } else {
            nextValue = expanded
              ? expandedItems.filter((entry) => entry !== item.value)
              : [...expandedItems, item.value];
          }

          commitExpandedItems(nextValue);
          onItemToggle?.(item.value, !expanded);
        };

        const titleBlock = (
          <span
            className={cn("flex min-w-0 flex-1 flex-col", classes?.header)}
            data-slot="header"
          >
            <span
              className={cn("flex items-start gap-3", classes?.titleRow)}
              data-slot="title-row"
            >
              <span
                className={cn("min-w-0 flex-1", classes?.title)}
                data-slot="title"
              >
                {item.title}
              </span>
              {item.extra ? (
                <span
                  className={cn(
                    "shrink-0 text-text-secondary",
                    classes?.extra,
                  )}
                  data-slot="extra"
                >
                  {item.extra}
                </span>
              ) : null}
            </span>
            {item.description ? (
              <span
                className={cn(
                  "mt-1 font-normal text-text-secondary",
                  descriptionClassNames[size],
                  classes?.description,
                )}
                data-slot="description"
              >
                {item.description}
              </span>
            ) : null}
          </span>
        );

        const iconNode = showArrow ? (
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-text-secondary transition-[rotate]",
              expanded && "rotate-180",
              classes?.icon,
            )}
            data-slot="icon"
          >
            {resolvedIcon}
          </span>
        ) : null;

        return (
          <div
            key={item.value}
            {...slotProps?.item}
            className={cn(
              "accordion-item",
              bordered && !ghost && index > 0 && "border-t border-border-subtle",
              bordered && !ghost && "relative",
              classes?.item,
              slotProps?.item?.className,
            )}
            data-slot="item"
            {...stateAttrs({
              state: expanded ? "expanded" : "collapsed",
              component: "accordion",
              disabled: blocked || undefined,
            })}
          >
            <h3 className="m-0">
              <div
                {...slotProps?.trigger}
                className={cn(
                  "accordion-trigger flex w-full items-start gap-3 text-start font-semibold text-text-primary",
                  triggerPaddingClass,
                  ghost && "rounded-[20px]",
                  disableGutters && "px-0",
                  blocked && "opacity-60",
                  item.headerClassName,
                  classes?.trigger,
                  slotProps?.trigger?.className,
                )}
                data-slot="trigger"
              >
                {itemCollapsible === "icon" ? (
                  <span
                    className={cn(
                      "flex min-w-0 flex-1 items-start gap-3",
                      expandIconPosition === "end" &&
                        "flex-row-reverse justify-between",
                    )}
                  >
                    {titleBlock}
                    {showArrow ? (
                      <button
                        id={headerId}
                        type="button"
                        className={cn(
                          "accordion-icon-trigger mt-0.5 inline-flex shrink-0 items-center justify-center rounded-xl border border-border-subtle/70 bg-[var(--surface-card)] p-1.5 text-text-secondary shadow-[0_14px_28px_-22px_var(--shadow-color)] transition hover:-translate-y-px hover:border-border-default hover:bg-[var(--surface-hover)] hover:text-text-primary hover:shadow-[0_18px_32px_-20px_var(--shadow-color)]",
                          focusRingClass("ring"),
                          blocked && "cursor-not-allowed",
                          classes?.iconButton,
                        )}
                        aria-label={
                          typeof item.title === "string"
                            ? `${item.title} panelini ac veya kapat`
                            : "Paneli ac veya kapat"
                        }
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        aria-disabled={blocked || undefined}
                        disabled={blocked}
                        onClick={handleToggle}
                        data-slot="icon-button"
                      >
                        {iconNode}
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <button
                    id={headerId}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[18px] px-2 py-1 text-start transition hover:bg-[var(--surface-hover)] hover:shadow-[0_18px_34px_-28px_var(--shadow-color)]",
                      focusRingClass("ring"),
                      expanded &&
                        "bg-[var(--surface-hover)] shadow-[0_20px_40px_-30px_var(--shadow-color)]",
                      blocked && "cursor-not-allowed",
                      expandIconPosition === "end"
                        ? "flex-row-reverse justify-end"
                        : "justify-between",
                    )}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    aria-disabled={blocked || undefined}
                    disabled={blocked}
                    onClick={handleToggle}
                  >
                    {titleBlock}
                    {iconNode}
                  </button>
                )}
              </div>
            </h3>
            {shouldRenderPanel ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                hidden={!expanded}
                aria-hidden={!expanded || undefined}
                {...slotProps?.content}
                className={cn(
                  "accordion-panel border-t border-border-subtle/80 text-text-secondary",
                  bordered &&
                    !ghost &&
                    "bg-[var(--surface-card-alt)]",
                  ghost && "border-t-0",
                  item.panelClassName,
                  classes?.panel,
                  slotProps?.content?.className,
                )}
                data-slot="panel"
              >
                <div
                  className={cn(
                    disableGutters
                      ? gutterlessSizeClassNames[size]
                      : sizeClassNames[size],
                    "pt-3",
                    bordered && !ghost && "pb-1",
                    disableGutters && "px-0",
                    classes?.panelInner,
                  )}
                  data-slot="panel-inner"
                >
                  {item.content}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

Accordion.displayName = "Accordion";

function getNestedAccordionLabel(section: AccordionSectionInput): string {
  return typeof section.title === "string" && section.title.trim().length > 0
    ? `${section.title} alt bolumleri`
    : "Alt bolumler";
}

function buildNestedAccordionContent(
  section: AccordionSectionInput,
  options: CreateAccordionItemsFromSectionsOptions,
): React.ReactNode {
  const baseContent = options.renderSectionContent
    ? options.renderSectionContent(section)
    : section.content;

  if (!section.sections || section.sections.length === 0) {
    return baseContent ?? null;
  }

  const nestedAccordion = (
    <Accordion
      items={createAccordionItemsFromSections(section.sections, options)}
      selectionMode={options.nestedSelectionMode ?? "multiple"}
      size={options.nestedSize ?? "sm"}
      bordered={options.nestedBordered ?? false}
      ghost={options.nestedGhost ?? true}
      disableGutters={options.nestedDisableGutters ?? true}
      collapsible={options.nestedCollapsible ?? "header"}
      ariaLabel={getNestedAccordionLabel(section)}
    />
  );

  if (baseContent == null) {
    return nestedAccordion;
  }

  return (
    <div className="flex flex-col gap-3">
      {baseContent}
      {nestedAccordion}
    </div>
  );
}

export function createAccordionItemsFromSections(
  sections: AccordionSectionInput[],
  options: CreateAccordionItemsFromSectionsOptions = {},
): AccordionItem[] {
  return sections.map((section) => ({
    value: section.key,
    title: section.title,
    content: buildNestedAccordionContent(section, options),
    description: section.description,
    extra: section.extra,
    defaultExpanded: section.defaultExpanded,
    disabled: section.disabled,
  }));
}

export function createAccordionPreset(
  kind: AccordionPresetKind,
): AccordionPreset {
  switch (kind) {
    case "compact":
      return {
        selectionMode: "multiple",
        size: "sm",
        bordered: false,
        ghost: true,
        showArrow: true,
        expandIconPosition: "end",
        disableGutters: true,
        destroyOnHidden: false,
        collapsible: "icon",
      };
    case "settings":
      return {
        selectionMode: "multiple",
        size: "sm",
        bordered: true,
        ghost: false,
        showArrow: true,
        expandIconPosition: "end",
        disableGutters: true,
        destroyOnHidden: true,
        collapsible: "header",
      };
    case "faq":
    default:
      return {
        selectionMode: "single",
        size: "md",
        bordered: true,
        ghost: false,
        showArrow: true,
        expandIconPosition: "end",
        disableGutters: false,
        destroyOnHidden: true,
        collapsible: "header",
      };
  }
}

export default Accordion;
