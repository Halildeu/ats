import { useCallback, useEffect, useRef } from 'react';

/**
 * Roving-tabindex keyboard navigation for sidebar items.
 *
 * Attach `containerRef` to the `<nav>` element. The hook listens for
 * ArrowUp/Down (or j/k), Home/End, Enter/Space and manages focus.
 */
export function useAppSidebarKeyboard(enabled: boolean) {
  const containerRef = useRef<HTMLElement>(null);

  const getFocusableItems = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(
        'a[data-sidebar-item], button[data-sidebar-item]',
      ),
    ).filter((el) => el.getAttribute('aria-disabled') !== 'true' && el.tabIndex !== -1);
  }, []);

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      const items = getFocusableItems();
      if (items.length === 0) return;
      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current);
      let next = idx + direction;
      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;
      items[next]?.focus();
    },
    [getFocusableItems],
  );

  const jumpTo = useCallback(
    (position: 'first' | 'last') => {
      const items = getFocusableItems();
      if (items.length === 0) return;
      const target = position === 'first' ? items[0] : items[items.length - 1];
      target?.focus();
    },
    [getFocusableItems],
  );

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          moveFocus(1);
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          moveFocus(-1);
          break;
        case 'Home':
          e.preventDefault();
          jumpTo('first');
          break;
        case 'End':
          e.preventDefault();
          jumpTo('last');
          break;
        case 'Enter':
        case ' ':
          // Let the browser handle click on the focused element
          if (document.activeElement instanceof HTMLElement) {
            const active = document.activeElement;
            if (container.contains(active) && e.key === ' ') {
              e.preventDefault();
              active.click();
            }
          }
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [enabled, moveFocus, jumpTo]);

  return { containerRef };
}
