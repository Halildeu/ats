import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { focusRingClass, stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  NavigationRail — Vertical navigation rail                          */
/* ------------------------------------------------------------------ */

export type NavigationRailAlignment = 'start' | 'center';
export type NavigationRailSize = 'sm' | 'md';
export type NavigationRailAppearance = 'default' | 'outline' | 'ghost';
export type NavigationRailLabelVisibility = 'always' | 'active' | 'none';
export type NavigationRailPresetKind = 'workspace' | 'compact_utility' | 'ops_side_nav';

export interface NavigationRailItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  dataTestId?: string;
  ariaLabel?: string;
  href?: string;
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  matchPath?: string | string[];
  disabled?: boolean;
  itemClassName?: string;
  activeClassName?: string;
}

export interface NavigationDestinationInput {
  value: string;
  label?: React.ReactNode;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  dataTestId?: string;
  href?: string;
  current?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  matchPath?: string | string[];
}

export interface CreateNavigationDestinationItemsOptions {
  currentValue?: string;
  currentPath?: string;
  currentBadge?: React.ReactNode;
}

export interface NavigationRailClasses {
  root?: string;
  list?: string;
  item?: string;
  activeItem?: string;
  icon?: string;
  label?: string;
  description?: string;
  badge?: string;
  footer?: string;
}

/** Props for the NavigationRail component.
 * @example
 * ```tsx
 * <NavigationRail />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/navigation-rail)
 */
export interface NavigationRailProps extends AccessControlledProps {
  /** Navigation items to render in the rail. */
  items: NavigationRailItem[];
  /** Controlled active item value. */
  value?: string;
  /** Initial active item value for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the active item changes. */
  onValueChange?: (value: string) => void;
  /** Callback fired when a navigation item is clicked. */
  onItemClick?: (value: string, event: React.MouseEvent<HTMLElement>) => void;
  /** Accessible label for the navigation rail. */
  ariaLabel?: string;
  /** Vertical alignment of items within the rail. */
  align?: NavigationRailAlignment;
  /** Whether to use the narrow compact layout. */
  compact?: boolean;
  /** Size variant for item spacing. */
  size?: NavigationRailSize;
  /** Visual appearance variant. */
  appearance?: NavigationRailAppearance;
  /** Controls when item labels are visible. */
  labelVisibility?: NavigationRailLabelVisibility;
  /** Current URL path used for automatic active detection. */
  currentPath?: string;
  /** Content rendered at the bottom of the rail. */
  footer?: React.ReactNode;
  /** Additional CSS class name. */
  className?: string;
  /** Custom class name overrides for sub-elements. */
  classes?: NavigationRailClasses;
}

export interface ResolveNavigationRailActiveValueArgs {
  currentValue?: string;
  items: NavigationRailItem[];
  currentPath?: string;
}

export interface NavigationRailPreset {
  compact: boolean;
  size: NavigationRailSize;
  align: NavigationRailAlignment;
  appearance: NavigationRailAppearance;
  labelVisibility: NavigationRailLabelVisibility;
}

const sizeClassNames: Record<NavigationRailSize, string> = {
  sm: 'min-h-11 px-3 py-2 text-xs',
  md: 'min-h-12 px-4 py-3 text-sm',
};

const rootClassByAppearance: Record<NavigationRailAppearance, string> = {
  default:
    'border border-border-subtle/80 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_22px_48px_-32px_var(--shadow-color)] backdrop-blur-xs',
  outline:
    'border border-border-default/80 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_18px_40px_-34px_var(--shadow-color)] backdrop-blur-xs',
  ghost:
    'border border-transparent bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_14px_34px_-32px_var(--shadow-color)] backdrop-blur-xs',
};

function getEnabledValues(items: NavigationRailItem[]): string[] {
  return items.filter((item) => !item.disabled).map((item) => item.value);
}

function matchesCurrentPath(item: NavigationRailItem, currentPath?: string): boolean {
  if (!currentPath) {
    return false;
  }

  const candidates = Array.isArray(item.matchPath)
    ? item.matchPath
    : item.matchPath
      ? [item.matchPath]
      : item.href
        ? [item.href]
        : [];

  return candidates.some((candidate) => candidate === currentPath);
}

function getItemLabelText(item: NavigationRailItem): string {
  if (item.ariaLabel) {
    return item.ariaLabel;
  }
  if (typeof item.label === 'string' || typeof item.label === 'number') {
    return String(item.label);
  }
  return item.value;
}

export function resolveNavigationRailActiveValue({
  currentValue,
  items,
  currentPath,
}: ResolveNavigationRailActiveValueArgs): string {
  if (currentValue && items.some((item) => item.value === currentValue && !item.disabled)) {
    return currentValue;
  }

  const matchedItem = items.find((item) => !item.disabled && matchesCurrentPath(item, currentPath));
  if (matchedItem) {
    return matchedItem.value;
  }

  return getEnabledValues(items)[0] ?? '';
}

export function createNavigationDestinationItems(
  destinations: NavigationDestinationInput[],
  options: CreateNavigationDestinationItemsOptions = {},
): NavigationRailItem[] {
  const resolvedCurrentValue =
    options.currentValue ?? destinations.find((destination) => destination.current)?.value;

  return destinations.map((destination) => ({
    value: destination.value,
    label: destination.label ?? destination.title ?? destination.value,
    icon: destination.icon,
    description: destination.description,
    badge:
      destination.value === resolvedCurrentValue && options.currentBadge !== undefined
        ? options.currentBadge
        : destination.badge,
    dataTestId: destination.dataTestId,
    href: destination.href,
    disabled: destination.disabled,
    ariaLabel: destination.ariaLabel,
    target: destination.target,
    rel: destination.rel,
    matchPath: destination.matchPath,
  }));
}

export function createNavigationRailPreset(kind: NavigationRailPresetKind): NavigationRailPreset {
  switch (kind) {
    case 'compact_utility':
      return {
        compact: true,
        size: 'sm',
        align: 'start',
        appearance: 'ghost',
        labelVisibility: 'none',
      };
    case 'ops_side_nav':
      return {
        compact: false,
        size: 'md',
        align: 'start',
        appearance: 'outline',
        labelVisibility: 'active',
      };
    case 'workspace':
    default:
      return {
        compact: false,
        size: 'md',
        align: 'start',
        appearance: 'default',
        labelVisibility: 'always',
      };
  }
}

/** Vertical navigation rail with icon-and-label destinations, badge support, and responsive sizing. */
export const NavigationRail = React.forwardRef<HTMLElement, NavigationRailProps>(
  function NavigationRail(
    {
      items,
      value,
      defaultValue,
      onValueChange,
      onItemClick,
      ariaLabel = 'Navigation rail',
      align = 'start',
      compact = false,
      size = 'md',
      appearance = 'default',
      labelVisibility = 'always',
      currentPath,
      footer,
      className,
      classes,
      access = 'full',
      accessReason,
    },
    ref,
  ) {
    const accessState = resolveAccessState(access);
    const isControlled = value !== undefined;
    const followsCurrentPath =
      !isControlled && defaultValue === undefined && currentPath !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(() =>
      resolveNavigationRailActiveValue({
        currentValue: defaultValue,
        items,
        currentPath,
      }),
    );
    const selectedValue = React.useMemo(
      () =>
        followsCurrentPath
          ? resolveNavigationRailActiveValue({
              currentValue: undefined,
              items,
              currentPath,
            })
          : isControlled
            ? resolveNavigationRailActiveValue({
                currentValue: value,
                items,
                currentPath,
              })
            : resolveNavigationRailActiveValue({
                currentValue: internalValue,
                items,
                currentPath,
              }),
      [currentPath, followsCurrentPath, internalValue, isControlled, items, value],
    );
    const enabledValues = React.useMemo(() => getEnabledValues(items), [items]);
    const [focusedValue, setFocusedValue] = React.useState<string>(
      selectedValue || enabledValues[0] || '',
    );
    const itemRefs = React.useRef<Record<string, HTMLElement | null>>({});
    const isReadonly = accessState.isReadonly;
    const isDisabled = accessState.isDisabled;
    const resolvedLabelVisibility: NavigationRailLabelVisibility = compact
      ? 'none'
      : labelVisibility;

    React.useEffect(() => {
      const fallback = selectedValue || enabledValues[0] || '';
      if (!fallback) {
        return;
      }
      if (!focusedValue || !enabledValues.includes(focusedValue)) {
        setFocusedValue(fallback);
      }
    }, [enabledValues, focusedValue, selectedValue]);

    const commitSelection = React.useCallback(
      (nextValue: string) => {
        if (!nextValue) {
          return;
        }
        if (!isControlled && !followsCurrentPath) {
          setInternalValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
      [followsCurrentPath, isControlled, onValueChange],
    );

    const moveFocus = React.useCallback(
      (target: 'prev' | 'next' | 'start' | 'end') => {
        if (enabledValues.length === 0) {
          return;
        }

        const currentIndex = Math.max(
          enabledValues.indexOf(focusedValue || selectedValue || enabledValues[0]),
          0,
        );

        let nextIndex: number;
        if (target === 'start') {
          nextIndex = 0;
        } else if (target === 'end') {
          nextIndex = enabledValues.length - 1;
        } else {
          nextIndex =
            (currentIndex + (target === 'next' ? 1 : -1) + enabledValues.length) %
            enabledValues.length;
        }

        const nextVal = enabledValues[nextIndex];
        setFocusedValue(nextVal);
        itemRefs.current[nextVal]?.focus();
      },
      [enabledValues, focusedValue, selectedValue],
    );

    if (accessState.isHidden) {
      return null;
    }

    const renderItemContent = (
      item: NavigationRailItem,
      selected: boolean,
      showLabel: boolean,
      showDescription: boolean,
    ) => (
      <>
        {item.icon ? (
          <span
            className={cn(
              'navigation-rail-icon inline-flex h-6 w-6 items-center justify-center text-current',
              classes?.icon,
            )}
            data-slot="icon"
            aria-hidden="true"
          >
            {item.icon}
          </span>
        ) : null}
        <span className={cn('navigation-rail-copy min-w-0 flex-1', !showLabel && 'sr-only')}>
          <span
            className={cn('navigation-rail-label block truncate font-medium', classes?.label)}
            data-slot="label"
          >
            {item.label}
          </span>
          {showDescription ? (
            <span
              className={cn(
                'navigation-rail-description mt-0.5 block truncate text-xs text-text-secondary',
                classes?.description,
              )}
              data-slot="description"
            >
              {item.description}
            </span>
          ) : null}
        </span>
        {item.badge !== undefined ? (
          <span
            className={cn(
              'navigation-rail-badge inline-flex min-w-6 items-center justify-center rounded-full border border-border-subtle bg-surface-panel px-2 py-0.5 text-[11px] font-medium text-text-primary',
              'shadow-[0_10px_22px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs',
              compact && 'absolute right-1 top-1',
              classes?.badge,
            )}
            data-slot="badge"
          >
            {item.badge}
          </span>
        ) : null}
      </>
    );

    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          'navigation-rail-root relative inline-flex overflow-hidden rounded-[30px] p-2 before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--border-subtle)_40%,transparent)] before:to-transparent',
          compact ? 'w-20' : 'w-64',
          rootClassByAppearance[appearance],
          classes?.root,
          className,
        )}
        {...stateAttrs({ component: 'navigation-rail', disabled: isDisabled })}
        data-component="navigation-rail"
        data-surface-appearance="premium"
        data-compact={compact ? 'true' : 'false'}
        data-appearance={appearance}
        data-access-state={accessState.state}
        title={accessReason}
      >
        <div className="flex w-full flex-col gap-2">
          <ul
            className={cn(
              'navigation-rail-list flex w-full flex-col gap-2',
              align === 'center' && 'justify-center',
              classes?.list,
            )}
            role="list"
          >
            {items.map((item) => {
              const selected = item.value === selectedValue;
              const blocked = item.disabled || isDisabled || isReadonly;
              const labelText = getItemLabelText(item);
              const itemIsTabStop =
                item.value === focusedValue || (!focusedValue && item.value === selectedValue);
              const showLabel =
                resolvedLabelVisibility === 'always' ||
                (resolvedLabelVisibility === 'active' && selected);
              const showDescription = showLabel && !compact && Boolean(item.description);

              const handleActivate = (event: React.MouseEvent<HTMLElement>) => {
                if (blocked) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                commitSelection(item.value);
                setFocusedValue(item.value);
                onItemClick?.(item.value, event);
              };

              const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus('prev');
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus('next');
                  return;
                }

                if (event.key === 'Home') {
                  event.preventDefault();
                  moveFocus('start');
                  return;
                }

                if (event.key === 'End') {
                  event.preventDefault();
                  moveFocus('end');
                  return;
                }

                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (blocked) {
                    return;
                  }
                  itemRefs.current[item.value]?.click();
                }
              };

              const sharedProps = {
                className: cn(
                  `navigation-rail-item relative flex w-full items-center gap-3 rounded-[20px] border border-transparent text-left transition ${focusRingClass('ring')}`,
                  sizeClassNames[size],
                  compact ? 'justify-center' : 'justify-start',
                  selected
                    ? 'border-border-default/70 bg-[var(--surface-card)] text-text-primary shadow-[0_18px_36px_-28px_var(--shadow-color)] ring-1 ring-border-subtle/20 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[color-mix(in_oklab,var(--border-subtle)_40%,transparent)] before:to-transparent'
                    : 'text-text-secondary hover:-translate-y-px hover:border-border-subtle/70 hover:bg-[var(--surface-hover)] hover:text-text-primary hover:shadow-[0_14px_28px_-24px_var(--shadow-color)]',
                  blocked && 'cursor-not-allowed opacity-50',
                  isReadonly && !item.disabled && !isDisabled && 'cursor-default',
                  classes?.item,
                  selected && classes?.activeItem,
                  item.itemClassName,
                  selected && item.activeClassName,
                ),
                'data-slot': 'item' as const,
                'data-state': selected ? ('active' as const) : ('inactive' as const),
                'aria-current': selected ? ('page' as const) : undefined,
                'aria-disabled': blocked || undefined,
                'aria-label':
                  compact || resolvedLabelVisibility === 'none' ? labelText : item.ariaLabel,
                'data-testid': item.dataTestId,
                tabIndex: itemIsTabStop ? 0 : -1,
                title: compact || resolvedLabelVisibility === 'none' ? labelText : undefined,
                onKeyDown: handleKeyDown,
                onFocus: () => setFocusedValue(item.value),
              };

              return (
                <li key={item.value} className="list-none">
                  {item.href && !blocked ? (
                    <a
                      ref={(node) => {
                        itemRefs.current[item.value] = node;
                      }}
                      href={item.href}
                      target={item.target}
                      rel={item.rel}
                      {...sharedProps}
                      onClick={handleActivate}
                    >
                      {renderItemContent(item, selected, showLabel, showDescription)}
                    </a>
                  ) : (
                    <button
                      ref={(node) => {
                        itemRefs.current[item.value] = node;
                      }}
                      type="button"
                      {...sharedProps}
                      onClick={handleActivate}
                      disabled={Boolean(item.disabled || isDisabled)}
                    >
                      {renderItemContent(item, selected, showLabel, showDescription)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {footer ? (
            <div
              className={cn(
                'navigation-rail-footer mt-2 border-t border-border-subtle pt-2',
                'bg-[var(--surface-card)]',
                classes?.footer,
              )}
              data-slot="footer"
            >
              {footer}
            </div>
          ) : null}
        </div>
      </nav>
    );
  },
);

NavigationRail.displayName = 'NavigationRail';
