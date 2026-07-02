import React from "react";
import { cn } from "../../utils/cn";

/* ------------------------------------------------------------------ */
/*  Slot — enables the `asChild` composition pattern                   */
/*                                                                     */
/*  When a component accepts `asChild`, it renders its child element   */
/*  instead of the default element, merging props (className, style,   */
/*  event handlers, refs) onto the child.                              */
/*                                                                     */
/*  Follows the Radix UI / shadcn pattern for maximum composition.     */
/*                                                                     */
/*  @example                                                           */
/*  <Button asChild>                                                   */
/*    <a href="/login">Login</a>                                       */
/*  </Button>                                                          */
/*  // Renders: <a href="/login" class="btn-primary ...">Login</a>     */
/* ------------------------------------------------------------------ */

type AnyProps = Record<string, unknown>;

/**
 * Merge two refs into a single callback ref.
 */
function composeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined | null>
): React.RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref != null && typeof ref === "object") {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

/**
 * Merge two event handlers so both are called.
 * The parent handler runs first.
 */
function composeEventHandlers<E>(
  parentHandler?: (event: E) => void,
  childHandler?: (event: E) => void,
): ((event: E) => void) | undefined {
  if (!parentHandler && !childHandler) return undefined;
  return (event: E) => {
    parentHandler?.(event);
    // Only call child handler if the parent didn't call preventDefault
    if (!(event as unknown as { defaultPrevented?: boolean }).defaultPrevented) {
      childHandler?.(event);
    }
  };
}

/**
 * Check whether a prop name looks like a React event handler.
 */
function isEventHandler(key: string): boolean {
  return /^on[A-Z]/.test(key);
}

export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  /** Single child element to merge parent props onto. */
  children: React.ReactNode;
  /** CSS class name merged with the child's existing className via `cn()`. */
  className?: string;
  /** Inline styles shallow-merged with the child's style (child wins on conflict). */
  style?: React.CSSProperties;
  /** ARIA role forwarded to the child element. */
  role?: React.AriaRole;
  /** HTML id forwarded to the child element. */
  id?: string;
  /** Tab index forwarded to the child element. */
  tabIndex?: number;
  /** Data-testid attribute forwarded to the child element. */
  "data-testid"?: string;
}

/**
 * Slot renders its single child element, merging parent props onto it.
 *
 * - `className` values are merged via `cn()`
 * - `style` objects are shallow-merged (child wins on conflicts)
 * - Event handlers are composed (parent fires first)
 * - Refs are composed via callback ref
 * - All other props are spread (child props win on conflicts)
 */
export const Slot = React.forwardRef<HTMLElement, SlotProps>(
  function Slot({ children, ...slotProps }, forwardedRef) {
    const child = React.Children.only(children);

    if (!React.isValidElement(child)) {
      console.warn("Slot: expected a single valid React element as child.");
      return null;
    }

    const childProps = child.props as AnyProps;

    // Build merged props
    const mergedProps: AnyProps = { ...slotProps };

    // Merge className
    if (slotProps.className || childProps.className) {
      mergedProps.className = cn(
        slotProps.className as string,
        childProps.className as string,
      );
    }

    // Merge style
    if (slotProps.style || childProps.style) {
      mergedProps.style = {
        ...(slotProps.style as React.CSSProperties),
        ...(childProps.style as React.CSSProperties),
      };
    }

    // Merge event handlers
    for (const key of Object.keys(slotProps)) {
      if (isEventHandler(key)) {
        mergedProps[key] = composeEventHandlers(
          slotProps[key as keyof typeof slotProps] as
            | ((e: unknown) => void)
            | undefined,
          childProps[key] as ((e: unknown) => void) | undefined,
        );
      }
    }

    // Spread remaining child props (child wins for non-event, non-class, non-style)
    for (const key of Object.keys(childProps)) {
      if (key === "className" || key === "style") continue;
      if (isEventHandler(key) && key in mergedProps) continue;
      mergedProps[key] = childProps[key];
    }

    // Merge refs
    const childRef = (child as unknown as { ref?: React.Ref<unknown> }).ref;
    mergedProps.ref = composeRefs(forwardedRef, childRef ?? null);

    return React.cloneElement(child, mergedProps);
  },
);

Slot.displayName = "Slot";

/** Type alias for Slot ref. */
export type SlotRef = React.Ref<HTMLElement>;
/** Type alias for Slot element. */
export type SlotElement = HTMLElement;
/** Type alias for Slot cssproperties. */
export type SlotCSSProperties = React.CSSProperties;
