/* ------------------------------------------------------------------ */
/*  ARIA Live — Screen reader announcements                            */
/*                                                                     */
/*  Provides a centralized way to make announcements to screen         */
/*  readers using aria-live regions. Supports polite and assertive     */
/*  announcements.                                                     */
/*                                                                     */
/*  Faz 2.5 — ARIA Live                                                */
/* ------------------------------------------------------------------ */

import React, { useCallback, useEffect, useRef, useState } from "react";

/** Politeness level for screen reader announcements. */
export type AriaLivePoliteness = "polite" | "assertive" | "off";

/** Props for the AriaLiveRegion component. */
export interface AriaLiveRegionProps {
  /** Default politeness level for announcements. @default "polite" */
  defaultPoliteness?: AriaLivePoliteness;
  /** Auto-clear delay in milliseconds after announcement. @default 5000 */
  clearDelay?: number;
  /** Additional CSS class name for the container. */
  className?: string;
  /** Unique identifier for the live region. */
  id?: string;
  /** Whether the region is active and listening for announcements. @default true */
  enabled?: boolean;
  /** Callback fired when an announcement is made. */
  onAnnounce?: (message: string, politeness: AriaLivePoliteness) => void;
}

/* ---- Imperative announce function ---- */

let announceCallback: ((message: string, politeness?: AriaLivePoliteness) => void) | null = null;

/**
 * Imperatively announce a message to screen readers.
 * Requires AriaLiveRegion to be mounted in the app.
 *
 * @example
 * ```ts
 * announce("3 items selected");
 * announce("Error: invalid input", "assertive");
 * ```
 */
export function announce(
  message: string,
  politeness: AriaLivePoliteness = "polite",
): void {
  if (announceCallback) {
    announceCallback(message, politeness);
  }
}

/* ---- AriaLiveRegion Component ---- */

/**
 * Renders an invisible aria-live region. Mount this once near the root
 * of your app. All `announce()` calls will be routed here.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <AriaLiveRegion />
 *       <Router />
 *     </>
 *   );
 * }
 * ```
 */
export const AriaLiveRegion: React.FC<AriaLiveRegionProps> = () => {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleAnnounce = useCallback(
    (message: string, politeness: AriaLivePoliteness = "polite") => {
      // Clear previous message first to ensure re-announcement
      if (politeness === "assertive") {
        setAssertiveMessage("");
        setTimeout(() => setAssertiveMessage(message), 50);
      } else {
        setPoliteMessage("");
        setTimeout(() => setPoliteMessage(message), 50);
      }

      // Auto-clear after announcement is read
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = setTimeout(() => {
        setPoliteMessage("");
        setAssertiveMessage("");
      }, 5000);
    },
    [],
  );

  // Register the announce callback
  useEffect(() => {
    announceCallback = handleAnnounce;
    return () => {
      announceCallback = null;
    };
  }, [handleAnnounce]);

  const srOnly: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  };

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={srOnly}
      >
        {politeMessage}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={srOnly}
      >
        {assertiveMessage}
      </div>
    </>
  );
};

AriaLiveRegion.displayName = "AriaLiveRegion";

/* ---- useAnnounce hook ---- */

/**
 * Hook version of announce for components that want to announce
 * messages without importing the global function.
 */
export function useAnnounce() {
  return useCallback(
    (message: string, politeness: AriaLivePoliteness = "polite") => {
      announce(message, politeness);
    },
    [],
  );
}
