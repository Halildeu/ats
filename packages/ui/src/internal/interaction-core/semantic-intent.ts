/* ------------------------------------------------------------------ */
/*  Semantic Intent — Interaction intent resolver                      */
/*                                                                     */
/*  Maps raw user interactions (click, keydown, etc.) to semantic      */
/*  intents (activate, toggle, navigate, etc.). This decouples         */
/*  "what happened" from "what it means" — enabling consistent         */
/*  behavior across mouse, keyboard, and touch interactions.           */
/*                                                                     */
/*  Faz 1.5 — Semantic Intent                                          */
/* ------------------------------------------------------------------ */

import type React from "react";
import { Keys } from "./keyboard-contract";

/* ---- Intent Types ---- */

/**
 * Semantic intent — what the user intended to do, regardless of
 * the input method (mouse click, keyboard, touch, etc.)
 */
export type SemanticIntent =
  | "activate"     // Primary action (button click, link follow)
  | "toggle"       // Toggle on/off (switch, checkbox)
  | "open"         // Open a popover, dropdown, dialog
  | "close"        // Close/dismiss
  | "select"       // Select an item from a list
  | "clear"        // Clear/reset a value
  | "submit"       // Submit a form
  | "navigate"     // Navigate to next/prev item
  | "expand"       // Expand a section (accordion, tree)
  | "collapse"     // Collapse a section
  | "delete";      // Remove an item

/**
 * Navigation direction for navigate intent.
 */
export type NavigationDirection = "next" | "prev" | "first" | "last";

/**
 * Resolved intent with additional context.
 */
export type ResolvedIntent = {
  intent: SemanticIntent;
  direction?: NavigationDirection;
  /** Original event that triggered this intent */
  source: "mouse" | "keyboard" | "touch" | "programmatic";
};

/* ---- Intent Resolution ---- */

/**
 * Resolves a keyboard event to a semantic intent based on component role.
 *
 * @example
 * ```tsx
 * const handleKeyDown = (e: React.KeyboardEvent) => {
 *   const intent = resolveKeyboardIntent(e, "switch");
 *   if (intent?.intent === "toggle") {
 *     setChecked(!checked);
 *   }
 * };
 * ```
 */
export function resolveKeyboardIntent(
  event: React.KeyboardEvent | KeyboardEvent,
  componentRole: "button" | "switch" | "checkbox" | "radio" | "select" | "tabs" | "accordion" | "dialog" | "combobox" | "menu" | "slider" | "gallery",
): ResolvedIntent | null {
  const key = event.key;

  switch (componentRole) {
    case "button":
      if (key === Keys.Enter || key === Keys.Space) {
        return { intent: "activate", source: "keyboard" };
      }
      break;

    case "switch":
    case "checkbox":
      if (key === Keys.Space) {
        return { intent: "toggle", source: "keyboard" };
      }
      break;

    case "radio":
      if (key === Keys.ArrowDown || key === Keys.ArrowRight) {
        return { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowUp || key === Keys.ArrowLeft) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Space) {
        return { intent: "select", source: "keyboard" };
      }
      break;

    case "select":
    case "combobox":
      if (key === Keys.ArrowDown) {
        return event.altKey
          ? { intent: "open", source: "keyboard" }
          : { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowUp) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Enter) {
        return { intent: "select", source: "keyboard" };
      }
      if (key === Keys.Escape) {
        return { intent: "close", source: "keyboard" };
      }
      if (key === Keys.Home) {
        return { intent: "navigate", direction: "first", source: "keyboard" };
      }
      if (key === Keys.End) {
        return { intent: "navigate", direction: "last", source: "keyboard" };
      }
      break;

    case "tabs":
      if (key === Keys.ArrowRight) {
        return { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowLeft) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Home) {
        return { intent: "navigate", direction: "first", source: "keyboard" };
      }
      if (key === Keys.End) {
        return { intent: "navigate", direction: "last", source: "keyboard" };
      }
      break;

    case "accordion":
      if (key === Keys.Enter || key === Keys.Space) {
        return { intent: "toggle", source: "keyboard" };
      }
      if (key === Keys.ArrowDown) {
        return { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowUp) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Home) {
        return { intent: "navigate", direction: "first", source: "keyboard" };
      }
      if (key === Keys.End) {
        return { intent: "navigate", direction: "last", source: "keyboard" };
      }
      break;

    case "dialog":
      if (key === Keys.Escape) {
        return { intent: "close", source: "keyboard" };
      }
      break;

    case "menu":
      if (key === Keys.ArrowDown) {
        return { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowUp) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Enter || key === Keys.Space) {
        return { intent: "activate", source: "keyboard" };
      }
      if (key === Keys.Escape) {
        return { intent: "close", source: "keyboard" };
      }
      if (key === Keys.Home) {
        return { intent: "navigate", direction: "first", source: "keyboard" };
      }
      if (key === Keys.End) {
        return { intent: "navigate", direction: "last", source: "keyboard" };
      }
      break;

    case "slider":
      if (key === Keys.ArrowRight || key === Keys.ArrowUp) {
        return { intent: "navigate", direction: "next", source: "keyboard" };
      }
      if (key === Keys.ArrowLeft || key === Keys.ArrowDown) {
        return { intent: "navigate", direction: "prev", source: "keyboard" };
      }
      if (key === Keys.Home) {
        return { intent: "navigate", direction: "first", source: "keyboard" };
      }
      if (key === Keys.End) {
        return { intent: "navigate", direction: "last", source: "keyboard" };
      }
      break;
  }

  return null;
}

/**
 * Resolves a click/pointer event to a semantic intent.
 * Simple — clicks always map to "activate" for buttons, "toggle" for toggles, etc.
 */
export function resolveClickIntent(
  componentRole: "button" | "switch" | "checkbox" | "radio" | "select" | "tabs" | "accordion" | "link",
): ResolvedIntent {
  switch (componentRole) {
    case "switch":
    case "checkbox":
      return { intent: "toggle", source: "mouse" };
    case "radio":
    case "tabs":
      return { intent: "select", source: "mouse" };
    case "select":
      return { intent: "open", source: "mouse" };
    case "accordion":
      return { intent: "toggle", source: "mouse" };
    case "link":
      return { intent: "navigate", source: "mouse" };
    case "button":
    default:
      return { intent: "activate", source: "mouse" };
  }
}
