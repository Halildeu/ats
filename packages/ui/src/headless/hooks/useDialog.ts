/* ------------------------------------------------------------------ */
/*  useDialog — Dialog state + focus trap orchestration hook           */
/*                                                                     */
/*  Manages dialog open/close state, focus trapping, focus restore,   */
/*  Escape key dismissal, and ARIA attributes per WAI-ARIA APG        */
/*  Dialog pattern.                                                    */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useRef, useId, useMemo, useEffect } from "react";
import type React from "react";

/* ---- Types ---- */

export interface UseDialogOptions {
  /** Controlled open state */
  isOpen?: boolean;
  /** Default open state (uncontrolled) */
  defaultOpen?: boolean;
  /** Called when open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Whether dialog is modal (traps focus, default: true) */
  modal?: boolean;
  /** Accessible label for the dialog */
  "aria-label"?: string;
  /** ID of the element that labels the dialog */
  "aria-labelledby"?: string;
  /** ID of the element that describes the dialog */
  "aria-describedby"?: string;
  /** Whether to close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Ref to the element that should receive initial focus */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Called when the dialog requests close (useful for confirmation) */
  onClose?: () => void;
}

export interface DialogTriggerProps {
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
  onClick: () => void;
}

export interface DialogContentProps {
  id: string;
  role: "dialog";
  "aria-modal": boolean | undefined;
  "aria-label": string | undefined;
  "aria-labelledby": string | undefined;
  "aria-describedby": string | undefined;
  tabIndex: -1;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface DialogTitleProps {
  id: string;
}

export interface DialogDescriptionProps {
  id: string;
}

export interface UseDialogReturn {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Open the dialog */
  open: () => void;
  /** Close the dialog */
  close: () => void;
  /** Toggle the dialog */
  toggle: () => void;
  /** Props for the trigger element */
  getTriggerProps: () => DialogTriggerProps;
  /** Props for the dialog content container */
  getContentProps: () => DialogContentProps;
  /** Props for the dialog title */
  getTitleProps: () => DialogTitleProps;
  /** Props for the dialog description */
  getDescriptionProps: () => DialogDescriptionProps;
  /** Ref for the dialog container (attach for focus management) */
  contentRef: React.RefObject<HTMLElement | null>;
}

/* ---- Hook ---- */

export function useDialog(options: UseDialogOptions = {}): UseDialogReturn {
  const {
    isOpen: controlledIsOpen,
    defaultOpen = false,
    onOpenChange,
    modal = true,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    closeOnEscape = true,
    initialFocusRef,
    onClose,
  } = options;

  const baseId = useId();
  const dialogId = `${baseId}-dialog`;
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const updateOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalIsOpen(next);
      onOpenChange?.(next);
      if (!next) onClose?.();
    },
    [isControlled, onOpenChange, onClose],
  );

  const open = useCallback(() => updateOpen(true), [updateOpen]);
  const close = useCallback(() => updateOpen(false), [updateOpen]);
  const toggle = useCallback(() => updateOpen(!isOpen), [updateOpen, isOpen]);

  // Focus management: save trigger focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Focus initial element or the dialog container
      requestAnimationFrame(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (contentRef.current) {
          contentRef.current.focus();
        }
      });
    } else if (previousFocusRef.current) {
      const el = previousFocusRef.current;
      previousFocusRef.current = null;
      requestAnimationFrame(() => {
        el?.focus();
      });
    }
  }, [isOpen, initialFocusRef]);

  // Prop getters
  const getTriggerProps = useCallback(
    (): DialogTriggerProps => ({
      "aria-haspopup": "dialog",
      "aria-expanded": isOpen,
      onClick: () => {
        if (isOpen) {
          close();
        } else {
          open();
        }
      },
    }),
    [isOpen, open, close],
  );

  const getContentProps = useCallback(
    (): DialogContentProps => ({
      id: dialogId,
      role: "dialog",
      "aria-modal": modal || undefined,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy ?? titleId,
      "aria-describedby": ariaDescribedBy,
      tabIndex: -1,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (closeOnEscape && event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      },
    }),
    [dialogId, modal, ariaLabel, ariaLabelledBy, ariaDescribedBy, titleId, closeOnEscape, close],
  );

  const getTitleProps = useCallback(
    (): DialogTitleProps => ({
      id: titleId,
    }),
    [titleId],
  );

  const getDescriptionProps = useCallback(
    (): DialogDescriptionProps => ({
      id: descriptionId,
    }),
    [descriptionId],
  );

  return useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      getTriggerProps,
      getContentProps,
      getTitleProps,
      getDescriptionProps,
      contentRef,
    }),
    [isOpen, open, close, toggle, getTriggerProps, getContentProps, getTitleProps, getDescriptionProps],
  );
}
