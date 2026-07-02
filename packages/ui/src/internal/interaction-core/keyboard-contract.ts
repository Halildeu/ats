/* ------------------------------------------------------------------ */
/*  Keyboard Contract — Standardized keyboard interaction patterns     */
/*                                                                     */
/*  Documents and enforces keyboard contracts for every interactive     */
/*  component. Based on WAI-ARIA APG patterns.                         */
/*                                                                     */
/*  Faz 1.3 — Keyboard Contract                                        */
/* ------------------------------------------------------------------ */

/* ---- Key Constants ---- */

export const Keys = {
  Enter: "Enter",
  Space: " ",
  Escape: "Escape",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Backspace: "Backspace",
  Delete: "Delete",
} as const;

export type KeyConstant = (typeof Keys)[keyof typeof Keys];

/* ---- Keyboard Action Types ---- */

export type KeyboardAction =
  | "activate"     // Click/press equivalent
  | "toggle"       // Toggle on/off
  | "dismiss"      // Close/cancel
  | "navigate-next"
  | "navigate-prev"
  | "navigate-first"
  | "navigate-last"
  | "select"
  | "clear"
  | "delete"
  | "expand"
  | "collapse"
  | "submit";

/* ---- Keyboard Binding ---- */

export type KeyBinding = {
  key: KeyConstant | KeyConstant[];
  action: KeyboardAction;
  description: string;
  /** If true, modifier key (Ctrl/Cmd) is required */
  withModifier?: boolean;
  /** If true, Shift is required */
  withShift?: boolean;
};

/* ---- Component Keyboard Contracts ---- */

export type ComponentKeyboardContract = {
  component: string;
  role: string;
  bindings: KeyBinding[];
};

/**
 * Centralized keyboard contract registry.
 * Each entry defines the expected keyboard behavior per WAI-ARIA APG.
 */
export const KEYBOARD_CONTRACTS: Record<string, ComponentKeyboardContract> = {
  button: {
    component: "Button",
    role: "button",
    bindings: [
      { key: [Keys.Enter, Keys.Space], action: "activate", description: "Trigger button action" },
    ],
  },

  switch: {
    component: "Switch",
    role: "switch",
    bindings: [
      { key: Keys.Space, action: "toggle", description: "Toggle switch state" },
    ],
  },

  checkbox: {
    component: "Checkbox",
    role: "checkbox",
    bindings: [
      { key: Keys.Space, action: "toggle", description: "Toggle checked state" },
    ],
  },

  radio: {
    component: "Radio",
    role: "radio",
    bindings: [
      { key: [Keys.ArrowDown, Keys.ArrowRight], action: "navigate-next", description: "Move to next radio option" },
      { key: [Keys.ArrowUp, Keys.ArrowLeft], action: "navigate-prev", description: "Move to previous radio option" },
      { key: Keys.Space, action: "select", description: "Select current option" },
    ],
  },

  textInput: {
    component: "TextInput",
    role: "textbox",
    bindings: [
      { key: Keys.Escape, action: "clear", description: "Clear input (if clearable)" },
      { key: Keys.Enter, action: "submit", description: "Submit form (if in form context)" },
    ],
  },

  select: {
    component: "Select",
    role: "listbox",
    bindings: [
      { key: [Keys.Enter, Keys.Space], action: "expand", description: "Open dropdown" },
      { key: Keys.Escape, action: "dismiss", description: "Close dropdown" },
      { key: Keys.ArrowDown, action: "navigate-next", description: "Next option" },
      { key: Keys.ArrowUp, action: "navigate-prev", description: "Previous option" },
      { key: Keys.Home, action: "navigate-first", description: "First option" },
      { key: Keys.End, action: "navigate-last", description: "Last option" },
      { key: Keys.Enter, action: "select", description: "Select current option" },
    ],
  },

  tabs: {
    component: "Tabs",
    role: "tablist",
    bindings: [
      { key: Keys.ArrowRight, action: "navigate-next", description: "Next tab" },
      { key: Keys.ArrowLeft, action: "navigate-prev", description: "Previous tab" },
      { key: Keys.Home, action: "navigate-first", description: "First tab" },
      { key: Keys.End, action: "navigate-last", description: "Last tab" },
    ],
  },

  accordion: {
    component: "Accordion",
    role: "region",
    bindings: [
      { key: [Keys.Enter, Keys.Space], action: "toggle", description: "Expand/collapse panel" },
      { key: Keys.ArrowDown, action: "navigate-next", description: "Next panel header" },
      { key: Keys.ArrowUp, action: "navigate-prev", description: "Previous panel header" },
      { key: Keys.Home, action: "navigate-first", description: "First panel header" },
      { key: Keys.End, action: "navigate-last", description: "Last panel header" },
    ],
  },

  dialog: {
    component: "Dialog",
    role: "dialog",
    bindings: [
      { key: Keys.Escape, action: "dismiss", description: "Close dialog" },
      { key: Keys.Tab, action: "navigate-next", description: "Move focus within dialog (trapped)" },
    ],
  },

  combobox: {
    component: "Combobox",
    role: "combobox",
    bindings: [
      { key: Keys.ArrowDown, action: "expand", description: "Open listbox or navigate next" },
      { key: Keys.ArrowUp, action: "navigate-prev", description: "Navigate previous" },
      { key: Keys.Escape, action: "dismiss", description: "Close listbox" },
      { key: Keys.Enter, action: "select", description: "Select highlighted option" },
      { key: Keys.Home, action: "navigate-first", description: "First option" },
      { key: Keys.End, action: "navigate-last", description: "Last option" },
    ],
  },

  menu: {
    component: "Menu",
    role: "menu",
    bindings: [
      { key: Keys.ArrowDown, action: "navigate-next", description: "Next menu item" },
      { key: Keys.ArrowUp, action: "navigate-prev", description: "Previous menu item" },
      { key: [Keys.Enter, Keys.Space], action: "activate", description: "Activate menu item" },
      { key: Keys.Escape, action: "dismiss", description: "Close menu" },
      { key: Keys.Home, action: "navigate-first", description: "First menu item" },
      { key: Keys.End, action: "navigate-last", description: "Last menu item" },
    ],
  },

  tooltip: {
    component: "Tooltip",
    role: "tooltip",
    bindings: [
      { key: Keys.Escape, action: "dismiss", description: "Dismiss tooltip" },
    ],
  },

  slider: {
    component: "Slider",
    role: "slider",
    bindings: [
      { key: Keys.ArrowRight, action: "navigate-next", description: "Increase value" },
      { key: Keys.ArrowLeft, action: "navigate-prev", description: "Decrease value" },
      { key: Keys.Home, action: "navigate-first", description: "Set to minimum" },
      { key: Keys.End, action: "navigate-last", description: "Set to maximum" },
      { key: Keys.PageUp, action: "navigate-next", description: "Large increase", withShift: false },
      { key: Keys.PageDown, action: "navigate-prev", description: "Large decrease", withShift: false },
    ],
  },

  gallery: {
    component: "Gallery",
    role: "listbox",
    bindings: [
      { key: Keys.ArrowRight, action: "navigate-next", description: "Next item" },
      { key: Keys.ArrowLeft, action: "navigate-prev", description: "Previous item" },
      { key: Keys.ArrowDown, action: "navigate-next", description: "Next row" },
      { key: Keys.ArrowUp, action: "navigate-prev", description: "Previous row" },
      { key: [Keys.Enter, Keys.Space], action: "select", description: "Select item" },
      { key: Keys.Escape, action: "dismiss", description: "Deselect" },
      { key: Keys.Home, action: "navigate-first", description: "First item" },
      { key: Keys.End, action: "navigate-last", description: "Last item" },
    ],
  },
};

/* ---- Keyboard Event Helpers ---- */

/**
 * Creates a keyboard event handler from a contract.
 * Maps key presses to semantic actions.
 *
 * @example
 * ```tsx
 * const handleKeyDown = createKeyHandler("switch", {
 *   toggle: () => setChecked(!checked),
 * });
 * <input onKeyDown={handleKeyDown} />
 * ```
 */
export function createKeyHandler(
  contractKey: keyof typeof KEYBOARD_CONTRACTS,
  handlers: Partial<Record<KeyboardAction, (event: KeyboardEvent | React.KeyboardEvent) => void>>,
): (event: KeyboardEvent | React.KeyboardEvent) => void {
  const contract = KEYBOARD_CONTRACTS[contractKey];
  if (!contract) {
    return () => {};
  }

  return (event: KeyboardEvent | React.KeyboardEvent) => {
    for (const binding of contract.bindings) {
      const keys = Array.isArray(binding.key) ? binding.key : [binding.key];
      const keyMatch = keys.includes(event.key as KeyConstant);

      if (!keyMatch) continue;

      // Check modifier requirements
      if (binding.withModifier && !(event.ctrlKey || event.metaKey)) continue;
      if (binding.withShift && !event.shiftKey) continue;

      const handler = handlers[binding.action];
      if (handler) {
        event.preventDefault();
        handler(event);
        return;
      }
    }
  };
}

/**
 * Returns a human-readable description of a component's keyboard contract.
 * Useful for documentation and a11y panels.
 */
export function describeKeyboardContract(
  contractKey: keyof typeof KEYBOARD_CONTRACTS,
): string[] {
  const contract = KEYBOARD_CONTRACTS[contractKey];
  if (!contract) return [];

  return contract.bindings.map((binding) => {
    const keys = Array.isArray(binding.key)
      ? binding.key.join(" / ")
      : binding.key;
    const modifiers = [
      binding.withModifier ? "Ctrl+" : "",
      binding.withShift ? "Shift+" : "",
    ].join("");
    return `${modifiers}${keys} → ${binding.description}`;
  });
}

// React KeyboardEvent type for convenience
import type React from "react";
