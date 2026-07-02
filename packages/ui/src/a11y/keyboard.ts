/* ------------------------------------------------------------------ */
/*  A11y Engine — Keyboard navigation utilities                        */
/*                                                                     */
/*  Defines expected keyboard contracts for common component types     */
/*  and provides utilities to test keyboard navigation behavior.       */
/* ------------------------------------------------------------------ */

import type { KeyboardNavTest, A11yComponentType } from './types';

/* ---- Keyboard contracts ---- */

const keyboardContracts: Record<string, KeyboardNavTest[]> = {
  button: [
    { key: 'Enter', expectedAction: 'Activates the button', passed: false },
    { key: 'Space', expectedAction: 'Activates the button', passed: false },
  ],

  menu: [
    { key: 'ArrowDown', expectedAction: 'Moves focus to next menu item', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves focus to previous menu item', passed: false },
    { key: 'Home', expectedAction: 'Moves focus to first menu item', passed: false },
    { key: 'End', expectedAction: 'Moves focus to last menu item', passed: false },
    { key: 'Escape', expectedAction: 'Closes the menu', passed: false },
    { key: 'Enter', expectedAction: 'Activates the focused menu item', passed: false },
  ],

  dialog: [
    { key: 'Tab', expectedAction: 'Moves focus to next focusable element within dialog', passed: false },
    { key: 'Shift+Tab', expectedAction: 'Moves focus to previous focusable element within dialog', passed: false },
    { key: 'Escape', expectedAction: 'Closes the dialog', passed: false },
  ],

  accordion: [
    { key: 'ArrowDown', expectedAction: 'Moves focus to next accordion header', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves focus to previous accordion header', passed: false },
    { key: 'Home', expectedAction: 'Moves focus to first accordion header', passed: false },
    { key: 'End', expectedAction: 'Moves focus to last accordion header', passed: false },
    { key: 'Enter', expectedAction: 'Toggles the accordion panel', passed: false },
    { key: 'Space', expectedAction: 'Toggles the accordion panel', passed: false },
  ],

  tabs: [
    { key: 'ArrowRight', expectedAction: 'Moves focus to next tab', passed: false },
    { key: 'ArrowLeft', expectedAction: 'Moves focus to previous tab', passed: false },
    { key: 'Home', expectedAction: 'Moves focus to first tab', passed: false },
    { key: 'End', expectedAction: 'Moves focus to last tab', passed: false },
    { key: 'Enter', expectedAction: 'Activates the focused tab', passed: false },
    { key: 'Space', expectedAction: 'Activates the focused tab', passed: false },
  ],

  tree: [
    { key: 'ArrowDown', expectedAction: 'Moves focus to next visible tree item', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves focus to previous visible tree item', passed: false },
    { key: 'ArrowRight', expectedAction: 'Expands focused node or moves to first child', passed: false },
    { key: 'ArrowLeft', expectedAction: 'Collapses focused node or moves to parent', passed: false },
    { key: 'Home', expectedAction: 'Moves focus to first tree item', passed: false },
    { key: 'End', expectedAction: 'Moves focus to last visible tree item', passed: false },
    { key: 'Enter', expectedAction: 'Activates the focused tree item', passed: false },
  ],

  combobox: [
    { key: 'ArrowDown', expectedAction: 'Opens listbox or moves to next option', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves to previous option', passed: false },
    { key: 'Enter', expectedAction: 'Selects the focused option', passed: false },
    { key: 'Escape', expectedAction: 'Closes the dropdown listbox', passed: false },
    { key: 'Home', expectedAction: 'Moves cursor to start of input', passed: false },
    { key: 'End', expectedAction: 'Moves cursor to end of input', passed: false },
  ],

  listbox: [
    { key: 'ArrowDown', expectedAction: 'Moves focus to next option', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves focus to previous option', passed: false },
    { key: 'Home', expectedAction: 'Moves focus to first option', passed: false },
    { key: 'End', expectedAction: 'Moves focus to last option', passed: false },
    { key: 'Space', expectedAction: 'Selects the focused option', passed: false },
  ],

  slider: [
    { key: 'ArrowRight', expectedAction: 'Increases the slider value by one step', passed: false },
    { key: 'ArrowLeft', expectedAction: 'Decreases the slider value by one step', passed: false },
    { key: 'ArrowUp', expectedAction: 'Increases the slider value by one step', passed: false },
    { key: 'ArrowDown', expectedAction: 'Decreases the slider value by one step', passed: false },
    { key: 'Home', expectedAction: 'Sets the slider to minimum value', passed: false },
    { key: 'End', expectedAction: 'Sets the slider to maximum value', passed: false },
  ],

  checkbox: [
    { key: 'Space', expectedAction: 'Toggles the checkbox', passed: false },
  ],

  'radio-group': [
    { key: 'ArrowDown', expectedAction: 'Moves to next radio and selects it', passed: false },
    { key: 'ArrowRight', expectedAction: 'Moves to next radio and selects it', passed: false },
    { key: 'ArrowUp', expectedAction: 'Moves to previous radio and selects it', passed: false },
    { key: 'ArrowLeft', expectedAction: 'Moves to previous radio and selects it', passed: false },
  ],
};

/* ---- Public API ---- */

/**
 * Get the expected keyboard navigation contract for a component type.
 * Returns an empty array for unknown component types.
 */
export function getKeyboardContract(componentType: string): KeyboardNavTest[] {
  const contract = keyboardContracts[componentType];
  if (!contract) return [];
  // Return deep copies so callers don't mutate the templates
  return contract.map((test) => ({ ...test }));
}

/**
 * Test keyboard navigation on a live DOM element against a contract.
 *
 * This utility dispatches keyboard events and checks for expected DOM
 * mutations. In a jsdom environment, many checks rely on structural
 * heuristics since full layout/focus behavior isn't available.
 */
export function testKeyboardNavigation(
  element: HTMLElement,
  contract: KeyboardNavTest[],
): KeyboardNavTest[] {
  return contract.map((test) => {
    const result = { ...test };

    try {
      // Parse key combinations
      const parts = test.key.split('+');
      const key = parts[parts.length - 1];
      const shiftKey = parts.includes('Shift');
      const ctrlKey = parts.includes('Ctrl');
      const altKey = parts.includes('Alt');

      // Find the currently focused element or use the root
      const target = element.ownerDocument?.activeElement ?? element;

      // Create and dispatch the keyboard event
      const event = new KeyboardEvent('keydown', {
        key,
        code: `Key${key}`,
        shiftKey,
        ctrlKey,
        altKey,
        bubbles: true,
        cancelable: true,
      });

      const defaultPrevented = !target.dispatchEvent(event);

      // Heuristic: if the event was prevented, the component handled it
      if (defaultPrevented) {
        result.passed = true;
        result.actual = `Event handled (preventDefault called for ${test.key})`;
      } else {
        // Check for interactive elements that natively handle events
        const tagName = (target as HTMLElement).tagName?.toLowerCase();
        if (
          (key === 'Enter' || key === ' ' || key === 'Space') &&
          (tagName === 'button' || tagName === 'a')
        ) {
          result.passed = true;
          result.actual = `Native ${tagName} handles ${test.key}`;
        } else {
          result.passed = false;
          result.actual = `Event not handled for ${test.key}`;
        }
      }
    } catch {
      result.passed = false;
      result.actual = `Error dispatching ${test.key} event`;
    }

    return result;
  });
}

/**
 * Get all supported component types.
 */
export function getSupportedComponentTypes(): A11yComponentType[] {
  return Object.keys(keyboardContracts) as A11yComponentType[];
}

/**
 * Check whether a component type has a keyboard contract defined.
 */
export function hasKeyboardContract(componentType: string): boolean {
  return componentType in keyboardContracts;
}
