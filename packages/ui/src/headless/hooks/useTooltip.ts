/* ------------------------------------------------------------------ */
/*  useTooltip — Tooltip state management hook                         */
/*                                                                     */
/*  Manages show/hide with configurable delays, positioning reference, */
/*  and accessibility attributes per WAI-ARIA APG Tooltip pattern.    */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface UseTooltipOptions {
  /** Delay before showing (ms, default: 300) */
  showDelay?: number;
  /** Delay before hiding (ms, default: 100) */
  hideDelay?: number;
  /** Controlled open state */
  isOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean;
}

export interface TooltipTriggerProps {
  "aria-describedby": string | undefined;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface TooltipContentProps {
  id: string;
  role: "tooltip";
  "aria-hidden": boolean;
}

export interface UseTooltipReturn {
  /** Whether the tooltip is visible */
  isOpen: boolean;
  /** Show the tooltip immediately */
  show: () => void;
  /** Hide the tooltip immediately */
  hide: () => void;
  /** Props for the trigger element */
  getTriggerProps: () => TooltipTriggerProps;
  /** Props for the tooltip content */
  getTooltipProps: () => TooltipContentProps;
}

/* ---- Hook ---- */

export function useTooltip(options: UseTooltipOptions = {}): UseTooltipReturn {
  const {
    showDelay = 300,
    hideDelay = 100,
    isOpen: controlledIsOpen,
    onOpenChange,
    defaultOpen = false,
  } = options;

  const tooltipId = useId();
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = undefined;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
  }, []);

  const updateOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalIsOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const show = useCallback(() => {
    clearTimers();
    updateOpen(true);
  }, [clearTimers, updateOpen]);

  const hide = useCallback(() => {
    clearTimers();
    updateOpen(false);
  }, [clearTimers, updateOpen]);

  const showWithDelay = useCallback(() => {
    clearTimers();
    if (showDelay <= 0) {
      updateOpen(true);
      return;
    }
    showTimerRef.current = setTimeout(() => {
      updateOpen(true);
    }, showDelay);
  }, [clearTimers, showDelay, updateOpen]);

  const hideWithDelay = useCallback(() => {
    clearTimers();
    if (hideDelay <= 0) {
      updateOpen(false);
      return;
    }
    hideTimerRef.current = setTimeout(() => {
      updateOpen(false);
    }, hideDelay);
  }, [clearTimers, hideDelay, updateOpen]);

  const getTriggerProps = useCallback(
    (): TooltipTriggerProps => ({
      "aria-describedby": isOpen ? tooltipId : undefined,
      onMouseEnter: showWithDelay,
      onMouseLeave: hideWithDelay,
      onFocus: showWithDelay,
      onBlur: hideWithDelay,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape" && isOpen) {
          hide();
        }
      },
    }),
    [isOpen, tooltipId, showWithDelay, hideWithDelay, hide],
  );

  const getTooltipProps = useCallback(
    (): TooltipContentProps => ({
      id: tooltipId,
      role: "tooltip",
      "aria-hidden": !isOpen,
    }),
    [tooltipId, isOpen],
  );

  return useMemo(
    () => ({
      isOpen,
      show,
      hide,
      getTriggerProps,
      getTooltipProps,
    }),
    [isOpen, show, hide, getTriggerProps, getTooltipProps],
  );
}
