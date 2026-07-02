import React from 'react';
import { createPortal } from 'react-dom';
import {
  resolveOverlayPosition,
  type OverlayAlign,
  type OverlayPosition,
  type OverlaySide,
} from './OverlayPositioning';

export type MenuSurfaceDismissReason = 'outside-click' | 'escape' | 'tab' | 'select';
export type MenuSurfaceItemType = 'action' | 'checkbox' | 'radio';

/** Options passed when the menu surface is dismissed.
 * @example
 * ```tsx
 * <MenuSurface />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/menu-surface)
 */
export interface MenuSurfaceDismissOptions {
  /** Whether focus should be restored to the trigger element. */
  restoreFocus?: boolean;
}

/** Base shape for a single menu item (recursive for submenus). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive generic default
export interface MenuSurfaceItemBase<TItem extends MenuSurfaceItemBase<TItem> = any> {
  /** Unique identifier for the item. */
  key: string;
  /** Primary label displayed for the item. */
  label: React.ReactNode;
  /** Optional group heading rendered above the item when it differs from the previous item's group. */
  groupLabel?: React.ReactNode;
  /** Secondary description shown below the label. */
  description?: React.ReactNode;
  /** Keyboard shortcut hint rendered on the trailing side. */
  shortcut?: React.ReactNode;
  /** Whether the item is non-interactive. */
  disabled?: boolean;
  /** Render the item with a destructive/danger style. */
  danger?: boolean;
  /** Semantic type determining the ARIA role of the item. */
  type?: MenuSurfaceItemType;
  /** Whether the item is checked (only for checkbox/radio types). */
  checked?: boolean;
  /** Leading icon rendered before the label. */
  icon?: React.ReactNode;
  /** Trailing badge rendered after the label. */
  badge?: React.ReactNode;
  /** Nested sub-menu items. */
  children?: TItem[];
}

/** Props for {@link MenuSurface}. */
export interface MenuSurfaceProps<TItem extends MenuSurfaceItemBase<TItem>> {
  /** Whether the menu is currently visible. */
  open: boolean;
  /** Array of menu items to render. */
  items: TItem[];
  /** Ref to the element that logically "owns" the menu (used for outside-click detection). */
  ownerRef: React.RefObject<HTMLElement | null>;
  /** Ref to the element the menu is anchored/positioned against. */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Explicit DOM id for the menu element. */
  menuId?: string;
  /** Accessible label for the menu. */
  ariaLabel: string;
  /** Optional heading rendered at the top of the menu panel. */
  title?: React.ReactNode;
  /** Custom content rendered in the header area below the title. */
  headerContent?: React.ReactNode;
  /** Custom content rendered in the footer area below the items. */
  footerContent?: React.ReactNode;
  /** Index of the item that should receive initial focus. @default -1 */
  preferredFocusIndex?: number;
  /** Additional CSS class for the menu panel. */
  className?: string;
  /** Inline styles applied to the menu panel. */
  style?: React.CSSProperties;
  /** Test ID applied to the menu panel element. */
  panelTestId?: string;
  /** Function returning a test ID for a given item key. */
  itemTestId?: (key: string) => string | undefined;
  /** Callback fired when a non-disabled leaf item is selected. */
  onSelect?: (item: TItem, event?: React.MouseEvent<HTMLButtonElement>) => void;
  /** Callback fired when the menu requests to close, with the reason. */
  onRequestClose?: (reason: MenuSurfaceDismissReason, options?: MenuSurfaceDismissOptions) => void;
  /** Preferred side of the anchor to place the menu. @default "bottom" */
  side?: OverlaySide;
  /** Alignment along the anchor edge. @default "start" */
  align?: OverlayAlign;
  /** Gap in pixels between the anchor and the menu panel. @default 12 */
  gap?: number;
  /** Minimum distance in pixels from viewport edges. @default 12 */
  edgePadding?: number;
  /** Flip to the opposite side when the menu collides with the viewport. @default true */
  flipOnCollision?: boolean;
  /** Custom DOM element to portal into, or null for document.body. */
  portalTarget?: HTMLElement | null;
  /** Render inline instead of using a portal. @default false */
  disablePortal?: boolean;
  /** Fixed pixel coordinates to position the menu (bypasses anchor-based positioning). */
  coordinates?: {
    left: number;
    top: number;
  };
}

const TYPEAHEAD_TIMEOUT_MS = 450;
const SUBMENU_GAP = 8;
const SUBMENU_EDGE_PADDING = 8;

const isPrintableKey = (event: React.KeyboardEvent<HTMLElement>) =>
  event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;

const getNodeText = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join(' ');
  }
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
};

const getItemRole = (type: MenuSurfaceItemType | undefined) => {
  switch (type) {
    case 'checkbox':
      return 'menuitemcheckbox';
    case 'radio':
      return 'menuitemradio';
    case 'action':
    default:
      return 'menuitem';
  }
};

export const findEnabledMenuItemIndex = <TItem extends MenuSurfaceItemBase<TItem>>(
  items: TItem[],
  startIndex: number,
  direction: 1 | -1,
) => {
  for (let index = startIndex; index >= 0 && index < items.length; index += direction) {
    if (!items[index]?.disabled) {
      return index;
    }
  }
  return -1;
};

const findTypeaheadMatchIndex = <TItem extends MenuSurfaceItemBase<TItem>>(
  items: TItem[],
  query: string,
  currentIndex: number,
) => {
  if (!query) {
    return -1;
  }
  const candidates = items.map((item, index) => ({ item, index }));
  const orderedCandidates = currentIndex >= 0
    ? [...candidates.slice(currentIndex + 1), ...candidates.slice(0, currentIndex + 1)]
    : candidates;
  const normalizedQuery = query.toLowerCase();
  const matched = orderedCandidates.find(({ item }) => {
    if (item.disabled) {
      return false;
    }
    return getNodeText(item.label).trim().toLowerCase().startsWith(normalizedQuery);
  });
  return matched?.index ?? -1;
};

interface MenuSurfaceFloatingMeta {
  side?: OverlaySide;
  resolvedSide?: OverlaySide;
  align?: OverlayAlign;
  collisionFlipped?: boolean;
  positioningMode?: 'anchor' | 'coordinates' | 'inline';
}

interface MenuSurfaceListProps<TItem extends MenuSurfaceItemBase<TItem>> {
  items: TItem[];
  menuId?: string;
  ariaLabel: string;
  title?: React.ReactNode;
  headerContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  preferredFocusIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  panelTestId?: string;
  itemTestId?: (key: string) => string | undefined;
  onSelect?: (item: TItem, event?: React.MouseEvent<HTMLButtonElement>) => void;
  onRequestClose?: (reason: MenuSurfaceDismissReason, options?: MenuSurfaceDismissOptions) => void;
  parentLabel?: string;
  onRequestFocusParent?: () => void;
  panelRef?: React.MutableRefObject<HTMLDivElement | null>;
  floatingMeta?: MenuSurfaceFloatingMeta;
}

const MenuSurfaceList = <TItem extends MenuSurfaceItemBase<TItem>>({
  items,
  menuId,
  ariaLabel,
  title,
  headerContent,
  footerContent,
  preferredFocusIndex = -1,
  className = '',
  style,
  panelTestId,
  itemTestId,
  onSelect,
  onRequestClose,
  parentLabel,
  onRequestFocusParent,
  panelRef,
  floatingMeta,
}: MenuSurfaceListProps<TItem>) => {
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const [openSubmenuIndex, setOpenSubmenuIndex] = React.useState<number | null>(null);
  const [submenuPosition, setSubmenuPosition] = React.useState<OverlayPosition | null>(null);
  const generatedMenuId = React.useId();
  const titleId = React.useId();
  const localPanelRef = React.useRef<HTMLDivElement | null>(null);
  const submenuPanelRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = React.useRef<{ value: string; timeoutId: number | null }>({
    value: '',
    timeoutId: null,
  });

  const combinedPanelRef = React.useCallback((node: HTMLDivElement | null) => {
    localPanelRef.current = node;
    if (panelRef) {
      panelRef.current = node;
    }
  }, [panelRef]);

  const focusItemAtIndex = React.useCallback((index: number) => {
    if (index < 0) {
      return;
    }
    setFocusedIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  React.useLayoutEffect(() => {
    const initialIndex = preferredFocusIndex >= 0 && !items[preferredFocusIndex]?.disabled
      ? preferredFocusIndex
      : findEnabledMenuItemIndex(items, 0, 1);
    if (initialIndex >= 0) {
      focusItemAtIndex(initialIndex);
    }
    return undefined;
  }, [focusItemAtIndex, items, preferredFocusIndex]);

  React.useEffect(() => {
    return () => {
      if (typeaheadRef.current.timeoutId !== null) {
        window.clearTimeout(typeaheadRef.current.timeoutId);
        typeaheadRef.current.timeoutId = null;
      }
    };
  }, []);

  const updateSubmenuPosition = React.useCallback(() => {
    if (openSubmenuIndex === null || typeof window === 'undefined') {
      return;
    }
    const anchorBounds = itemRefs.current[openSubmenuIndex]?.getBoundingClientRect();
    const panelBounds = submenuPanelRef.current?.getBoundingClientRect();
    if (!anchorBounds || !panelBounds) {
      return;
    }
    setSubmenuPosition(resolveOverlayPosition({
      preferredSide: 'right',
      align: 'start',
      triggerBounds: anchorBounds,
      panelBounds,
      flipOnCollision: true,
      gap: SUBMENU_GAP,
      edgePadding: SUBMENU_EDGE_PADDING,
    }));
  }, [openSubmenuIndex]);

  React.useEffect(() => {
    if (openSubmenuIndex === null) {
      setSubmenuPosition(null);
    }
  }, [openSubmenuIndex]);

  React.useLayoutEffect(() => {
    if (openSubmenuIndex === null || typeof window === 'undefined') {
      return undefined;
    }
    updateSubmenuPosition();
    const frame = window.requestAnimationFrame(updateSubmenuPosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [openSubmenuIndex, updateSubmenuPosition]);

  React.useEffect(() => {
    if (openSubmenuIndex === null || typeof window === 'undefined') {
      return undefined;
    }
    const handleViewportChange = () => updateSubmenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [openSubmenuIndex, updateSubmenuPosition]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isPrintableKey(event)) {
      const nextValue = typeaheadRef.current.value + event.key.toLowerCase();
      typeaheadRef.current.value = nextValue;
      if (typeaheadRef.current.timeoutId !== null) {
        window.clearTimeout(typeaheadRef.current.timeoutId);
      }
      typeaheadRef.current.timeoutId = window.setTimeout(() => {
        typeaheadRef.current.value = '';
        typeaheadRef.current.timeoutId = null;
      }, TYPEAHEAD_TIMEOUT_MS);
      const matchedIndex = findTypeaheadMatchIndex(items, nextValue, focusedIndex);
      if (matchedIndex >= 0) {
        event.preventDefault();
        setOpenSubmenuIndex(null);
        focusItemAtIndex(matchedIndex);
      }
      return;
    }

    if (event.key === 'Tab') {
      onRequestClose?.('tab');
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setOpenSubmenuIndex(null);
      focusItemAtIndex(findEnabledMenuItemIndex(items, 0, 1));
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setOpenSubmenuIndex(null);
      focusItemAtIndex(findEnabledMenuItemIndex(items, items.length - 1, -1));
      return;
    }

    if (event.key === 'ArrowLeft' && onRequestFocusParent) {
      event.preventDefault();
      setOpenSubmenuIndex(null);
      onRequestFocusParent();
      return;
    }

    const activeItem = items[focusedIndex];

    if (event.key === 'ArrowRight') {
      if (!activeItem?.children?.length || activeItem.disabled) {
        return;
      }
      event.preventDefault();
      setOpenSubmenuIndex(focusedIndex);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!activeItem) {
        return;
      }
      event.preventDefault();
      if (activeItem.children?.length) {
        setOpenSubmenuIndex(focusedIndex);
        return;
      }
      if (activeItem.disabled) {
        return;
      }
      itemRefs.current[focusedIndex]?.click();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    const currentIndex = focusedIndex >= 0 ? focusedIndex : findEnabledMenuItemIndex(items, 0, 1);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = findEnabledMenuItemIndex(items, currentIndex + direction, direction);
    if (nextIndex >= 0) {
      setOpenSubmenuIndex(null);
      focusItemAtIndex(nextIndex);
    }
  };

  return (
    <div
      ref={combinedPanelRef}
      id={menuId ?? generatedMenuId}
      role="menu"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : parentLabel ?? ariaLabel}
      onKeyDown={handleMenuKeyDown}
      className={className}
      style={style}
      data-testid={panelTestId}
      data-side={floatingMeta?.side}
      data-resolved-side={floatingMeta?.resolvedSide}
      data-align={floatingMeta?.align}
      data-collision-flipped={floatingMeta?.collisionFlipped}
      data-positioning-mode={floatingMeta?.positioningMode}
    >
      {title ? (
        <div id={titleId} className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary/90">
          {title}
        </div>
      ) : null}
      {headerContent ? <div className="px-3 pb-3">{headerContent}</div> : null}
      <div className="flex flex-col gap-1">
        {items.map((item, index) => {
          const shouldRenderGroupLabel = Boolean(
            item.groupLabel
            && item.groupLabel !== items[index - 1]?.groupLabel,
          );

          return (
          <div key={item.key} className="relative">
            {shouldRenderGroupLabel ? (
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary/85">
                {item.groupLabel}
              </div>
            ) : null}
            <button
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role={getItemRole(item.type)}
              tabIndex={focusedIndex === index ? 0 : -1}
              aria-disabled={item.disabled || undefined}
              aria-checked={item.type === 'checkbox' || item.type === 'radio' ? Boolean(item.checked) : undefined}
              aria-haspopup={item.children?.length ? 'menu' : undefined}
              aria-expanded={item.children?.length ? openSubmenuIndex === index : undefined}
              disabled={item.disabled}
              onMouseMove={() => {
                if (item.disabled) {
                  return;
                }
                setFocusedIndex(index);
                setOpenSubmenuIndex(item.children?.length ? index : null);
              }}
              onClick={(event) => {
                if (item.disabled) {
                  return;
                }
                if (item.children?.length) {
                  setFocusedIndex(index);
                  setOpenSubmenuIndex(index);
                  return;
                }
                onSelect?.(item, event);
                onRequestClose?.('select', { restoreFocus: true });
              }}
              data-testid={itemTestId?.(item.key)}
              className={`group relative flex w-full items-start justify-between gap-3 rounded-[20px] border border-transparent px-3 py-3 text-left transition duration-(--motion-duration-medium) ${
                item.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : item.danger
                    ? 'hover:border-state-danger-border/30 hover:bg-state-danger/10 focus:border-state-danger-border/30 focus:bg-state-danger/10'
                    : 'hover:-translate-y-px hover:border-border-subtle/70 hover:bg-[var(--surface-hover)] hover:shadow-[0_12px_26px_-22px_var(--shadow-color)] focus:border-border-subtle/70 focus:bg-[var(--surface-hover)]'
              }`}
            >
              <span className="flex min-w-0 items-start gap-3">
                {item.icon ? (
                  <span aria-hidden="true" className="mt-0.5 shrink-0 text-text-secondary">
                    {item.icon}
                  </span>
                ) : null}
                <span className="flex flex-col min-w-0 gap-1">
                  <span className={`block text-sm font-semibold tracking-[-0.01em] ${item.danger ? 'text-state-danger-text' : 'text-text-primary'}`}>
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="block text-xs leading-5 text-text-secondary">{item.description}</span>
                  ) : null}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {(item.type === 'checkbox' || item.type === 'radio') ? (
                  <span aria-hidden="true" className="text-[11px] font-semibold text-text-secondary">
                    {item.checked ? 'On' : 'Off'}
                  </span>
                ) : null}
                {item.badge ? (
                  <span className="rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2 py-1 text-[11px] font-semibold text-text-secondary shadow-[0_10px_20px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs">
                    {item.badge}
                  </span>
                ) : null}
                {item.shortcut ? (
                  <span className="rounded-full border border-border-subtle/70 bg-[var(--surface-card)] px-2 py-1 text-[11px] font-semibold text-text-secondary shadow-[0_10px_20px_-18px_var(--shadow-color)] ring-1 ring-border-subtle/20 backdrop-blur-xs">
                    {item.shortcut}
                  </span>
                ) : null}
                {item.children?.length ? (
                  <span aria-hidden="true" className="text-xs font-semibold text-text-secondary">▶</span>
                ) : null}
              </span>
            </button>
            {item.children?.length && openSubmenuIndex === index ? (
              <MenuSurfaceList
                items={item.children}
                ariaLabel={ariaLabel}
                parentLabel={getNodeText(item.label).trim() || ariaLabel}
                preferredFocusIndex={0}
                onSelect={onSelect}
                onRequestClose={onRequestClose}
                onRequestFocusParent={() => {
                  setOpenSubmenuIndex(null);
                  focusItemAtIndex(index);
                }}
                panelRef={submenuPanelRef}
                floatingMeta={{
                  side: 'right',
                  resolvedSide: submenuPosition?.resolvedSide ?? 'right',
                  align: 'start',
                  collisionFlipped: submenuPosition?.flipped ?? false,
                  positioningMode: 'anchor',
                }}
                className="fixed z-50 min-w-[18rem] rounded-[24px] border border-border-subtle/80 bg-[var(--surface-card)] p-2 ring-1 ring-border-subtle/20 shadow-[0_30px_70px_-40px_var(--shadow-color)] backdrop-blur-md"
                style={{
                  boxShadow: 'var(--elevation-overlay)',
                  left: submenuPosition?.left ?? 0,
                  top: submenuPosition?.top ?? 0,
                  visibility: submenuPosition ? 'visible' : 'hidden',
                }}
              />
            ) : null}
          </div>
        )})}
      </div>
      {footerContent ? <div className="px-3 pt-3">{footerContent}</div> : null}
    </div>
  );
};

/** Internal dropdown menu surface with keyboard navigation, search, sections, and nested submenus. */
export const MenuSurface = <TItem extends MenuSurfaceItemBase<TItem>>({
  open,
  items,
  ownerRef,
  anchorRef,
  menuId,
  ariaLabel,
  title,
  headerContent,
  footerContent,
  preferredFocusIndex = -1,
  className = '',
  style,
  panelTestId,
  itemTestId,
  onSelect,
  onRequestClose,
  side = 'bottom',
  align = 'start',
  gap = 12,
  edgePadding = 12,
  flipOnCollision = true,
  portalTarget,
  disablePortal = false,
  coordinates,
}: MenuSurfaceProps<TItem>) => {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState<OverlayPosition | null>(null);

  const positioningMode: MenuSurfaceFloatingMeta['positioningMode'] = disablePortal
    ? 'inline'
    : coordinates
      ? 'coordinates'
      : 'anchor';

  const updateFloatingPosition = React.useCallback(() => {
    if (disablePortal || typeof window === 'undefined') {
      return;
    }

    if (coordinates) {
      setPosition({
        left: coordinates.left,
        top: coordinates.top,
        resolvedSide: side,
        flipped: false,
      });
      return;
    }

    const triggerBounds = anchorRef?.current?.getBoundingClientRect();
    const panelBounds = panelRef.current?.getBoundingClientRect();
    if (!triggerBounds || !panelBounds) {
      return;
    }

    setPosition(resolveOverlayPosition({
      preferredSide: side,
      align,
      triggerBounds,
      panelBounds,
      flipOnCollision,
      gap,
      edgePadding,
    }));
  }, [align, anchorRef, coordinates, disablePortal, edgePadding, flipOnCollision, gap, side]);

  React.useEffect(() => {
    if (!open) {
      setPosition(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ownerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onRequestClose?.('outside-click');
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onRequestClose?.('escape', { restoreFocus: true });
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onRequestClose, open, ownerRef]);

  React.useLayoutEffect(() => {
    if (!open || disablePortal || typeof window === 'undefined') {
      return undefined;
    }
    updateFloatingPosition();
    const frame = window.requestAnimationFrame(updateFloatingPosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [disablePortal, open, updateFloatingPosition]);

  React.useEffect(() => {
    if (!open || disablePortal || coordinates || typeof window === 'undefined') {
      return undefined;
    }
    const handleViewportChange = () => updateFloatingPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [coordinates, disablePortal, open, updateFloatingPosition]);

  if (!open) {
    return null;
  }

  const floatingMeta: MenuSurfaceFloatingMeta = {
    side,
    resolvedSide: position?.resolvedSide ?? side,
    align,
    collisionFlipped: position?.flipped ?? false,
    positioningMode,
  };

  const resolvedStyle = disablePortal
    ? style
    : {
      ...style,
      left: position?.left ?? coordinates?.left ?? 0,
      top: position?.top ?? coordinates?.top ?? 0,
    };

  const panelNode = (
    <MenuSurfaceList
      items={items}
      menuId={menuId}
      ariaLabel={ariaLabel}
      title={title}
      headerContent={headerContent}
      footerContent={footerContent}
      preferredFocusIndex={preferredFocusIndex}
      className={className}
      style={resolvedStyle}
      panelTestId={panelTestId}
      itemTestId={itemTestId}
      onSelect={onSelect}
      onRequestClose={onRequestClose}
      panelRef={panelRef}
      floatingMeta={floatingMeta}
    />
  );

  if (disablePortal || typeof document === 'undefined') {
    return panelNode;
  }

  return createPortal(panelNode, portalTarget ?? document.body);
};

MenuSurface.displayName = "MenuSurface";
