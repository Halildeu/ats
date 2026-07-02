import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { focusRingClass, stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CalendarEvent {
  date: Date;
  color?: string;
  label?: string;
}

export interface CalendarLocaleText {
  months?: string[];
  weekdays?: string[];
  weekdaysShort?: string[];
  today?: string;
  previousMonth?: string;
  nextMonth?: string;
}

export type CalendarMode = 'single' | 'multiple' | 'range';
export type CalendarSize = 'sm' | 'md' | 'lg';

export interface CalendarProps extends AccessControlledProps {
  /** Selected date(s) */
  value?: Date | Date[] | null;
  /** Default value */
  defaultValue?: Date | null;
  /** Selection mode */
  mode?: CalendarMode;
  /** Current viewed month */
  month?: Date;
  /** Default month to display */
  defaultMonth?: Date;
  /** Min selectable date */
  minDate?: Date;
  /** Max selectable date */
  maxDate?: Date;
  /** Disabled specific dates */
  disabledDates?: (date: Date) => boolean;
  /** Highlight specific dates */
  highlightedDates?: Date[];
  /** First day of week (0=Sun, 1=Mon) */
  firstDayOfWeek?: 0 | 1;
  /** Show week numbers */
  showWeekNumbers?: boolean;
  /** Size */
  size?: CalendarSize;
  /** Show outside days (prev/next month) */
  showOutsideDays?: boolean;
  /** Number of months to display */
  numberOfMonths?: 1 | 2 | 3;
  /** Custom day render */
  renderDay?: (date: Date) => React.ReactNode;
  /** Event dots/badges per day */
  events?: CalendarEvent[];
  /** Locale text */
  localeText?: CalendarLocaleText;
  /** Called when value changes */
  onValueChange?: (value: Date | Date[] | null) => void;
  /** Called when displayed month changes */
  onMonthChange?: (month: Date) => void;
  /** Additional CSS class */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------
 */

const DEFAULT_MONTHS = [
  'Ocak',
  'Subat',
  'Mart',
  'Nisan',
  'Mayis',
  'Haziran',
  'Temmuz',
  'Agustos',
  'Eylul',
  'Ekim',
  'Kasim',
  'Aralik',
];

const DEFAULT_WEEKDAYS = [
  'Pazar',
  'Pazartesi',
  'Sali',
  'Carsamba',
  'Persembe',
  'Cuma',
  'Cumartesi',
];

const DEFAULT_WEEKDAYS_SHORT = ['Pz', 'Pt', 'Sa', 'Ca', 'Pe', 'Cu', 'Ct'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getWeekNumber(d: Date): number {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const jan4 = new Date(target.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((target.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  );
}

function addMonths(d: Date, n: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return result;
}

/** Build a 6-row grid of dates for a given month. */
function buildMonthGrid(year: number, month: number, firstDayOfWeek: 0 | 1): Date[][] {
  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay() - firstDayOfWeek;
  if (startDay < 0) startDay += 7;

  const daysInMonth = getDaysInMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);

  const grid: Date[][] = [];
  let day = 1;
  let nextMonthDay = 1;

  for (let row = 0; row < 6; row++) {
    const week: Date[] = [];
    for (let col = 0; col < 7; col++) {
      const cellIndex = row * 7 + col;
      if (cellIndex < startDay) {
        // Previous month
        const prevDate = daysInPrevMonth - startDay + cellIndex + 1;
        week.push(new Date(year, month - 1, prevDate));
      } else if (day <= daysInMonth) {
        week.push(new Date(year, month, day));
        day++;
      } else {
        // Next month
        week.push(new Date(year, month + 1, nextMonthDay));
        nextMonthDay++;
      }
    }
    grid.push(week);
  }

  return grid;
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const d = startOfDay(date).getTime();
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  const min = Math.min(s, e);
  const max = Math.max(s, e);
  return d >= min && d <= max;
}

function isRangeStart(date: Date, start: Date, end: Date): boolean {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const earlier = isBefore(s, e) ? s : e;
  return isSameDay(date, earlier);
}

function isRangeEnd(date: Date, start: Date, end: Date): boolean {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const later = isAfter(s, e) ? s : e;
  return isSameDay(date, later);
}

/* ------------------------------------------------------------------ */
/*  Size configs                                                       */
/* ------------------------------------------------------------------ */

const SIZE_MAP: Record<
  CalendarSize,
  { cell: string; header: string; wrapper: string; text: string; weekNum: string }
> = {
  sm: {
    cell: 'h-6 w-6 text-[10px] sm:h-7 sm:w-7 sm:text-xs',
    header: 'text-xs px-1 py-1 sm:px-2',
    wrapper: 'gap-0.5 p-1 sm:gap-1 sm:p-2',
    text: 'text-xs',
    weekNum: 'w-5 text-[10px] sm:w-6',
  },
  md: {
    cell: 'h-7 w-7 text-xs sm:h-9 sm:w-9 sm:text-sm',
    header: 'text-xs px-2 py-1 sm:text-sm sm:px-3 sm:py-2',
    wrapper: 'gap-1 p-2 sm:gap-1.5 sm:p-3',
    text: 'text-xs sm:text-sm',
    weekNum: 'w-6 text-[10px] sm:w-8 sm:text-xs',
  },
  lg: {
    cell: 'h-9 w-9 text-sm sm:h-11 sm:w-11 sm:text-base',
    header: 'text-sm px-3 py-2 sm:text-base sm:px-4 sm:py-3',
    wrapper: 'gap-1.5 p-3 sm:gap-2 sm:p-4',
    text: 'text-sm sm:text-base',
    weekNum: 'w-8 text-xs sm:w-10 sm:text-sm',
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------
 * @example
 * ```tsx
 * <Calendar />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/calendar)
 */
export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(function Calendar(
  {
    value,
    defaultValue,
    mode = 'single',
    month: controlledMonth,
    defaultMonth,
    minDate,
    maxDate,
    disabledDates,
    highlightedDates,
    firstDayOfWeek = 1,
    showWeekNumbers = false,
    size = 'md',
    showOutsideDays = true,
    numberOfMonths = 1,
    renderDay,
    events,
    localeText,
    onValueChange,
    onMonthChange,
    className,
    access = 'full',
    accessReason,
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);

  /* ---- Locale ---- */
  const months = localeText?.months ?? DEFAULT_MONTHS;
  const weekdaysShort = localeText?.weekdaysShort ?? DEFAULT_WEEKDAYS_SHORT;
  const _todayLabel = localeText?.today ?? 'Bugun';
  const prevMonthLabel = localeText?.previousMonth ?? 'Onceki ay';
  const nextMonthLabel = localeText?.nextMonth ?? 'Sonraki ay';

  /* ---- Reorder weekdays based on firstDayOfWeek ---- */
  const orderedWeekdays = React.useMemo(() => {
    const days = [...weekdaysShort];
    if (firstDayOfWeek === 1) {
      const sun = days.shift()!;
      days.push(sun);
    }
    return days;
  }, [weekdaysShort, firstDayOfWeek]);

  /* ---- Internal state ---- */
  const today = React.useMemo(() => startOfDay(new Date()), []);
  const isControlledValue = value !== undefined;
  const isControlledMonth = controlledMonth !== undefined;

  const [internalValue, setInternalValue] = React.useState<Date | Date[] | null>(() => {
    if (defaultValue) return startOfDay(defaultValue);
    return null;
  });

  const [internalMonth, setInternalMonth] = React.useState<Date>(() => {
    if (controlledMonth)
      return new Date(controlledMonth.getFullYear(), controlledMonth.getMonth(), 1);
    if (defaultMonth) return new Date(defaultMonth.getFullYear(), defaultMonth.getMonth(), 1);
    if (defaultValue) return new Date(defaultValue.getFullYear(), defaultValue.getMonth(), 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // For range mode: track the first selected date before the second click
  const [rangeAnchor, setRangeAnchor] = React.useState<Date | null>(null);
  // For range hover preview
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  const currentValue = isControlledValue ? value : internalValue;
  const currentMonth = isControlledMonth
    ? new Date(controlledMonth!.getFullYear(), controlledMonth!.getMonth(), 1)
    : internalMonth;

  /* ---- Focused date for keyboard navigation ---- */
  const [focusedDate, setFocusedDate] = React.useState<Date | null>(null);
  const gridRef = React.useRef<HTMLTableElement>(null);

  /* ---- Sync controlled month ---- */
  React.useEffect(() => {
    if (isControlledMonth && controlledMonth) {
      setInternalMonth(new Date(controlledMonth.getFullYear(), controlledMonth.getMonth(), 1));
    }
  }, [isControlledMonth, controlledMonth]);

  /* ---- Navigation ---- */
  const navigateMonth = React.useCallback(
    (delta: number) => {
      const next = addMonths(currentMonth, delta);
      if (!isControlledMonth) {
        setInternalMonth(next);
      }
      onMonthChange?.(next);
    },
    [currentMonth, isControlledMonth, onMonthChange],
  );

  /* ---- Selection ---- */
  const isDateDisabled = React.useCallback(
    (date: Date): boolean => {
      if (accessState.isDisabled || accessState.isReadonly) return true;
      if (minDate && isBefore(startOfDay(date), startOfDay(minDate))) return true;
      if (maxDate && isAfter(startOfDay(date), startOfDay(maxDate))) return true;
      if (disabledDates?.(date)) return true;
      return false;
    },
    [accessState.isDisabled, accessState.isReadonly, minDate, maxDate, disabledDates],
  );

  const isDateSelected = React.useCallback(
    (date: Date): boolean => {
      if (!currentValue) return false;
      if (Array.isArray(currentValue)) {
        return currentValue.some((d) => isSameDay(d, date));
      }
      return isSameDay(currentValue, date);
    },
    [currentValue],
  );

  const isDateHighlighted = React.useCallback(
    (date: Date): boolean => {
      if (!highlightedDates) return false;
      return highlightedDates.some((d) => isSameDay(d, date));
    },
    [highlightedDates],
  );

  const getEventsForDate = React.useCallback(
    (date: Date): CalendarEvent[] => {
      if (!events) return [];
      return events.filter((e) => isSameDay(e.date, date));
    },
    [events],
  );

  const selectDate = React.useCallback(
    (date: Date) => {
      if (isDateDisabled(date)) return;

      const d = startOfDay(date);

      if (mode === 'single') {
        const next = d;
        if (!isControlledValue) setInternalValue(next);
        onValueChange?.(next);
      } else if (mode === 'multiple') {
        const prev = Array.isArray(currentValue)
          ? currentValue
          : currentValue
            ? [currentValue]
            : [];
        const exists = prev.findIndex((p) => isSameDay(p, d));
        let next: Date[];
        if (exists >= 0) {
          next = prev.filter((_, i) => i !== exists);
        } else {
          next = [...prev, d];
        }
        if (!isControlledValue) setInternalValue(next);
        onValueChange?.(next);
      } else if (mode === 'range') {
        if (!rangeAnchor) {
          // First click: set anchor
          setRangeAnchor(d);
          if (!isControlledValue) setInternalValue([d]);
          onValueChange?.([d]);
        } else {
          // Second click: set range
          const start = isBefore(rangeAnchor, d) ? rangeAnchor : d;
          const end = isAfter(rangeAnchor, d) ? rangeAnchor : d;
          const range = [start, end];
          setRangeAnchor(null);
          setHoverDate(null);
          if (!isControlledValue) setInternalValue(range);
          onValueChange?.(range);
        }
      }
    },
    [mode, currentValue, isControlledValue, onValueChange, rangeAnchor, isDateDisabled],
  );

  /* ---- Keyboard ---- */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (accessState.isDisabled || accessState.isReadonly) return;

      const focused = focusedDate ?? today;
      let next: Date | null;

      switch (e.key) {
        case 'ArrowLeft':
          next = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() - 1);
          break;
        case 'ArrowRight':
          next = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() + 1);
          break;
        case 'ArrowUp':
          next = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() - 7);
          break;
        case 'ArrowDown':
          next = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() + 7);
          break;
        case 'Home':
          // First day of current week
          {
            const dow = focused.getDay();
            const diff = dow - firstDayOfWeek;
            const offset = diff < 0 ? diff + 7 : diff;
            next = new Date(focused.getFullYear(), focused.getMonth(), focused.getDate() - offset);
          }
          break;
        case 'End':
          // Last day of current week
          {
            const dow = focused.getDay();
            const diff = dow - firstDayOfWeek;
            const offset = diff < 0 ? diff + 7 : diff;
            next = new Date(
              focused.getFullYear(),
              focused.getMonth(),
              focused.getDate() + (6 - offset),
            );
          }
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          selectDate(focused);
          return;
        default:
          return;
      }

      if (next) {
        e.preventDefault();
        setFocusedDate(next);
        // Adjust month if needed
        if (
          next.getMonth() !== currentMonth.getMonth() ||
          next.getFullYear() !== currentMonth.getFullYear()
        ) {
          const newMonth = new Date(next.getFullYear(), next.getMonth(), 1);
          if (!isControlledMonth) setInternalMonth(newMonth);
          onMonthChange?.(newMonth);
        }
      }
    },
    [
      focusedDate,
      today,
      firstDayOfWeek,
      selectDate,
      currentMonth,
      isControlledMonth,
      onMonthChange,
      accessState,
    ],
  );

  /* ---- Focus management ---- */
  React.useEffect(() => {
    if (!focusedDate || !gridRef.current) return;
    const dateStr = `${focusedDate.getFullYear()}-${focusedDate.getMonth()}-${focusedDate.getDate()}`;
    const btn = gridRef.current.querySelector<HTMLButtonElement>(`[data-date="${dateStr}"]`);
    btn?.focus();
  }, [focusedDate]);

  /* ---- Render guard ---- */
  if (accessState.isHidden) {
    return null;
  }

  const sizeConfig = SIZE_MAP[size];

  /* ---- Range helpers ---- */
  const rangeValue =
    mode === 'range' && Array.isArray(currentValue) && currentValue.length === 2
      ? (currentValue as [Date, Date])
      : null;

  const rangePreview =
    mode === 'range' && rangeAnchor && hoverDate
      ? ([rangeAnchor, hoverDate] as [Date, Date])
      : null;

  const activeRange = rangeValue ?? rangePreview;

  /* ---- Build month panels ---- */
  const monthPanels = Array.from({ length: numberOfMonths }, (_, i) => {
    const panelMonth = addMonths(currentMonth, i);
    const year = panelMonth.getFullYear();
    const monthIdx = panelMonth.getMonth();
    const grid = buildMonthGrid(year, monthIdx, firstDayOfWeek);
    return { year, monthIdx, grid, panelMonth };
  });

  return (
    <div
      ref={forwardedRef}
      data-access-state={accessState.state}
      className={cn(
        'inline-flex flex-wrap rounded-lg border border-border-default bg-[var(--surface-card)]',
        accessState.isDisabled && 'pointer-events-none opacity-50',
        accessState.isReadonly && 'pointer-events-none',
        className,
      )}
      role="group"
      aria-label="Calendar"
      title={accessReason}
      {...stateAttrs({ component: 'calendar', disabled: accessState.isDisabled })}
      data-testid="calendar"
    >
      {monthPanels.map(({ year, monthIdx, grid, panelMonth: _panelMonth }, panelIndex) => (
        <div
          key={`${year}-${monthIdx}`}
          className={cn(
            'flex flex-col',
            sizeConfig.wrapper,
            panelIndex > 0 && 'border-t border-border-default',
          )}
        >
          {/* ---- Header ---- */}
          <div className={cn('flex items-center justify-between', sizeConfig.header)}>
            {panelIndex === 0 ? (
              <button
                type="button"
                onClick={() => navigateMonth(-1)}
                className={cn(
                  'inline-flex items-center justify-center rounded-md transition-colors',
                  `hover:bg-[var(--surface-hover)] ${focusRingClass('ring')}`,
                  sizeConfig.cell,
                )}
                aria-label={prevMonthLabel}
                data-testid="calendar-prev"
              >
                <ChevronLeftIcon />
              </button>
            ) : (
              <span className={sizeConfig.cell} />
            )}

            <span
              className={cn('font-semibold text-text-primary select-none', sizeConfig.text)}
              aria-live="polite"
              data-testid="calendar-title"
            >
              {months[monthIdx]} {year}
            </span>

            {panelIndex === numberOfMonths - 1 ? (
              <button
                type="button"
                onClick={() => navigateMonth(1)}
                className={cn(
                  'inline-flex items-center justify-center rounded-md transition-colors',
                  `hover:bg-[var(--surface-hover)] ${focusRingClass('ring')}`,
                  sizeConfig.cell,
                )}
                aria-label={nextMonthLabel}
                data-testid="calendar-next"
              >
                <ChevronRightIcon />
              </button>
            ) : (
              <span className={sizeConfig.cell} />
            )}
          </div>

          {/* ---- Grid ---- */}
          <table
            ref={panelIndex === 0 ? gridRef : undefined}
            role="grid"
            aria-label={`${months[monthIdx]} ${year}`}
            className="border-collapse"
          >
            <thead>
              <tr role="row">
                {showWeekNumbers && (
                  <th className={cn('text-center text-[var(--text-tertiary)]', sizeConfig.weekNum)}>
                    #
                  </th>
                )}
                {orderedWeekdays.map((day, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      'text-center font-medium text-text-secondary select-none',
                      sizeConfig.cell,
                    )}
                    aria-label={
                      (localeText?.weekdays ?? DEFAULT_WEEKDAYS)[
                        firstDayOfWeek === 1 ? (i + 1) % 7 : i
                      ]
                    }
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, rowIdx) => {
                // Hide rows that are entirely outside the month if !showOutsideDays
                const allOutside = week.every((d) => d.getMonth() !== monthIdx);
                if (allOutside && !showOutsideDays) return null;

                return (
                  <tr key={rowIdx} role="row">
                    {showWeekNumbers && (
                      <td
                        className={cn(
                          'text-center text-[var(--text-tertiary)] select-none',
                          sizeConfig.weekNum,
                        )}
                      >
                        {getWeekNumber(week[0])}
                      </td>
                    )}
                    {week.map((date, colIdx) => {
                      const isOutside = date.getMonth() !== monthIdx;
                      const isToday_ = isSameDay(date, today);
                      const isSelected = isDateSelected(date);
                      const isDisabled = isDateDisabled(date);
                      const isHighlighted = isDateHighlighted(date);
                      const dayEvents = getEventsForDate(date);
                      const isFocused = focusedDate ? isSameDay(date, focusedDate) : false;

                      const inRange = activeRange
                        ? isDateInRange(date, activeRange[0], activeRange[1])
                        : false;
                      const isStart = activeRange
                        ? isRangeStart(date, activeRange[0], activeRange[1])
                        : false;
                      const isEnd = activeRange
                        ? isRangeEnd(date, activeRange[0], activeRange[1])
                        : false;

                      if (isOutside && !showOutsideDays) {
                        return <td key={colIdx} role="gridcell" className={sizeConfig.cell} />;
                      }

                      const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

                      return (
                        <td key={colIdx} role="gridcell" className="p-0">
                          <button
                            type="button"
                            tabIndex={isFocused ? 0 : -1}
                            data-date={dateStr}
                            disabled={isDisabled}
                            onClick={() => selectDate(date)}
                            onMouseEnter={() => {
                              if (mode === 'range' && rangeAnchor) {
                                setHoverDate(date);
                              }
                            }}
                            onFocus={() => setFocusedDate(date)}
                            onKeyDown={handleKeyDown}
                            aria-selected={isSelected || undefined}
                            aria-disabled={isDisabled || undefined}
                            aria-current={isToday_ ? 'date' : undefined}
                            aria-label={`${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`}
                            className={cn(
                              'relative inline-flex flex-col items-center justify-center rounded-md transition-colors',
                              `${focusRingClass('ring')} focus-visible:z-10`,
                              sizeConfig.cell,
                              // Outside month
                              isOutside && 'text-[var(--text-tertiary)] opacity-40',
                              // Default
                              !isSelected &&
                                !isOutside &&
                                !isDisabled &&
                                'text-text-primary hover:bg-[var(--surface-hover)]',
                              // Today ring
                              isToday_ &&
                                !isSelected &&
                                'ring-1 ring-inset ring-[var(--action-primary-bg)] font-semibold',
                              // Selected
                              isSelected &&
                                'bg-[var(--action-primary-bg)] text-action-primary-text font-semibold',
                              // Highlighted
                              isHighlighted &&
                                !isSelected &&
                                'bg-[var(--surface-accent)] text-text-primary',
                              // Range
                              inRange &&
                                !isSelected &&
                                !isStart &&
                                !isEnd &&
                                'bg-[color-mix(in_oklab,var(--action-primary-bg)_10%,transparent)] rounded-none',
                              isStart && inRange && 'rounded-r-none',
                              isEnd && inRange && 'rounded-l-none',
                              // Disabled
                              isDisabled &&
                                'text-[var(--text-disabled)] cursor-not-allowed opacity-50',
                            )}
                          >
                            {renderDay ? renderDay(date) : <span>{date.getDate()}</span>}
                            {/* Event dots */}
                            {dayEvents.length > 0 && (
                              <span className="absolute bottom-0.5 flex gap-0.5">
                                {dayEvents.slice(0, 3).map((evt, ei) => (
                                  <span
                                    key={ei}
                                    className="block h-1 w-1 rounded-full"
                                    style={{
                                      backgroundColor: evt.color ?? 'var(--action-primary-bg)',
                                    }}
                                    title={evt.label}
                                  />
                                ))}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
});

Calendar.displayName = 'Calendar';

/* ------------------------------------------------------------------ */
/*  Inline SVG icons (no external dependency)                          */
/* ------------------------------------------------------------------ */

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default Calendar;
