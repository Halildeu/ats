import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

export type LayoutTheme = 'executive' | 'operations' | 'analytics' | 'compact';

export interface ThemeLayoutSlots {
  header?: React.ReactNode;
  charts?: React.ReactNode[];
  grid?: React.ReactNode;
  sidebar?: React.ReactNode;
  footer?: React.ReactNode;
}

/** Slot-based dashboard layout that adapts its grid arrangement to the selected theme.
 * @example
 * ```tsx
 * <ThemeLayout />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/theme-layout)
 */
export interface ThemeLayoutProps extends AccessControlledProps {
  /** Layout theme controlling grid arrangement and density. */
  theme: LayoutTheme;
  /** Named content slots (header, charts, grid, sidebar, footer). */
  slots: ThemeLayoutSlots;
  /** Additional CSS class names for the root element. */
  className?: string;
  /** Access level controlling visibility and interactivity. */
  access?: import('../../internal/access-controller').AccessLevel;
  /** Tooltip text explaining access restrictions. */
  accessReason?: string;
  /** Data attribute for test automation. */
  'data-testid'?: string;
}

// ── Layout renderers ──

function renderExecutive(slots: ThemeLayoutSlots): React.ReactNode {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Header: full width */}
      {slots.header && <div className="col-span-12">{slots.header}</div>}

      {/* Charts: 2 per row, 6 cols each */}
      {slots.charts && slots.charts.length > 0 && (
        <>
          {slots.charts.map((chart, i) => (
            <div key={i} className="col-span-12 sm:col-span-6">
              {chart}
            </div>
          ))}
        </>
      )}

      {/* Grid: full width */}
      {slots.grid && <div className="col-span-12">{slots.grid}</div>}

      {/* Footer: full width */}
      {slots.footer && <div className="col-span-12">{slots.footer}</div>}
    </div>
  );
}

function renderOperations(slots: ThemeLayoutSlots): React.ReactNode {
  return (
    <div className="grid grid-cols-12 gap-3">
      {/* Header: full width */}
      {slots.header && <div className="col-span-12">{slots.header}</div>}

      {/* Charts: 4 per row, 3 cols each */}
      {slots.charts && slots.charts.length > 0 && (
        <>
          {slots.charts.map((chart, i) => (
            <div key={i} className="col-span-12 sm:col-span-6 lg:col-span-3">
              {chart}
            </div>
          ))}
        </>
      )}

      {/* Grid: split into two 6-col halves */}
      {slots.grid && <div className="col-span-12">{slots.grid}</div>}

      {/* Sidebar if provided */}
      {slots.sidebar && <div className="col-span-12 lg:col-span-4">{slots.sidebar}</div>}

      {/* Footer */}
      {slots.footer && <div className="col-span-12">{slots.footer}</div>}
    </div>
  );
}

function renderAnalytics(slots: ThemeLayoutSlots): React.ReactNode {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Header: full width */}
      {slots.header && <div className="col-span-12">{slots.header}</div>}

      {/* Main content area: sidebar 3-col + main 9-col */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        {/* Sidebar */}
        {slots.sidebar && (
          <div className="col-span-12 lg:col-span-3 order-2 lg:order-1">{slots.sidebar}</div>
        )}

        {/* Main area */}
        <div
          className={cn(
            'col-span-12 order-1 lg:order-2',
            slots.sidebar ? 'lg:col-span-9' : 'lg:col-span-12',
          )}
        >
          {/* Charts: full width within main */}
          {slots.charts && slots.charts.length > 0 && (
            <div className="grid grid-cols-1 gap-4 mb-4">
              {slots.charts.map((chart, i) => (
                <div key={i}>{chart}</div>
              ))}
            </div>
          )}

          {/* Grid: full width within main */}
          {slots.grid && <div>{slots.grid}</div>}
        </div>
      </div>

      {/* Footer */}
      {slots.footer && <div className="col-span-12">{slots.footer}</div>}
    </div>
  );
}

function renderCompact(slots: ThemeLayoutSlots): React.ReactNode {
  return (
    <div className="grid grid-cols-12 gap-2">
      {/* Header: full width, compact */}
      {slots.header && <div className="col-span-12">{slots.header}</div>}

      {/* Charts: dense, 4 per row on desktop */}
      {slots.charts && slots.charts.length > 0 && (
        <>
          {slots.charts.map((chart, i) => (
            <div key={i} className="col-span-6 sm:col-span-4 lg:col-span-3">
              {chart}
            </div>
          ))}
        </>
      )}

      {/* Grid */}
      {slots.grid && <div className="col-span-12">{slots.grid}</div>}

      {/* Sidebar */}
      {slots.sidebar && <div className="col-span-12 lg:col-span-3">{slots.sidebar}</div>}

      {/* Footer */}
      {slots.footer && <div className="col-span-12">{slots.footer}</div>}
    </div>
  );
}

// ── Theme styling ──

const THEME_STYLES: Record<LayoutTheme, string> = {
  executive: 'p-6 text-base',
  operations: 'p-4 text-sm',
  analytics: 'p-5 text-sm',
  compact: 'p-2 text-xs [&_*]:leading-tight',
};

const RENDERERS: Record<LayoutTheme, (slots: ThemeLayoutSlots) => React.ReactNode> = {
  executive: renderExecutive,
  operations: renderOperations,
  analytics: renderAnalytics,
  compact: renderCompact,
};

// ── Component ──

/** Slot-based dashboard layout that adapts its grid arrangement to the selected theme. */
export const ThemeLayout = React.forwardRef<HTMLDivElement, ThemeLayoutProps>(
  ({ theme, slots, className, access, accessReason }, ref) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const render = RENDERERS[theme];
    const themeStyle = THEME_STYLES[theme];

    return (
      <div
        ref={ref}
        className={cn(
          'bg-surface-default text-text-primary rounded-lg',
          themeStyle,
          accessStyles(accessState.state),
          className,
        )}
        data-component="theme-layout"
        data-layout-theme={theme}
        data-access-state={accessState.state}
        title={accessReason}
      >
        {render(slots)}
      </div>
    );
  },
);

ThemeLayout.displayName = 'ThemeLayout';
export default ThemeLayout;
