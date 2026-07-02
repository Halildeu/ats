import React, { useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingClass, stateAttrs } from "../../internal/interaction-core";
import { resolveAccessState, type AccessControlledProps } from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  MasterDetail — Split-pane layout: list on left, detail on right    */
/* ------------------------------------------------------------------ */

export type MasterDetailRatio = "1:2" | "1:3" | "2:3" | "1:1";

/** Props for the MasterDetail component.
 * @example
 * ```tsx
 * <MasterDetail />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/master-detail)
 */
export interface MasterDetailProps extends AccessControlledProps {
  /** Master (list) panel content */
  master: React.ReactNode;
  /** Detail panel content */
  detail: React.ReactNode;
  /** Empty state when no detail selected */
  detailEmpty?: React.ReactNode;
  /** Whether a detail item is selected (show detail vs empty) */
  hasSelection?: boolean;
  /** Split ratio */
  ratio?: MasterDetailRatio;
  /** Master panel header */
  masterHeader?: React.ReactNode;
  /** Detail panel header */
  detailHeader?: React.ReactNode;
  /** Collapsible master panel */
  collapsible?: boolean;
  /** Divider between panels */
  divider?: boolean;
  /** Min width of master panel in px */
  masterMinWidth?: number;
  className?: string;
}

const ratioMap: Record<MasterDetailRatio, { master: string; detail: string }> = {
  "1:2": { master: "w-1/3", detail: "w-2/3" },
  "1:3": { master: "w-1/4", detail: "w-3/4" },
  "2:3": { master: "w-2/5", detail: "w-3/5" },
  "1:1": { master: "w-1/2", detail: "w-1/2" },
};

/** Split-pane layout with a list panel on the left and a detail panel on the right. */
export const MasterDetail = React.forwardRef<HTMLDivElement, MasterDetailProps>(({
  master,
  detail,
  detailEmpty,
  hasSelection = true,
  ratio = "1:3",
  masterHeader,
  detailHeader,
  collapsible = false,
  divider = true,
  masterMinWidth = 240,
  className,
  access,
  accessReason,
}, ref) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;
  const [collapsed, setCollapsed] = useState(false);
  const sizes = ratioMap[ratio];

  return (
    <div ref={ref} className={cn("flex h-full overflow-hidden", accessState.isDisabled && "pointer-events-none opacity-50", className)} title={accessReason} {...stateAttrs({ component: "master-detail" })}>
      {/* Master panel */}
      <div
        data-access-state={accessState.state}
        className={cn(
          "flex flex-col overflow-hidden transition-all",
          collapsed ? "w-0" : sizes.master,
        )}
        style={{ minWidth: collapsed ? 0 : masterMinWidth }}
      >
        {masterHeader && (
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="min-w-0 flex-1">{masterHeader}</div>
            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className={cn(
                  "ms-2 rounded-lg p-1 text-[var(--text-tertiary)]",
                  "hover:bg-[var(--surface-hover)] hover:text-text-primary",
                  focusRingClass("ring"),
                )}
                aria-label="Collapse panel"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{master}</div>
      </div>

      {/* Divider */}
      {divider && !collapsed && (
        <div className="w-px shrink-0 bg-border-subtle" />
      )}

      {/* Expand button when collapsed */}
      {collapsed && collapsible && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={cn(
            "shrink-0 flex items-center justify-center w-6",
            "bg-surface-default border-e border-border-subtle",
            "text-[var(--text-tertiary)] hover:text-text-primary hover:bg-[var(--surface-hover)]",
            focusRingClass("ring"),
            "transition-colors",
          )}
          aria-label="Expand panel"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {/* Detail panel */}
      <div className={cn("flex flex-col overflow-hidden", collapsed ? "flex-1" : sizes.detail)}>
        {detailHeader && (
          <div className="border-b border-border-subtle px-4 py-3">
            {detailHeader}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {hasSelection ? detail : (detailEmpty ?? (
            <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
              <p className="text-sm">Select an item to view details</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

MasterDetail.displayName = "MasterDetail";
