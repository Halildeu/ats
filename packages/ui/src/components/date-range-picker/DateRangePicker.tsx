import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

export interface DateRange {
  start: Date;
  end: Date;
}

export type PresetKey = 'today' | 'last7d' | 'last30d' | 'last90d' | 'ytd' | 'lastYear';

export interface DateRangePreset {
  key: PresetKey;
  label: string;
  getRange: () => DateRange;
}

/** Props for the DateRangePicker component. */
export interface DateRangePickerProps extends AccessControlledProps {
  /** Controlled value */
  value?: DateRange;
  /** Change handler */
  onChange?: (range: DateRange) => void;
  /** Locale for date formatting (default 'en-US') */
  locale?: string;
  /** Disable specific presets */
  disabledPresets?: PresetKey[];
  /** Min selectable date */
  minDate?: Date;
  /** Max selectable date */
  maxDate?: Date;
  /** Placeholder when no range selected */
  placeholder?: string;
  /** Additional class names */
  className?: string;
}

// ── Helpers ──

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function buildPresets(): DateRangePreset[] {
  const now = new Date();
  const today = startOfDay(now);

  return [
    {
      key: 'today',
      label: 'Today',
      getRange: () => ({ start: today, end: endOfDay(now) }),
    },
    {
      key: 'last7d',
      label: 'Last 7d',
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { start, end: endOfDay(now) };
      },
    },
    {
      key: 'last30d',
      label: 'Last 30d',
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { start, end: endOfDay(now) };
      },
    },
    {
      key: 'last90d',
      label: 'Last 90d',
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 89);
        return { start, end: endOfDay(now) };
      },
    },
    {
      key: 'ytd',
      label: 'YTD',
      getRange: () => ({
        start: new Date(now.getFullYear(), 0, 1),
        end: endOfDay(now),
      }),
    },
    {
      key: 'lastYear',
      label: 'Last Year',
      getRange: () => ({
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      }),
    },
  ];
}

function formatDateDisplay(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function formatRangeLabel(range: DateRange, locale: string): string {
  return `${formatDateDisplay(range.start, locale)} — ${formatDateDisplay(range.end, locale)}`;
}

function toInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromInputValue(s: string): Date | null {
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function clampDate(d: Date, min?: Date, max?: Date): Date {
  let result = d;
  if (min && result < min) result = min;
  if (max && result > max) result = max;
  return result;
}

// ── Component ──

/**
 * Dual-input date range selector with preset shortcuts, comparison toggle, and calendar panel.
 *
 * @example
 * ```tsx
 * <DateRangePicker
 *   value={{ start: new Date('2025-01-01'), end: new Date('2025-03-31') }}
 *   onChange={(range) => setDateRange(range)}
 *   placeholder="Select a date range"
 * />
 * ```
 */
export const DateRangePicker = React.forwardRef<HTMLDivElement, DateRangePickerProps>(
  (
    {
      value,
      onChange,
      locale = 'en-US',
      disabledPresets = [],
      minDate,
      maxDate,
      placeholder = 'Select date range',
      className,
      access,
      accessReason,
    },
    forwardedRef,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const [open, setOpen] = React.useState(false);
    const [activePreset, setActivePreset] = React.useState<PresetKey | null>(null);
    const [customStart, setCustomStart] = React.useState('');
    const [customEnd, setCustomEnd] = React.useState('');
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const mergedRef = (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    const presets = React.useMemo(() => buildPresets(), []);
    const isInteractive = accessState.state === 'full';

    // Sync custom inputs when value changes externally
    React.useEffect(() => {
      if (value) {
        setCustomStart(toInputValue(value.start));
        setCustomEnd(toInputValue(value.end));
      }
    }, [value]);

    // Close on outside click
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape and return focus to trigger
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const handlePresetClick = (preset: DateRangePreset) => {
      if (!isInteractive) return;
      const range = preset.getRange();
      const clamped: DateRange = {
        start: clampDate(range.start, minDate, maxDate),
        end: clampDate(range.end, minDate, maxDate),
      };
      setActivePreset(preset.key);
      onChange?.(clamped);
      setOpen(false);
    };

    const handleCustomApply = () => {
      if (!isInteractive) return;
      const s = fromInputValue(customStart);
      const e = fromInputValue(customEnd);
      if (!s || !e || s > e) return;

      const range: DateRange = {
        start: clampDate(startOfDay(s), minDate, maxDate),
        end: clampDate(endOfDay(e), minDate, maxDate),
      };
      setActivePreset(null);
      onChange?.(range);
      setOpen(false);
    };

    const displayText = value ? formatRangeLabel(value, locale) : placeholder;

    return (
      <div
        ref={mergedRef}
        className={cn('relative inline-block', accessStyles(accessState.state), className)}
        data-component="date-range-picker"
        data-access-state={accessState.state}
        title={accessReason}
      >
        {/* Trigger button */}
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
            'border-border-default bg-surface-default',
            'hover:border-[var(--interactive-primary)] focus:outline-hidden focus:ring-2 focus:ring-[color-mix(in_oklab,var(--interactive-primary)_30%,transparent)]',
            'transition-colors',
            !isInteractive && 'pointer-events-none',
          )}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={!isInteractive}
        >
          {/* Calendar icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect
              x="1"
              y="3"
              width="14"
              height="12"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
            <path d="M1 7h14" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className={cn('whitespace-nowrap', !value && 'text-[var(--text-tertiary)]')}>
            {displayText}
          </span>
          {/* Chevron */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={cn('transition-[rotate]', open && 'rotate-180')}
            aria-hidden="true"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className={cn(
              'absolute left-0 top-full z-50 mt-1 w-[340px] rounded-lg border shadow-lg',
              'border-border-default bg-surface-default',
              'animate-in fade-in slide-in-from-top-1',
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Tarih aralığı seçici"
          >
            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1.5 border-b border-border-default p-3">
              {presets.map((preset) => {
                const isDisabled = disabledPresets.includes(preset.key);
                const isActive = activePreset === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-[var(--interactive-primary)] text-text-inverse'
                        : 'bg-surface-muted text-text-secondary hover:bg-surface-muted/80',
                      isDisabled && 'opacity-40 cursor-not-allowed',
                    )}
                    onClick={() => !isDisabled && handlePresetClick(preset)}
                    disabled={isDisabled}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom range inputs */}
            <div className="p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                Custom Range
              </p>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <span className="sr-only">Start date</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    min={minDate ? toInputValue(minDate) : undefined}
                    max={customEnd || (maxDate ? toInputValue(maxDate) : undefined)}
                    className={cn(
                      'w-full rounded-md border px-2 py-1.5 text-sm',
                      'border-border-default bg-surface-default',
                      'focus:outline-hidden focus:ring-2 focus:ring-[color-mix(in_oklab,var(--interactive-primary)_30%,transparent)]',
                    )}
                    aria-label="Start date"
                  />
                </label>
                <span className="text-xs text-[var(--text-tertiary)]">to</span>
                <label className="flex-1">
                  <span className="sr-only">End date</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    min={customStart || (minDate ? toInputValue(minDate) : undefined)}
                    max={maxDate ? toInputValue(maxDate) : undefined}
                    className={cn(
                      'w-full rounded-md border px-2 py-1.5 text-sm',
                      'border-border-default bg-surface-default',
                      'focus:outline-hidden focus:ring-2 focus:ring-[color-mix(in_oklab,var(--interactive-primary)_30%,transparent)]',
                    )}
                    aria-label="End date"
                  />
                </label>
              </div>
              <button
                type="button"
                className={cn(
                  'mt-2 w-full rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  'bg-[var(--interactive-primary)] text-text-inverse',
                  'hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-[color-mix(in_oklab,var(--interactive-primary)_30%,transparent)]',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                )}
                onClick={handleCustomApply}
                disabled={!customStart || !customEnd}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

DateRangePicker.displayName = 'DateRangePicker';
export default DateRangePicker;
