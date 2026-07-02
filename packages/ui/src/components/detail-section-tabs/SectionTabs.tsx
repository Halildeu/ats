import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import {
  Segmented,
  type SegmentedClasses,
} from '../segmented';
import { Tooltip } from '../../primitives/tooltip/Tooltip';

export type SectionTabsDensity = 'compact' | 'comfortable';
export type SectionTabsLayout = 'scroll' | 'wrap' | 'auto';
export type SectionTabsBreakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type SectionTabsDescriptionVisibility = 'always' | 'hover' | 'active' | 'active-or-hover';
export type SectionTabsDescriptionDisplay = 'inline' | 'tooltip';

export interface SectionTabsItem {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  dataTestId?: string;
  disabled?: boolean;
  itemClassName?: string;
  activeClassName?: string;
  badgeClassName?: string;
}

export interface SectionTabsClasses extends SegmentedClasses {
  viewport?: string;
  hintTrigger?: string;
  hintContent?: string;
}

export interface SectionTabsProps extends AccessControlledProps {
  /** Tab items to render. */
  items: SectionTabsItem[];
  /** Controlled active tab value. */
  value?: string;
  /** Initial active tab value for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the active tab changes. */
  onValueChange?: (nextValue: string) => void;
  /** Accessible label for the tab group. */
  ariaLabel?: string;
  /** Spacing density variant. */
  density?: SectionTabsDensity;
  /** Layout strategy for tab overflow. */
  layout?: SectionTabsLayout;
  /** Breakpoint at which auto layout switches from scroll to wrap. */
  autoWrapBreakpoint?: SectionTabsBreakpoint;
  /** Controls when tab descriptions become visible. */
  descriptionVisibility?: SectionTabsDescriptionVisibility;
  /** How descriptions are rendered (inline text or tooltip). */
  descriptionDisplay?: SectionTabsDescriptionDisplay;
  /** Additional CSS class name. */
  className?: string;
  /** Custom class name overrides for sub-elements. */
  classes?: SectionTabsClasses;
}

const densityClassMap: Record<
  SectionTabsDensity,
  {
    item: string;
    content: string;
    label: string;
    badge: string;
    description: string;
  }
> = {
  compact: {
    item: 'min-h-9 px-3 py-1.5 sm:min-h-10 sm:px-3.5 sm:py-2',
    content: 'gap-1 justify-start text-left',
    label: 'text-sm font-semibold leading-5',
    badge: 'min-w-6 px-2 py-0.5 text-[11px] font-semibold',
    description: 'max-w-36 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-4 text-text-secondary sm:max-w-40',
  },
  comfortable: {
    item: 'min-h-10 px-3.5 py-2 sm:min-h-11 sm:px-4 sm:py-2.5',
    content: 'gap-1.5 justify-start text-left',
    label: 'text-sm font-semibold leading-5',
    badge: 'min-w-6 px-2 py-0.5 text-[11px] font-semibold',
    description: 'max-w-40 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-4 text-text-secondary sm:max-w-44',
  },
};

const sectionTabsBreakpointOrder: SectionTabsBreakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];

function getSectionTabsBreakpoint(width: number): SectionTabsBreakpoint {
  if (width < 640) return 'base';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1280) return 'lg';
  if (width < 1536) return 'xl';
  return '2xl';
}

function isSectionTabsBreakpointAtOrAbove(
  breakpoint: SectionTabsBreakpoint,
  threshold: SectionTabsBreakpoint,
): boolean {
  return sectionTabsBreakpointOrder.indexOf(breakpoint) >= sectionTabsBreakpointOrder.indexOf(threshold);
}

function getDescriptionVisibilityClassName(
  visibility: SectionTabsDescriptionVisibility,
): string {
  const baseHidden =
    'mt-0 block max-h-0 max-w-0 translate-y-[-2px] overflow-hidden whitespace-nowrap opacity-0 transition-all duration-(--motion-duration-fast) ease-out';

  switch (visibility) {
    case 'always':
      return 'mt-1 block max-w-full opacity-100';
    case 'hover':
      return cn(
        baseHidden,
        'group-hover/section-tab:mt-1 group-hover/section-tab:translate-y-0 group-hover/section-tab:max-w-full group-hover/section-tab:max-h-10 group-hover/section-tab:opacity-100',
        'group-focus-within/section-tab:mt-1 group-focus-within/section-tab:translate-y-0 group-focus-within/section-tab:max-w-full group-focus-within/section-tab:max-h-10 group-focus-within/section-tab:opacity-100',
      );
    case 'active':
      return cn(
        baseHidden,
        'group-data-[state=active]/section-tab:mt-1',
        'group-data-[state=active]/section-tab:max-w-full',
        'group-data-[state=active]/section-tab:max-h-10',
        'group-data-[state=active]/section-tab:translate-y-0',
        'group-data-[state=active]/section-tab:opacity-100',
      );
    case 'active-or-hover':
    default:
      return cn(
        baseHidden,
        'group-data-[state=active]/section-tab:mt-1',
        'group-data-[state=active]/section-tab:max-w-full',
        'group-data-[state=active]/section-tab:max-h-10',
        'group-data-[state=active]/section-tab:translate-y-0',
        'group-data-[state=active]/section-tab:opacity-100',
        'group-hover/section-tab:mt-1 group-hover/section-tab:translate-y-0 group-hover/section-tab:max-w-full group-hover/section-tab:max-h-10 group-hover/section-tab:opacity-100',
        'group-focus-within/section-tab:mt-1 group-focus-within/section-tab:translate-y-0 group-focus-within/section-tab:max-w-full group-focus-within/section-tab:max-h-10 group-focus-within/section-tab:opacity-100',
      );
  }
}

/**
 * Segmented tab strip for switching between detail page sections with support
 * for responsive scroll/wrap layouts, density variants and description tooltips.
   * @example
   * ```tsx
   * <SectionTabs />
   * ```
   * @since 1.0.0
   * @see [Docs](https://design.mfe.dev/components/section-tabs)
  
 */
export const SectionTabs = React.forwardRef<HTMLDivElement, SectionTabsProps>(function SectionTabs(
  {
    items,
    value,
    defaultValue,
    onValueChange,
    ariaLabel = 'Section tabs',
    density = 'compact',
    layout = 'scroll',
    autoWrapBreakpoint = '2xl',
    descriptionVisibility = 'active-or-hover',
    descriptionDisplay = 'tooltip',
    className,
    classes,
    access = 'full',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    accessReason,
  },
  ref,
) {
  const accessState = resolveAccessState(access);
  const densityClasses = densityClassMap[density];
  const [breakpoint, setBreakpoint] = React.useState<SectionTabsBreakpoint>(() =>
    typeof window === 'undefined' ? 'xl' : getSectionTabsBreakpoint(window.innerWidth),
  );

  React.useEffect(() => {
    if (layout !== 'auto' || typeof window === 'undefined') {
      return undefined;
    }
    const handleResize = () => setBreakpoint(getSectionTabsBreakpoint(window.innerWidth));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layout]);

  const resolvedLayout = layout === 'auto'
    ? isSectionTabsBreakpointAtOrAbove(breakpoint, autoWrapBreakpoint)
      ? 'wrap'
      : 'scroll'
    : layout;

  const resolvedDescriptionDisplay =
    descriptionVisibility === 'always' ? 'inline' : descriptionDisplay;
  const descriptionVisibilityClassName = getDescriptionVisibilityClassName(descriptionVisibility);

  const segmentedItems = React.useMemo(
    () =>
      items.map((item) => {
        if (!item.description || resolvedDescriptionDisplay === 'inline') {
          return item;
        }

        const hintLabel =
          typeof item.label === 'string' ? `${item.label} bilgisi` : 'Bolum aciklamasi';

        return {
          ...item,
          description: undefined,
          badge: (
            <span data-segmented-badge-cluster="true" className="inline-flex items-center gap-1.5">
              {item.badge ? (
                <span
                  data-access-state={accessState.state}
                  className={cn(
                    'inline-flex min-w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-text-primary',
                    densityClasses.badge,
                    item.badgeClassName,
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
              <Tooltip
                content={
                  <div className={cn('max-w-[15rem] text-left text-[11px] font-medium leading-5', classes?.hintContent)}>
                    {item.description}
                  </div>
                }
                placement="bottom"
                align="start"
                openDelay={90}
                closeDelay={50}
                className="inline-flex"
                showArrow
              >
                <span
                  title={hintLabel}
                  data-testid={item.dataTestId ? `${item.dataTestId}-hint` : undefined}
                  className={cn(
                    'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-default/90 text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary shadow-xs transition hover:border-border-default hover:text-text-primary',
                    classes?.hintTrigger,
                  )}
                >
                  i
                </span>
              </Tooltip>
            </span>
          ),
        };
      }),
    [classes?.hintContent, classes?.hintTrigger, densityClasses.badge, items, resolvedDescriptionDisplay],
  );

  if (accessState.isHidden) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn('section-tabs-root w-full', className)}
      data-component="section-tabs"
      data-density={density}
      data-layout={layout}
      data-resolved-layout={resolvedLayout}
      data-breakpoint={breakpoint}
      data-description-visibility={descriptionVisibility}
      data-description-display={resolvedDescriptionDisplay}
    >
      <div
        className={cn(
          'section-tabs-viewport w-full',
          resolvedLayout === 'scroll'
            ? 'overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'overflow-visible',
          classes?.viewport,
        )}
        data-slot="viewport"
      >
        <Segmented
          items={segmentedItems}
          value={value}
          defaultValue={defaultValue}
          onValueChange={(nextValue) => {
            if (typeof nextValue === 'string' && nextValue) {
              onValueChange?.(nextValue);
            }
          }}
          selectionMode="single"
          size="md"
          orientation="horizontal"
          appearance="ghost"
          shape="pill"
          iconPosition="end"
          fullWidth={resolvedLayout === 'wrap'}
          ariaLabel={ariaLabel}
          classes={{
            root: cn(
              'border border-border-subtle bg-surface-default/95 p-1 shadow-xs backdrop-blur-xs sm:p-1.5',
              resolvedLayout === 'scroll' ? 'inline-flex min-w-max rounded-[20px]' : 'w-full rounded-[20px]',
              classes?.root,
            ),
            list: cn(
              'gap-1.5',
              resolvedLayout === 'scroll' ? 'flex-nowrap whitespace-nowrap' : 'w-full flex-wrap',
              classes?.list,
            ),
            item: cn(
              'group/section-tab',
              resolvedLayout === 'scroll' && 'shrink-0',
              resolvedLayout === 'scroll' && 'max-w-[9.25rem] sm:max-w-[10rem] xl:max-w-[10.75rem] 2xl:max-w-[11rem]',
              densityClasses.item,
              classes?.item,
            ),
            activeItem: cn(
              'bg-surface-default shadow-[0_14px_28px_-18px_var(--shadow-color,hsl(var(--accent-hue,250)_50%_23%/0.55))] ring-1 ring-border-default/80',
              'before:absolute before:inset-0 before:rounded-[inherit] before:ring-1 before:ring-accent-soft/70 before:content-[\'\']',
              classes?.activeItem,
            ),
            content: cn(densityClasses.content, classes?.content),
            label: cn(densityClasses.label, classes?.label),
            badge: cn(densityClasses.badge, classes?.badge),
            description:
              resolvedDescriptionDisplay === 'inline'
                ? cn(densityClasses.description, descriptionVisibilityClassName, classes?.description)
                : 'sr-only',
          }}
        />
      </div>
    </div>
  );
});

SectionTabs.displayName = "SectionTabs";
