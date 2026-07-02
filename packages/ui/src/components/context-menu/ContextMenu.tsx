import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "../../utils/cn";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  ContextMenu — Right-click or long-press activated menu             */
/* ------------------------------------------------------------------ */

export interface ContextMenuItem {
  type?: "item";
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

export interface ContextMenuSeparator {
  type: "separator";
  key: string;
}

export interface ContextMenuLabel {
  type: "label";
  key: string;
  label: React.ReactNode;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator | ContextMenuLabel;

export interface ContextMenuProps extends AccessControlledProps {
  /** Menu entries (items, separators, and labels). */
  items: ContextMenuEntry[];
  /** Trigger element that activates the context menu on right-click. */
  children: React.ReactElement;
  /** Whether the context menu is disabled. */
  disabled?: boolean;
  /** Additional CSS class name for the menu panel. */
  className?: string;
  /** Access level controlling visibility and interactivity. */
  access?: import('../../internal/access-controller').AccessLevel;
  /** Tooltip text explaining access restrictions. */
  accessReason?: string;
}

function isItem(entry: ContextMenuEntry): entry is ContextMenuItem {
  return !entry.type || entry.type === "item";
}

/**

 * ContextMenu component.

 * @example

 * ```tsx

 * <ContextMenu />

 * ```

 * @since 1.0.0

 * @see [Docs](https://design.mfe.dev/components/context-menu)

 */

export const ContextMenu = React.forwardRef<HTMLDivElement, ContextMenuProps>(({
  items,
  children,
  disabled = false,
  className,
  access,
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const actionableItems = items.filter(isItem).filter((i) => !i.disabled);

  const close = useCallback(() => {
    setOpen(false);
    setFocusIndex(-1);
  }, []);

  /* Right-click handler
   */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setPosition({ x: e.clientX, y: e.clientY });
      setOpen(true);
      setFocusIndex(0);
    },
    [disabled],
  );

  /* Click outside */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  /* Escape key */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  /* Keyboard navigation */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || actionableItems.length === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusIndex((prev) => (prev + 1) % actionableItems.length);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusIndex((prev) => (prev - 1 + actionableItems.length) % actionableItems.length);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          const focused = actionableItems[focusIndex];
          if (focused) {
            focused.onClick?.();
            close();
          }
          break;
        }
      }
    },
    [open, actionableItems, focusIndex, close],
  );

  /* Adjust position to stay within viewport */
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = position;
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    if (x !== position.x || y !== position.y) {
      setPosition({ x, y });
    }
  }, [open, position]);

  return (
    <>
      data-access-state={accessState.state}
      <div ref={triggerRef} onContextMenu={handleContextMenu} className={cn("inline-flex", accessState.isDisabled && "pointer-events-none opacity-50")} title={accessReason}>
        {children}
      </div>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            "fixed z-[1500] min-w-[160px] rounded-lg border border-border-default bg-surface-default py-1",
            "shadow-lg animate-in fade-in-0 zoom-in-95",
            className,
          )}
          style={{ left: position.x, top: position.y }}
        >
          {items.map((entry) => {
            if (entry.type === "separator") {
              return (
                <div
                  key={entry.key}
                  role="separator"
                  className="my-1 h-px bg-border-default"
                />
              );
            }

            if (entry.type === "label") {
              return (
                <div
                  key={entry.key}
                  className="px-3 py-1.5 text-xs font-semibold text-[var(--text-tertiary)] select-none"
                >
                  {entry.label}
                </div>
              );
            }

            /* item */
            const item = entry as ContextMenuItem;
            const actionIdx = actionableItems.indexOf(item);
            const isFocused = actionIdx === focusIndex;

            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  close();
                }}
                onMouseEnter={() => {
                  if (!item.disabled) setFocusIndex(actionIdx);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-sm outline-hidden transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  item.danger
                    ? cn(
                        "text-[var(--state-danger-text)]",
                        isFocused && "bg-state-danger-bg",
                      )
                    : cn(
                        "text-text-primary",
                        isFocused && "bg-[var(--surface-hover)]",
                      ),
                )}
              >
                {item.icon && <span className="shrink-0 w-4 h-4">{item.icon}</span>}
                <span className="flex-1 text-start">{item.label}</span>
                {item.shortcut && (
                  <span className="ms-auto ps-4 text-xs text-[var(--text-tertiary)]">
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});

ContextMenu.displayName = "ContextMenu";
