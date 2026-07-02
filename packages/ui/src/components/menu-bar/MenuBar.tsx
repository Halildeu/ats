import React from 'react';
import {
  resolveAccessState, _accessStyles,
  shouldBlockInteraction,
  type AccessControlledProps,
} from "../../internal/access-controller";
import {
  MenuSurface,
  findEnabledMenuItemIndex,
  type MenuSurfaceItemBase,
} from "../../internal/MenuSurface";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";

export type MenuBarSize = 'sm' | 'md';
export type MenuBarAppearance = 'default' | 'outline' | 'ghost';
export type MenuBarLabelVisibility = 'always' | 'active' | 'none' | 'responsive';
export type MenuBarOverflowBehavior = 'none' | 'scroll' | 'collapse-to-more';
export type MenuBarSubmenuTrigger = 'click' | 'hover';
export type MenuBarUtilityCollapse = 'preserve' | 'hide';
export type MenuBarMobileFallback = 'none' | 'menu';
export type MenuBarPresetKind = 'workspace_header' | 'ops_command_bar' | 'ghost_utility';
export type MenuBarItemGroup = 'primary' | 'secondary' | 'utility';
export type MenuBarItemEmphasis = 'default' | 'promoted' | 'subtle';

export type MenuBarMenuItem = MenuSurfaceItemBase<MenuBarMenuItem>;

export interface MenuBarItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  overflowPriority?: number;
  pinned?: boolean;
  group?: MenuBarItemGroup;
  emphasis?: MenuBarItemEmphasis;
  keywords?: string[];
  favoritable?: boolean;
  menuSurfaceTitle?: React.ReactNode;
  menuSurfaceDescription?: React.ReactNode;
  menuSurfaceMeta?: React.ReactNode;
  menuSurfaceFooter?: React.ReactNode;
  menuSurfaceClassName?: string;
  dataTestId?: string;
  ariaLabel?: string;
  href?: string;
  matchPath?: string | string[];
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  disabled?: boolean;
  menuItems?: MenuBarMenuItem[];
  itemClassName?: string;
  activeClassName?: string;
}

export interface MenuBarRouteInput {
  value: string;
  label?: React.ReactNode;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  overflowPriority?: number;
  pinned?: boolean;
  group?: MenuBarItemGroup;
  emphasis?: MenuBarItemEmphasis;
  keywords?: string[];
  favoritable?: boolean;
  menuSurfaceTitle?: React.ReactNode;
  menuSurfaceDescription?: React.ReactNode;
  menuSurfaceMeta?: React.ReactNode;
  menuSurfaceFooter?: React.ReactNode;
  menuSurfaceClassName?: string;
  dataTestId?: string;
  ariaLabel?: string;
  href?: string;
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  matchPath?: string | string[];
  current?: boolean;
  disabled?: boolean;
  menuItems?: MenuBarMenuItem[];
}

export interface CreateMenuBarItemsOptions {
  currentValue?: string;
  currentPath?: string;
  currentBadge?: React.ReactNode;
}

export interface MenuBarClasses {
  root?: string;
  list?: string;
  item?: string;
  activeItem?: string;
  trigger?: string;
  icon?: string;
  label?: string;
  badge?: string;
}

export interface ResolveMenuBarActiveValueArgs {
  currentValue?: string;
  items: MenuBarItem[];
  currentPath?: string;
}

export interface MenuBarPreset {
  size: MenuBarSize;
  appearance: MenuBarAppearance;
  labelVisibility: MenuBarLabelVisibility;
}

/** Props for the MenuBar component.
 * @example
 * ```tsx
 * <MenuBar />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/menu-bar)
 */
export interface MenuBarProps extends AccessControlledProps {
  /** Navigation items to render in the bar. */
  items: MenuBarItem[];
  /** Controlled active item value. */
  value?: string;
  /** Initial active item value for uncontrolled mode. */
  defaultValue?: string;
  /** Callback fired when the active item changes. */
  onValueChange?: (value: string) => void;
  /** Callback fired when a bar item is clicked. */
  onItemClick?: (value: string, event: React.MouseEvent<HTMLElement>) => void;
  /** Callback fired when a submenu item is selected. */
  onMenuItemSelect?: (rootValue: string, item: MenuBarMenuItem) => void;
  /** Controlled open submenu value. */
  openValue?: string | null;
  /** Initial open submenu value for uncontrolled mode. */
  defaultOpenValue?: string | null;
  /** Callback fired when the open submenu changes. */
  onOpenValueChange?: (value: string | null) => void;
  /** Accessible label for the navigation bar. */
  ariaLabel?: string;
  /** Accessible label for submenu surfaces. */
  menuAriaLabel?: string;
  /** Size variant of the menu bar. */
  size?: MenuBarSize;
  /** Visual appearance variant. */
  appearance?: MenuBarAppearance;
  labelVisibility?: MenuBarLabelVisibility;
  overflowBehavior?: MenuBarOverflowBehavior;
  overflowLabel?: React.ReactNode;
  maxVisibleItems?: number;
  defaultFavoriteValues?: string[];
  favoriteValues?: string[];
  onFavoriteValuesChange?: (values: string[]) => void;
  showFavoriteToggle?: boolean;
  defaultRecentValues?: string[];
  recentValues?: string[];
  onRecentValuesChange?: (values: string[]) => void;
  recentLimit?: number;
  enableSearchHandoff?: boolean;
  searchPlaceholder?: string;
  searchEmptyStateLabel?: React.ReactNode;
  submenuTrigger?: MenuBarSubmenuTrigger;
  startSlot?: React.ReactNode;
  endSlot?: React.ReactNode;
  currentPath?: string;
  labelCollapseBreakpoint?: string;
  responsiveBreakpoint?: string;
  mobileFallback?: MenuBarMobileFallback;
  utilityCollapse?: MenuBarUtilityCollapse;
  utility?: React.ReactNode;
  className?: string;
  classes?: MenuBarClasses;
}

const sizeClassNames: Record<MenuBarSize, string> = {
  sm: 'min-h-9 gap-2 px-3 py-2 text-xs',
  md: 'min-h-10 gap-2.5 px-4 py-2 text-sm',
};

const rootClassByAppearance: Record<MenuBarAppearance, string> = {
  default:
    'border border-border-subtle/80 bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_20px_46px_-34px_var(--shadow-color)] backdrop-blur-xs',
  outline:
    'border border-border-default/80 bg-[var(--surface-card-alt)] ring-1 ring-border-subtle/20 shadow-[0_16px_36px_-30px_var(--shadow-color)] backdrop-blur-xs',
  ghost:
    'border border-transparent bg-[var(--surface-card)] ring-1 ring-border-subtle/20 shadow-[0_12px_32px_-30px_var(--shadow-color)] backdrop-blur-xs',
};

const defaultAverageItemWidth = 112;
const layoutPadding = 40;
const overflowTriggerReservedWidth = 84;
const defaultResponsiveBreakpoint = '(max-width: 960px)';

interface OverflowMenuBarEntry extends MenuSurfaceItemBase<OverflowMenuBarEntry> {
  kind: 'root-item' | 'submenu-item';
  rootValue: string;
  href?: string;
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  originalMenuItem?: MenuBarMenuItem;
}

interface MenuBarSearchEntry extends MenuSurfaceItemBase<MenuBarSearchEntry> {
  kind: 'root-item' | 'submenu-item' | 'empty-state';
  rootValue?: string;
  submenuKey?: string;
}

function getEnabledItemIndex(items: MenuBarItem[], startIndex: number, direction: 1 | -1) {
  for (let index = startIndex; index >= 0 && index < items.length; index += direction) {
    if (!items[index]?.disabled) {
      return index;
    }
  }
  return -1;
}

function getItemLabelText(item: MenuBarItem): string {
  if (item.ariaLabel) {
    return item.ariaLabel;
  }
  if (typeof item.label === 'string' || typeof item.label === 'number') {
    return String(item.label);
  }
  return item.value;
}

function matchesCurrentPath(item: MenuBarItem, currentPath?: string) {
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

function useCompactMenuBarViewport(query?: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (!query || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(false);
      return undefined;
    }

    const mediaQueryList = window.matchMedia(query);
    const updateMatch = (event?: MediaQueryListEvent) => {
      setMatches(event?.matches ?? mediaQueryList.matches);
    };

    updateMatch();

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', updateMatch);
      return () => mediaQueryList.removeEventListener('change', updateMatch);
    }

    mediaQueryList.addListener(updateMatch);
    return () => mediaQueryList.removeListener(updateMatch);
  }, [query]);

  return matches;
}

function buildOverflowMenuEntries(
  items: MenuBarItem[],
): OverflowMenuBarEntry[] {
  const buildSubmenuEntries = (
    submenuItems: MenuBarMenuItem[],
    rootValue: string,
  ): OverflowMenuBarEntry[] =>
    submenuItems.map((submenuItem) => ({
      key: `${rootValue}:${submenuItem.key}`,
      kind: 'submenu-item',
      rootValue,
      label: submenuItem.label,
      groupLabel: submenuItem.groupLabel,
      description: submenuItem.description,
      shortcut: submenuItem.shortcut,
      disabled: submenuItem.disabled,
      danger: submenuItem.danger,
      type: submenuItem.type,
      checked: submenuItem.checked,
      icon: submenuItem.icon,
      badge: submenuItem.badge,
      originalMenuItem: submenuItem,
      children: submenuItem.children
        ? buildSubmenuEntries(submenuItem.children, rootValue)
        : undefined,
    }));

  return items.map((item) => ({
    key: `overflow:${item.value}`,
    kind: 'root-item',
    rootValue: item.value,
    label: item.label,
    icon: item.icon,
    badge: item.badge,
    disabled: item.disabled,
    href: item.href,
    target: item.target,
    rel: item.rel,
    children: item.menuItems ? buildSubmenuEntries(item.menuItems, item.value) : undefined,
  }));
}

function getReactNodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getReactNodeText).join(' ');
  }
  if (React.isValidElement(node)) {
    return getReactNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

function buildSearchEntries(
  items: MenuBarItem[],
  searchQuery: string,
  favoriteValues: string[],
  recentValues: string[],
  emptyLabel: React.ReactNode,
): MenuBarSearchEntry[] {
  const favoriteSet = new Set(favoriteValues);
  const itemByValue = new Map(items.map((item) => [item.value, item] as const));
  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!normalizedQuery) {
    const recentEntries = recentValues
      .map((value) => itemByValue.get(value))
      .filter((item): item is MenuBarItem => Boolean(item))
      .map((item) => ({
        key: `recent:${item.value}`,
        kind: 'root-item' as const,
        rootValue: item.value,
        label: item.label,
        description: item.menuSurfaceDescription ?? item.href ?? undefined,
        icon: item.icon,
        badge: favoriteSet.has(item.value) ? 'Fav' : undefined,
        groupLabel: 'Recent',
      }));

    const favoriteEntries = favoriteValues
      .map((value) => itemByValue.get(value))
      .filter((item): item is MenuBarItem => Boolean(item))
      .map((item) => ({
        key: `favorite:${item.value}`,
        kind: 'root-item' as const,
        rootValue: item.value,
        label: item.label,
        description: item.menuSurfaceDescription ?? item.href ?? undefined,
        icon: item.icon,
        badge: 'Favorite',
        groupLabel: 'Favorites',
      }));

    return [...recentEntries, ...favoriteEntries];
  }

  const rootEntries = items
    .filter((item) => {
      const haystack = [
        getReactNodeText(item.label),
        item.value,
        ...(item.keywords ?? []),
        getReactNodeText(item.menuSurfaceTitle),
        getReactNodeText(item.menuSurfaceDescription),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .map((item) => ({
      key: `root:${item.value}`,
      kind: 'root-item' as const,
      rootValue: item.value,
      label: item.label,
      description: item.menuSurfaceDescription ?? item.href ?? undefined,
      icon: item.icon,
      badge: favoriteSet.has(item.value) ? 'Favorite' : undefined,
      groupLabel: 'Roots',
    }));

  const submenuEntries = items.flatMap((item) =>
    (item.menuItems ?? [])
      .filter((menuItem) => {
        const haystack = [
          getReactNodeText(menuItem.label),
          menuItem.key,
          getReactNodeText(menuItem.description),
          getReactNodeText(item.label),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .map((menuItem) => ({
        key: `submenu:${item.value}:${menuItem.key}`,
        kind: 'submenu-item' as const,
        rootValue: item.value,
        submenuKey: menuItem.key,
        label: menuItem.label,
        description: getReactNodeText(item.label) || item.value,
        icon: menuItem.icon ?? item.icon,
        badge: menuItem.badge,
        groupLabel: 'Commands',
      })),
  );

  const results = [...rootEntries, ...submenuEntries].slice(0, 10);
  if (results.length > 0) {
    return results;
  }

  return [
    {
      key: 'search-empty',
      kind: 'empty-state',
      label: emptyLabel,
      disabled: true,
      description: typeof searchQuery === 'string' && searchQuery ? `"${searchQuery}"` : undefined,
    },
  ];
}

function programmaticNavigate(
  href: string,
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'],
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>['rel'],
) {
  if (typeof document === 'undefined') {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = href;
  if (target) {
    anchor.target = target;
  }
  if (rel) {
    anchor.rel = rel;
  }
  anchor.style.position = 'absolute';
  anchor.style.left = '-9999px';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function resolveMenuBarActiveValue({
  currentValue,
  items,
  currentPath,
}: ResolveMenuBarActiveValueArgs) {
  if (currentValue && items.some((item) => item.value === currentValue && !item.disabled)) {
    return currentValue;
  }
  const matchedItem = items.find((item) => !item.disabled && matchesCurrentPath(item, currentPath));
  if (matchedItem) {
    return matchedItem.value;
  }
  return items.find((item) => !item.disabled)?.value ?? '';
}

export function createMenuBarItemsFromRoutes(
  routes: MenuBarRouteInput[],
  options: CreateMenuBarItemsOptions = {},
): MenuBarItem[] {
  const resolvedCurrentValue =
    options.currentValue
    ?? routes.find((route) => route.current)?.value
    ?? resolveMenuBarActiveValue({
      currentValue: undefined,
      items: routes as MenuBarItem[],
      currentPath: options.currentPath,
    });

  return routes.map((route) => ({
    value: route.value,
    label: route.label ?? route.title ?? route.value,
    icon: route.icon,
    overflowPriority: route.overflowPriority,
    pinned: route.pinned,
    group: route.group,
    emphasis: route.emphasis,
    keywords: route.keywords,
    favoritable: route.favoritable,
    menuSurfaceTitle: route.menuSurfaceTitle,
    menuSurfaceDescription: route.menuSurfaceDescription,
    menuSurfaceMeta: route.menuSurfaceMeta,
    menuSurfaceFooter: route.menuSurfaceFooter,
    menuSurfaceClassName: route.menuSurfaceClassName,
    badge:
      route.value === resolvedCurrentValue && options.currentBadge !== undefined
        ? options.currentBadge
        : route.badge,
    dataTestId: route.dataTestId,
    ariaLabel: route.ariaLabel,
    href: route.href,
    target: route.target,
    rel: route.rel,
    matchPath: route.matchPath,
    disabled: route.disabled,
    menuItems: route.menuItems,
  }));
}

export function createMenuBarPreset(kind: MenuBarPresetKind): MenuBarPreset {
  switch (kind) {
    case 'ops_command_bar':
      return {
        size: 'sm',
        appearance: 'outline',
        labelVisibility: 'active',
      };
    case 'ghost_utility':
      return {
        size: 'sm',
        appearance: 'ghost',
        labelVisibility: 'none',
      };
    case 'workspace_header':
    default:
      return {
        size: 'md',
        appearance: 'default',
        labelVisibility: 'always',
      };
  }
}

/** Horizontal menu bar with dropdown sub-menus, overflow handling, and route-aware active states. */
export const MenuBar = React.forwardRef<HTMLElement, MenuBarProps>(function MenuBar(
  {
    items,
    value,
    defaultValue,
    onValueChange,
    onItemClick,
    onMenuItemSelect,
    openValue,
    defaultOpenValue = null,
    onOpenValueChange,
    ariaLabel = 'Application menu',
    menuAriaLabel = 'Menu bar submenu',
    size = 'md',
    appearance = 'default',
    labelVisibility = 'always',
    overflowBehavior = 'none',
    overflowLabel,
    maxVisibleItems,
    defaultFavoriteValues = [],
    favoriteValues,
    onFavoriteValuesChange,
    showFavoriteToggle = false,
    defaultRecentValues = [],
    recentValues,
    onRecentValuesChange,
    recentLimit = 5,
    enableSearchHandoff = false,
    searchPlaceholder = 'Search menu',
    searchEmptyStateLabel = 'No matching routes or actions.',
    submenuTrigger = 'click',
    startSlot,
    endSlot,
    currentPath,
    labelCollapseBreakpoint,
    responsiveBreakpoint,
    mobileFallback = 'none',
    utilityCollapse = 'preserve',
    utility,
    className,
    classes,
    access = 'full',
    accessReason,
  },
  ref,
) {
  const accessState = resolveAccessState(access);
  const isControlled = value !== undefined;
  const isOpenControlled = openValue !== undefined;
  const favoritesControlled = favoriteValues !== undefined;
  const recentControlled = recentValues !== undefined;
  const followsCurrentPath = !isControlled && defaultValue === undefined && currentPath !== undefined;
  const resolvedResponsiveBreakpoint =
    responsiveBreakpoint
    ?? (mobileFallback !== 'none' || utilityCollapse === 'hide' ? defaultResponsiveBreakpoint : undefined);
  const resolvedLabelCollapseBreakpoint =
    labelCollapseBreakpoint ?? (labelVisibility === 'responsive' ? '(max-width: 1200px)' : undefined);
  const compactViewport = useCompactMenuBarViewport(resolvedResponsiveBreakpoint);
  const compactLabelViewport = useCompactMenuBarViewport(resolvedLabelCollapseBreakpoint);
  const resolvedEndSlot = endSlot ?? utility;
  const [internalValue, setInternalValue] = React.useState(() =>
    resolveMenuBarActiveValue({
      currentValue: defaultValue,
      items,
      currentPath,
    }),
  );
  const [internalOpenValue, setInternalOpenValue] = React.useState<string | null>(defaultOpenValue);
  const [internalFavoriteValues, setInternalFavoriteValues] = React.useState<string[]>(defaultFavoriteValues);
  const [internalRecentValues, setInternalRecentValues] = React.useState<string[]>(defaultRecentValues);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [visibleItems, setVisibleItems] = React.useState<MenuBarItem[]>(items);
  const [overflowItems, setOverflowItems] = React.useState<MenuBarItem[]>([]);
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState(() => getEnabledItemIndex(items, 0, 1));
  const [preferredFocusIndex, setPreferredFocusIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const itemWidthsRef = React.useRef<Record<string, number>>({});
  const activeAnchorRef = React.useRef<HTMLElement | null>(null);
  const startSlotRef = React.useRef<HTMLDivElement | null>(null);
  const endSlotRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const overflowTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuId = React.useId();
  const overflowMenuId = React.useId();
  const searchMenuId = React.useId();

  React.useImperativeHandle(ref, () => rootRef.current!);

  const selectedValue = React.useMemo(
    () => resolveMenuBarActiveValue({
      currentValue: followsCurrentPath ? undefined : (isControlled ? value : internalValue),
      items,
      currentPath,
    }),
    [currentPath, followsCurrentPath, internalValue, isControlled, items, value],
  );
  const shouldForceMenuFallback = compactViewport && mobileFallback === 'menu';
  const shouldHideEndSlot = compactViewport && utilityCollapse === 'hide';
  const renderedEndSlot = shouldHideEndSlot ? null : resolvedEndSlot;
  const shouldCollapseToOverflow = overflowBehavior === 'collapse-to-more' || shouldForceMenuFallback;
  const resolvedOpenValue = isOpenControlled ? openValue ?? null : internalOpenValue;
  const displayedItems = shouldCollapseToOverflow ? visibleItems : items;
  const openItemIndex = displayedItems.findIndex((item) => item.value === resolvedOpenValue);
  const openItem = openItemIndex >= 0 ? displayedItems[openItemIndex] : null;
  const overflowHasActive = overflowItems.some((item) => item.value === selectedValue);
  const pinnedCount = items.filter((item) => item.pinned).length;
  const resolvedFavoriteValues = favoritesControlled ? favoriteValues ?? [] : internalFavoriteValues;
  const resolvedRecentValues = recentControlled ? recentValues ?? [] : internalRecentValues;
  const overflowMenuItems = React.useMemo(() => buildOverflowMenuEntries(overflowItems), [overflowItems]);
  const searchEntries = React.useMemo(
    () =>
      buildSearchEntries(
        items,
        searchQuery,
        resolvedFavoriteValues,
        resolvedRecentValues,
        searchEmptyStateLabel,
      ),
    [items, resolvedFavoriteValues, resolvedRecentValues, searchEmptyStateLabel, searchQuery],
  );
  const resolvedOverflowLabel =
    overflowLabel ?? (compactViewport && mobileFallback === 'menu' ? 'Menu' : 'More');

  React.useLayoutEffect(() => {
    activeAnchorRef.current = openItemIndex >= 0 ? itemRefs.current[openItemIndex] : null;
  }, [displayedItems, openItemIndex]);

  const measureLayout = React.useCallback(() => {
    if (!shouldCollapseToOverflow) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    if (shouldForceMenuFallback) {
      setVisibleItems([]);
      setOverflowItems(items);
      return;
    }

    const rootWidth =
      rootRef.current?.getBoundingClientRect().width
      || rootRef.current?.clientWidth
      || 0;
    if (!rootWidth) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    const startWidth =
      startSlotRef.current?.getBoundingClientRect().width
      || startSlotRef.current?.clientWidth
      || 0;
    const endWidth =
      endSlotRef.current?.getBoundingClientRect().width
      || endSlotRef.current?.clientWidth
      || 0;
    const overflowTriggerWidth =
      overflowTriggerRef.current?.getBoundingClientRect().width
      || overflowTriggerRef.current?.clientWidth
      || overflowTriggerReservedWidth;
    const totalItemWidth = items.reduce(
      (sum, item) => sum + (itemWidthsRef.current[item.value] ?? defaultAverageItemWidth),
      0,
    );
    const availableWidth = Math.max(0, rootWidth - startWidth - endWidth - layoutPadding);
    const resolvedMaxVisibleItems =
      typeof maxVisibleItems === 'number'
        ? Math.max(1, Math.min(items.length, Math.floor(maxVisibleItems)))
        : items.length;
    const widthConstrained = totalItemWidth > availableWidth;
    const countConstrained = resolvedMaxVisibleItems < items.length;

    if (!widthConstrained && !countConstrained) {
      setVisibleItems(items);
      setOverflowItems([]);
      return;
    }

    const availableWidthWithOverflow = Math.max(0, availableWidth - overflowTriggerWidth);
    const rankedItems = items
      .map((item, index) => ({
        item,
        index,
        priority:
          (item.overflowPriority ?? 0)
          + (item.pinned ? 1000 : 0)
          + (resolvedFavoriteValues.includes(item.value) ? 250 : 0),
      }))
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }
        return left.index - right.index;
      });
    const nextVisibleValues: string[] = [];
    let usedWidth = 0;

    rankedItems.forEach(({ item }) => {
      if (nextVisibleValues.length >= resolvedMaxVisibleItems) {
        return;
      }

      const itemWidth = itemWidthsRef.current[item.value] ?? defaultAverageItemWidth;
      const fitsWidth = usedWidth + itemWidth <= availableWidthWithOverflow;
      if (nextVisibleValues.length === 0 || !widthConstrained || fitsWidth) {
        nextVisibleValues.push(item.value);
        if (widthConstrained) {
          usedWidth += itemWidth;
        }
      }
    });

    const activeItem = items.find((item) => item.value === selectedValue);
    if (activeItem && !nextVisibleValues.includes(activeItem.value)) {
      if (nextVisibleValues.length === 0) {
        nextVisibleValues.push(activeItem.value);
      } else {
        const replacementIndex = nextVisibleValues.reduce((lowestIndex, currentValue, index) => {
          const lowestPriority = items.find((item) => item.value === nextVisibleValues[lowestIndex])?.overflowPriority ?? 0;
          const currentPriority = items.find((item) => item.value === currentValue)?.overflowPriority ?? 0;
          return currentPriority < lowestPriority ? index : lowestIndex;
        }, 0);
        nextVisibleValues[replacementIndex] = activeItem.value;
      }
    }

    const visibleValueSet = new Set(nextVisibleValues);
    const nextVisibleItems = items.filter((item) => visibleValueSet.has(item.value));
    const nextOverflowItems = items.filter((item) => !visibleValueSet.has(item.value));

    setVisibleItems(nextVisibleItems);
    setOverflowItems(nextOverflowItems);
  }, [items, maxVisibleItems, renderedEndSlot, resolvedFavoriteValues, selectedValue, shouldCollapseToOverflow, shouldForceMenuFallback, startSlot]);

  React.useEffect(() => {
    if (accessState.isHidden) {
      return;
    }
    if (!items.some((item) => item.value === selectedValue && !item.disabled)) {
      const nextValue = resolveMenuBarActiveValue({
        currentValue: defaultValue,
        items,
        currentPath,
      });
      if (!isControlled) {
        setInternalValue(nextValue);
      }
      if (!isControlled && nextValue) {
        onValueChange?.(nextValue);
      }
    }
  }, [accessState.isHidden, currentPath, defaultValue, isControlled, items, onValueChange, selectedValue]);

  React.useEffect(() => {
    if (focusedIndex >= 0 && !displayedItems[focusedIndex]?.disabled) {
      return;
    }
    setFocusedIndex(getEnabledItemIndex(displayedItems, 0, 1));
  }, [displayedItems, focusedIndex]);

  React.useEffect(() => {
    if (!resolvedOpenValue) {
      return;
    }
    const matchedItem = displayedItems.find((item) => item.value === resolvedOpenValue);
    if (!matchedItem?.menuItems?.length) {
      if (!isOpenControlled) {
        setInternalOpenValue(null);
      }
      onOpenValueChange?.(null);
    }
  }, [displayedItems, isOpenControlled, onOpenValueChange, resolvedOpenValue]);

  React.useEffect(() => {
    measureLayout();
    if (typeof window === 'undefined') {
      return undefined;
    }

    const frame = window.requestAnimationFrame(measureLayout);
    const handleResize = () => measureLayout();
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureLayout());
      if (rootRef.current) {
        resizeObserver.observe(rootRef.current);
      }
      if (startSlotRef.current) {
        resizeObserver.observe(startSlotRef.current);
      }
      if (endSlotRef.current) {
        resizeObserver.observe(endSlotRef.current);
      }
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [measureLayout]);

  React.useEffect(() => {
    if (overflowItems.length === 0) {
      setOverflowOpen(false);
    }
  }, [overflowItems.length]);

  React.useEffect(() => {
    setOverflowOpen(false);
  }, [currentPath, selectedValue]);

  const setSelected = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  const setOpenMenuValue = (nextValue: string | null) => {
    if (!isOpenControlled) {
      setInternalOpenValue(nextValue);
    }
    onOpenValueChange?.(nextValue);
  };

  const setFavoriteValuesState = React.useCallback(
    (nextValues: string[]) => {
      if (!favoritesControlled) {
        setInternalFavoriteValues(nextValues);
      }
      onFavoriteValuesChange?.(nextValues);
    },
    [favoritesControlled, onFavoriteValuesChange],
  );

  const setRecentValuesState = React.useCallback(
    (nextValues: string[]) => {
      if (!recentControlled) {
        setInternalRecentValues(nextValues);
      }
      onRecentValuesChange?.(nextValues);
    },
    [onRecentValuesChange, recentControlled],
  );

  const rememberRoot = React.useCallback(
    (rootValue: string) => {
      const nextValues = [rootValue, ...resolvedRecentValues.filter((value) => value !== rootValue)].slice(0, recentLimit);
      setRecentValuesState(nextValues);
    },
    [recentLimit, resolvedRecentValues, setRecentValuesState],
  );

  const toggleFavorite = React.useCallback(
    (rootValue: string) => {
      const isFavorite = resolvedFavoriteValues.includes(rootValue);
      const nextValues = isFavorite
        ? resolvedFavoriteValues.filter((value) => value !== rootValue)
        : [...resolvedFavoriteValues, rootValue];
      setFavoriteValuesState(nextValues);
    },
    [resolvedFavoriteValues, setFavoriteValuesState],
  );

  const closeMenu = (restoreFocus = false) => {
    setPreferredFocusIndex(-1);
    setOpenMenuValue(null);
    if (restoreFocus && openItemIndex >= 0) {
      itemRefs.current[openItemIndex]?.focus();
    }
  };

  const focusItemAtIndex = (index: number) => {
    if (index < 0) {
      return;
    }
    setFocusedIndex(index);
    itemRefs.current[index]?.focus();
  };

  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const nextIndex = getEnabledItemIndex(displayedItems, currentIndex + direction, direction);
    if (nextIndex >= 0) {
      closeMenu(false);
      focusItemAtIndex(nextIndex);
    }
  };

  const openSubmenu = (index: number, startIndex: number) => {
    const item = displayedItems[index];
    if (!item?.menuItems?.length) {
      return;
    }
    setSelected(item.value);
    setFocusedIndex(index);
    setPreferredFocusIndex(startIndex);
    setOpenMenuValue(item.value);
  };

  const activateItem = (item: MenuBarItem, index: number, event: React.MouseEvent<HTMLElement>) => {
    const isBlocked = shouldBlockInteraction(accessState.state, item.disabled);
    if (isBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onItemClick?.(item.value, event);
    setFocusedIndex(index);
    rememberRoot(item.value);

    if (item.menuItems?.length) {
      openSubmenu(index, findEnabledMenuItemIndex(item.menuItems, 0, 1));
      event.preventDefault();
      return;
    }

    setSelected(item.value);
    closeMenu(false);
  };

  const handleItemKeyDown = (item: MenuBarItem, index: number, event: React.KeyboardEvent<HTMLElement>) => {
    const isBlocked = shouldBlockInteraction(accessState.state, item.disabled);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(index, 1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(index, -1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      closeMenu(false);
      focusItemAtIndex(getEnabledItemIndex(displayedItems, 0, 1));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      closeMenu(false);
      focusItemAtIndex(getEnabledItemIndex(displayedItems, displayedItems.length - 1, -1));
      return;
    }
    if (isBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (item.menuItems?.length && event.key === 'ArrowDown') {
      event.preventDefault();
      openSubmenu(index, findEnabledMenuItemIndex(item.menuItems, 0, 1));
      return;
    }
    if (item.menuItems?.length && event.key === 'ArrowUp') {
      event.preventDefault();
      openSubmenu(index, findEnabledMenuItemIndex(item.menuItems, item.menuItems.length - 1, -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (item.menuItems?.length) {
        openSubmenu(index, findEnabledMenuItemIndex(item.menuItems, 0, 1));
        return;
      }
      itemRefs.current[index]?.click();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleOverflowSelect = React.useCallback(
    (item: OverflowMenuBarEntry, event?: React.MouseEvent<HTMLButtonElement>) => {
      setOverflowOpen(false);
      setSelected(item.rootValue);
      rememberRoot(item.rootValue);

      if (item.kind === 'submenu-item' && item.originalMenuItem) {
        onMenuItemSelect?.(item.rootValue, item.originalMenuItem);
        return;
      }

      if (event) {
        onItemClick?.(item.rootValue, event);
        if (event.isDefaultPrevented()) {
          return;
        }
      }

      if (item.href) {
        programmaticNavigate(item.href, item.target, item.rel);
      }
    },
    [onItemClick, onMenuItemSelect, rememberRoot],
  );

  const handleSearchSelect = React.useCallback(
    (entry: MenuBarSearchEntry) => {
      setSearchOpen(false);
      setSearchQuery('');

      if (!entry.rootValue) {
        return;
      }

      const rootItem = items.find((item) => item.value === entry.rootValue);
      if (!rootItem) {
        return;
      }

      setSelected(rootItem.value);
      rememberRoot(rootItem.value);

      if (entry.kind === 'submenu-item' && entry.submenuKey && rootItem.menuItems?.length) {
        const submenuIndex = rootItem.menuItems.findIndex((item) => item.key === entry.submenuKey);
        if (submenuIndex >= 0) {
          onMenuItemSelect?.(rootItem.value, rootItem.menuItems[submenuIndex]);
          const displayedIndex = displayedItems.findIndex((item) => item.value === rootItem.value);
          if (displayedIndex >= 0) {
            openSubmenu(displayedIndex, submenuIndex);
          }
        }
        return;
      }

      if (rootItem.menuItems?.length) {
        const displayedIndex = displayedItems.findIndex((item) => item.value === rootItem.value);
        if (displayedIndex >= 0) {
          openSubmenu(displayedIndex, findEnabledMenuItemIndex(rootItem.menuItems, 0, 1));
        }
        return;
      }

      if (rootItem.href) {
        programmaticNavigate(rootItem.href, rootItem.target, rootItem.rel);
      }
    },
    [displayedItems, items, onMenuItemSelect, rememberRoot],
  );

  React.useEffect(() => {
    if (!enableSearchHandoff) {
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, [enableSearchHandoff]);

  React.useEffect(() => {
    if (!searchQuery) {
      return;
    }
    setSearchOpen(true);
  }, [searchQuery]);

  React.useEffect(() => {
    setSearchOpen(false);
  }, [selectedValue, currentPath]);

  if (accessState.isHidden) {
    return null;
  }

  const resolvedLabelVisibility: Exclude<MenuBarLabelVisibility, 'responsive'> =
    labelVisibility === 'responsive'
      ? compactLabelViewport
        ? 'none'
        : 'always'
      : labelVisibility;

  return (
    <nav
      ref={rootRef}
      aria-label={ariaLabel}
      {...stateAttrs({ component: "menu-bar", disabled: accessState.isDisabled })}
      data-access-state={accessState.state}
      data-appearance={appearance}
      data-overflow-behavior={overflowBehavior}
      data-overflow-count={overflowItems.length}
      data-pinned-count={pinnedCount || undefined}
      data-favorite-count={resolvedFavoriteValues.length || undefined}
      data-recent-count={resolvedRecentValues.length || undefined}
      data-responsive={resolvedResponsiveBreakpoint ? 'true' : undefined}
      data-compact-viewport={compactViewport ? 'true' : undefined}
      data-compact-labels={compactLabelViewport ? 'true' : undefined}
      data-label-visibility={resolvedLabelVisibility}
      data-mobile-fallback={mobileFallback}
      data-max-visible-items={maxVisibleItems ?? undefined}
      data-surface-appearance="premium"
      className={cn('w-full', className, classes?.root)}
    >
      <div
        className={cn(
          'relative flex min-h-12 w-full items-center gap-3 rounded-[28px] px-2 py-2 before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent',
          overflowBehavior === 'scroll' ? 'overflow-visible' : 'overflow-hidden',
          rootClassByAppearance[appearance],
        )}
      >
        {startSlot ? (
          <div
            ref={startSlotRef}
            className="shrink-0"
            data-slot="start"
          >
            {startSlot}
          </div>
        ) : null}
        {enableSearchHandoff ? (
          <div className="shrink-0" data-slot="search">
            <label className="relative block">
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                placeholder={searchPlaceholder}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-[200px] rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-3 py-2 text-xs text-text-primary shadow-[0_12px_28px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs outline-hidden transition focus:border-border-default"
              />
            </label>
          </div>
        ) : null}
        <div
          role="menubar"
          aria-label={ariaLabel}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1',
            overflowBehavior === 'scroll' && 'overflow-x-auto pb-1 -mb-1 pe-1',
            classes?.list,
          )}
        >
        {displayedItems.map((item, index) => {
          const isActive = item.value === selectedValue;
          const isOpen = item.value === resolvedOpenValue;
          const hasMenu = Boolean(item.menuItems?.length);
          const isBlocked = shouldBlockInteraction(accessState.state, item.disabled);
          const isPinned = Boolean(item.pinned);
          const showFavoriteControl = showFavoriteToggle && item.favoritable !== false;
          const isFavorite = resolvedFavoriteValues.includes(item.value);
          const itemGroup = item.group ?? 'primary';
          const previousItemGroup = index > 0 ? displayedItems[index - 1]?.group ?? 'primary' : itemGroup;
          const showSegmentDivider = index > 0 && itemGroup !== previousItemGroup;
          const itemEmphasis = item.emphasis ?? 'default';
          const showLabel = resolvedLabelVisibility === 'always'
            || (resolvedLabelVisibility === 'active' && isActive)
            || (!item.icon && resolvedLabelVisibility === 'none');
          const commonClassName = cn(
            `group relative inline-flex min-h-10 items-center gap-2 rounded-2xl border border-transparent font-medium transition duration-(--motion-duration-medium) ${focusRingClass("ring")}`,
            sizeClassNames[size],
            isActive
              ? 'border-border-default/70 bg-[var(--surface-card)] text-accent-primary shadow-[0_16px_34px_-26px_var(--shadow-color)] ring-1 ring-border-subtle/20 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-[var(--surface-card)] before:to-transparent'
              : itemEmphasis === 'promoted'
                ? 'border-selection-outline/70 bg-[var(--surface-card-alt)] text-text-primary shadow-[0_14px_30px_-24px_var(--shadow-color)] hover:-translate-y-px hover:border-action-primary/80 hover:bg-[var(--surface-card)] hover:shadow-[0_18px_34px_-24px_var(--shadow-color)]'
                : itemEmphasis === 'subtle'
                  ? 'bg-transparent text-text-subtle hover:-translate-y-px hover:border-border-subtle/60 hover:bg-[var(--surface-card)] hover:text-text-primary hover:shadow-[0_12px_26px_-24px_var(--shadow-color)]'
                  : 'bg-transparent text-text-secondary hover:-translate-y-px hover:border-border-subtle/70 hover:bg-[var(--surface-card)] hover:text-text-primary hover:shadow-[0_12px_26px_-24px_var(--shadow-color)]',
            showFavoriteControl && 'pe-10',
            isBlocked && 'cursor-not-allowed opacity-60',
            item.itemClassName,
            classes?.item,
            isActive && classes?.activeItem,
            isActive && item.activeClassName,
          );
          const triggerProps = {
            ref: (node: HTMLElement | null) => {
              itemRefs.current[index] = node;
              if (node) {
                const measuredWidth =
                  node.getBoundingClientRect().width
                  || node.clientWidth
                  || defaultAverageItemWidth;
                itemWidthsRef.current[item.value] = measuredWidth;
              }
            },
            role: 'menuitem' as const,
            tabIndex: index === focusedIndex ? 0 : -1,
            onFocus: () => setFocusedIndex(index),
            onMouseEnter: () => {
              if (shouldBlockInteraction(accessState.state, item.disabled)) {
                return;
              }
              if (submenuTrigger === 'hover' && hasMenu) {
                openSubmenu(index, findEnabledMenuItemIndex(item.menuItems ?? [], 0, 1));
                return;
              }
              if (resolvedOpenValue && hasMenu) {
                openSubmenu(index, findEnabledMenuItemIndex(item.menuItems ?? [], 0, 1));
              }
            },
            onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => handleItemKeyDown(item, index, event),
            className: cn(commonClassName, classes?.trigger),
            'aria-haspopup': hasMenu ? ('menu' as const) : undefined,
            'aria-expanded': hasMenu ? isOpen : undefined,
            'aria-controls': hasMenu && isOpen ? menuId : undefined,
            'aria-disabled': isBlocked || undefined,
            'aria-current': !hasMenu && isActive && item.href ? ('page' as const) : undefined,
            'data-testid': item.dataTestId,
            'data-active': isActive ? 'true' : undefined,
            title: accessReason ?? getItemLabelText(item),
          };
          const favoriteToggle = showFavoriteControl ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
              data-slot="favorite-toggle"
              data-favorite-active={isFavorite ? 'true' : undefined}
              className={cn(
                'absolute right-2 top-1/2 z-[1] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle/70 bg-[var(--surface-card)] text-[10px] font-semibold text-text-secondary shadow-[0_10px_20px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs transition hover:border-border-default hover:text-text-primary',
                isFavorite && 'border-state-warning-text/30 bg-state-warning-bg text-state-warning-text',
              )}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavorite(item.value);
              }}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.9l1.9 3.85 4.25.62-3.08 3 .73 4.23L8 11.58 4.2 13.6l.73-4.23-3.08-3 4.25-.62L8 1.9z" />
              </svg>
            </button>
          ) : null;

          return (
            <React.Fragment key={item.value}>
              {showSegmentDivider ? (
                <span
                  role="separator"
                  aria-orientation="vertical"
                  data-slot="segment-divider"
                  className="mx-1 inline-flex h-8 w-px shrink-0 bg-linear-to-b from-transparent via-border-default/70 to-transparent"
                />
              ) : null}
              <span className="relative inline-flex min-w-0">
                {item.href && !hasMenu ? (
                  <a
                    {...triggerProps}
                    href={item.href}
                    target={item.target}
                    rel={item.rel}
                    data-group={itemGroup}
                    data-emphasis={itemEmphasis}
                    onClick={(event) => activateItem(item, index, event)}
                  >
                    {isPinned ? (
                      <span
                        className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary shadow-[0_0_0_3px_var(--accent-primary-muted)]"
                        data-slot="pinned-indicator"
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.icon ? <span className={cn('inline-flex items-center', classes?.icon)} aria-hidden="true">{item.icon}</span> : null}
                    {showLabel ? (
                      <span data-slot="label" className={cn('inline-flex items-center', classes?.label)}>{item.label}</span>
                    ) : (
                      <span data-slot="label-fallback" className="sr-only">{item.label}</span>
                    )}
                    {item.badge ? <span className={cn('inline-flex rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2 py-0.5 text-[11px] shadow-[0_10px_20px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs', classes?.badge)}>{item.badge}</span> : null}
                  </a>
                ) : (
                  <button
                    {...triggerProps}
                    type="button"
                    disabled={accessState.isDisabled || item.disabled}
                    data-group={itemGroup}
                    data-emphasis={itemEmphasis}
                    onClick={(event) => activateItem(item, index, event)}
                  >
                    {isPinned ? (
                      <span
                        className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent-primary shadow-[0_0_0_3px_var(--accent-primary-muted)]"
                        data-slot="pinned-indicator"
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.icon ? <span className={cn('inline-flex items-center', classes?.icon)} aria-hidden="true">{item.icon}</span> : null}
                    {showLabel ? (
                      <span data-slot="label" className={cn('inline-flex items-center', classes?.label)}>{item.label}</span>
                    ) : (
                      <span data-slot="label-fallback" className="sr-only">{item.label}</span>
                    )}
                    {item.badge ? <span className={cn('inline-flex rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2 py-0.5 text-[11px] shadow-[0_10px_20px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs', classes?.badge)}>{item.badge}</span> : null}
                  </button>
                )}
                {favoriteToggle}
              </span>
            </React.Fragment>
          );
        })}
        </div>
        {overflowItems.length > 0 ? (
          <button
            ref={overflowTriggerRef}
            type="button"
            className={cn(
              'shrink-0 rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-[0_12px_28px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs transition hover:border-border-default hover:bg-surface-panel hover:text-text-primary',
              (overflowOpen || overflowHasActive) && 'border-border-default/80 bg-surface-panel text-text-primary',
            )}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            aria-controls={overflowOpen ? overflowMenuId : undefined}
            data-slot="overflow-trigger"
            data-testid="menu-bar-overflow-trigger"
            onClick={() => setOverflowOpen((current) => !current)}
          >
            {resolvedOverflowLabel}
          </button>
        ) : null}
        {renderedEndSlot ? (
          <div
            ref={endSlotRef}
            className="shrink-0 rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2 py-1 shadow-[0_12px_28px_-24px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs"
            data-slot="utility"
          >
            {renderedEndSlot}
          </div>
        ) : null}
      </div>

      <MenuSurface
        open={Boolean(openItem?.menuItems?.length)}
        ownerRef={rootRef}
        anchorRef={activeAnchorRef}
        menuId={menuId}
        items={openItem?.menuItems ?? []}
        ariaLabel={openItem ? `${getItemLabelText(openItem)} ${menuAriaLabel}` : menuAriaLabel}
        title={openItem?.menuSurfaceTitle}
        headerContent={
          openItem?.menuSurfaceDescription || openItem?.menuSurfaceMeta ? (
            <div className="flex flex-col gap-3">
              {openItem.menuSurfaceDescription ? (
                <div className="text-xs leading-6 text-text-secondary">{openItem.menuSurfaceDescription}</div>
              ) : null}
              {openItem.menuSurfaceMeta ? openItem.menuSurfaceMeta : null}
            </div>
          ) : undefined
        }
        footerContent={openItem?.menuSurfaceFooter}
        preferredFocusIndex={preferredFocusIndex}
        onSelect={(item) => {
          if (!openItem) {
            return;
          }
          setSelected(openItem.value);
          rememberRoot(openItem.value);
          onMenuItemSelect?.(openItem.value, item);
        }}
        onRequestClose={(reason, options) => {
          closeMenu(Boolean(options?.restoreFocus || reason === 'escape'));
        }}
        side="bottom"
        align="start"
        flipOnCollision
        className={cn(
          'fixed z-50 min-w-[14rem] rounded-[24px] border border-border-subtle/80 bg-[var(--surface-card)] p-2 ring-1 ring-border-subtle/20 shadow-[0_30px_70px_-40px_var(--shadow-color)] backdrop-blur-md',
          openItem?.menuSurfaceClassName,
        )}
        style={{
          color: 'var(--text-primary)',
          boxShadow: 'var(--elevation-overlay)',
        }}
      />
      <MenuSurface
        open={overflowOpen && overflowMenuItems.length > 0}
        ownerRef={rootRef}
        anchorRef={overflowTriggerRef}
        menuId={overflowMenuId}
        items={overflowMenuItems}
        ariaLabel={`${ariaLabel} overflow`}
        onSelect={handleOverflowSelect}
        onRequestClose={() => setOverflowOpen(false)}
        side="bottom"
        align="end"
        flipOnCollision
        className="fixed z-50 min-w-[14rem] rounded-[24px] border border-border-subtle/80 bg-[var(--surface-card)] p-2 ring-1 ring-border-subtle/20 shadow-[0_30px_70px_-40px_var(--shadow-color)] backdrop-blur-md"
        style={{
          color: 'var(--text-primary)',
          boxShadow: 'var(--elevation-overlay)',
        }}
      />
      <MenuSurface
        open={enableSearchHandoff && searchOpen && searchEntries.length > 0}
        ownerRef={rootRef}
        anchorRef={searchRef}
        menuId={searchMenuId}
        items={searchEntries}
        ariaLabel={searchPlaceholder}
        title={searchPlaceholder}
        headerContent={
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Search handoff
          </div>
        }
        preferredFocusIndex={0}
        onSelect={(entry) => handleSearchSelect(entry)}
        onRequestClose={() => setSearchOpen(false)}
        side="bottom"
        align="start"
        flipOnCollision
        className="fixed z-50 min-w-[18rem] max-w-[24rem] rounded-[24px] border border-border-subtle/80 bg-[var(--surface-card)] p-2 ring-1 ring-border-subtle/20 shadow-[0_30px_70px_-40px_var(--shadow-color)] backdrop-blur-md"
        style={{
          color: 'var(--text-primary)',
          boxShadow: 'var(--elevation-overlay)',
        }}
      />
    </nav>
  );
});

MenuBar.displayName = 'MenuBar';

export default MenuBar;
