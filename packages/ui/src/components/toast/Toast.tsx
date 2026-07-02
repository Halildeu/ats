import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Toast — Notification system with provider + hook                   */
/*                                                                     */
/*  Usage:                                                             */
/*    <ToastProvider>                                                   */
/*      <App />                                                        */
/*    </ToastProvider>                                                  */
/*                                                                     */
/*    const toast = useToast();                                        */
/*    toast.success("Saved!");                                         */
/* ------------------------------------------------------------------ */

export type ToastVariant = "info" | "success" | "warning" | "error";
export type ToastPosition = "top-right" | "top-center" | "bottom-right" | "bottom-center";

export interface ToastData {
  id: string;
  variant: ToastVariant;
  title?: string;
  message: string;
  /** Rich content rendered instead of message string when provided. */
  content?: React.ReactNode;
  duration?: number;
  /** When true, toast will not auto-dismiss (must be dismissed manually or via update). */
  persistent?: boolean;
  /** Called when user clicks the dismiss button. Use for abort/cancel logic. */
  onCancel?: () => void;
}

interface ToastContextValue {
  info: (message: string, opts?: ToastOptions) => string;
  success: (message: string, opts?: ToastOptions) => string;
  warning: (message: string, opts?: ToastOptions) => string;
  error: (message: string, opts?: ToastOptions) => string;
  dismiss: (id: string) => void;
  /** Update an existing toast's properties (variant, content, message, etc.). */
  update: (id: string, data: Partial<Omit<ToastData, "id">>) => void;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
  /** Rich content rendered instead of message string. */
  content?: React.ReactNode;
  /** When true, toast will not auto-dismiss. */
  persistent?: boolean;
  /** Called when user clicks the dismiss button. */
  onCancel?: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**

 * Toast component.

 * @example

 * ```tsx

 * <Toast />

 * ```

 * @since 1.0.0

 * @see [Docs](https://design.mfe.dev/components/toast)

 */

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let toastCounter = 0;

export interface ToastProviderProps extends AccessControlledProps {
  /** Position of the toast container on screen. @default "top-right" */
  position?: ToastPosition;
  /** Default auto-dismiss duration in milliseconds. @default 4000 */
  duration?: number;
  /** Maximum number of toasts visible at once. @default 5 */
  maxVisible?: number;
  /** Application content rendered within the toast context. */
  children: React.ReactNode;
  /** Additional CSS class name for the toast container. */
  className?: string;
  /** Whether toast animations are enabled. @default true */
  animated?: boolean;
}

const positionStyles: Record<ToastPosition, string> = {
  "top-right": "top-4 end-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-4 end-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
};

const variantStyles: Record<ToastVariant, string> = {
  info: "border-state-info-text/20 bg-surface-default",
  success: "border-state-success-text/20 bg-surface-default",
  warning: "border-state-warning-text/20 bg-surface-default",
  error: "border-state-danger-text/20 bg-surface-default",
};

const indicatorColors: Record<ToastVariant, string> = {
  info: "bg-state-info-text",
  success: "bg-state-success-text",
  warning: "bg-state-warning-text",
  error: "bg-state-danger-text",
};

export const ToastProvider = React.forwardRef<HTMLDivElement, ToastProviderProps>(({
  position = "top-right",
  duration = 4000,
  maxVisible = 5,
  children,
  access,
  accessReason,
}, _ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (variant: ToastVariant, message: string, opts?: ToastOptions): string => {
      const id = `toast-${++toastCounter}`;
      const toast: ToastData = {
        id,
        variant,
        message,
        title: opts?.title,
        content: opts?.content,
        duration: opts?.persistent ? undefined : (opts?.duration ?? duration),
        persistent: opts?.persistent,
        onCancel: opts?.onCancel,
      };
      setToasts((prev) => [...prev.slice(-(maxVisible - 1)), toast]);
      return id;
    },
    [duration, maxVisible],
  );

  const update = useCallback((id: string, data: Partial<Omit<ToastData, "id">>) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...data } : t)),
    );
  }, []);

  const value: ToastContextValue = {
    info: (msg, opts) => addToast("info", msg, opts),
    success: (msg, opts) => addToast("success", msg, opts),
    warning: (msg, opts) => addToast("warning", msg, opts),
    error: (msg, opts) => addToast("error", msg, opts),
    dismiss,
    update,
  };

  return (
    <ToastContext.Provider value={value}
      data-access-state={accessState.state}
    >
      {children}
      {/* Toast container */}
      <div
        className={cn(
          "fixed z-[1700] flex flex-col gap-2 pointer-events-none",
          accessState.isDisabled && "pointer-events-none opacity-50",
          positionStyles[position],
        )}
        title={accessReason}
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
});

ToastProvider.displayName = "ToastProvider";

/* ---- Individual toast ----
   */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!toast.persistent && toast.duration && toast.duration > 0) {
      timerRef.current = setTimeout(onDismiss, toast.duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [toast.duration, toast.persistent, onDismiss]);

  const handleDismiss = () => {
    if (toast.onCancel) {
      toast.onCancel();
    }
    onDismiss();
  };

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-80 items-start gap-3 rounded-xl border p-4 shadow-lg",
        "animate-in slide-in-from-right-full fade-in-0",
        variantStyles[toast.variant],
      )}
      role="alert"
      {...stateAttrs({ component: "toast", status: toast.variant === "error" ? "error" : toast.variant === "warning" ? "warning" : toast.variant === "success" ? "success" : "idle" })}
    >
      {/* Color indicator */}
      <span
        className={cn(
          "mt-1 h-2 w-2 shrink-0 rounded-full",
          indicatorColors[toast.variant],
        )}
      />
      <div className="min-w-0 flex-1">
        {toast.title && (
          <div className="text-sm font-semibold text-text-primary">
            {toast.title}
          </div>
        )}
        {toast.content ?? (
          <div className="text-sm text-text-secondary">
            {toast.message}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-text-secondary transition hover:bg-surface-muted"
        aria-label="Dismiss"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
