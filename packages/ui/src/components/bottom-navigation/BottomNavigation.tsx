import React, { forwardRef, createContext, useContext, useCallback, useState } from 'react';
import { cn } from '../../utils/cn';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  BottomNavigation — Mobile tab bar (compound component)             */
/* ------------------------------------------------------------------ */

export interface BottomNavigationProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  /** Controlled active value. */
  value?: string;
  /** Default active value (uncontrolled). */
  defaultValue?: string;
  /** Change handler. */
  onChange?: (value: string) => void;
  /** Show text labels. @default true */
  showLabels?: boolean;
  /** Fixed to viewport bottom. @default true */
  fixed?: boolean;
}

export interface BottomNavigationItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  /** Unique value for this item. */
  value: string;
  /** Icon element. */
  icon: React.ReactNode;
  /** Text label. */
  label: string;
  /** Badge content (number or node). */
  badge?: React.ReactNode;
  /** Disable this item. */
  disabled?: boolean;
  /** Link target. Renders as anchor when provided. */
  href?: string;
}

/* ---- Context ---- */

type BottomNavContextValue = {
  activeValue: string | undefined;
  showLabels: boolean;
  onSelect: (value: string) => void;
};

const BottomNavContext = createContext<BottomNavContextValue>({
  activeValue: undefined,
  showLabels: true,
  onSelect: () => {},
});

/* ---- Root ---- */

const BottomNavigationRoot = forwardRef<HTMLElement, BottomNavigationProps>(
  function BottomNavigation(
    {
      value: controlledValue,
      defaultValue,
      onChange,
      showLabels = true,
      fixed = true,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const isControlled = controlledValue !== undefined;
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeValue = isControlled ? controlledValue : internalValue;

    const onSelect = useCallback(
      (val: string) => {
        if (!isControlled) setInternalValue(val);
        onChange?.(val);
      },
      [isControlled, onChange],
    );

    return (
      <BottomNavContext.Provider value={{ activeValue, showLabels, onSelect }}>
        <nav
          ref={ref}
          {...stateAttrs({ component: 'bottom-navigation' })}
          aria-label="Bottom navigation"
          className={cn(
            'flex items-stretch border-t border-border-subtle bg-surface-panel shadow-[0_-1px_3px_rgba(0,0,0,0.08)]',
            fixed && 'fixed inset-x-0 bottom-0 z-[1100]',
            className,
          )}
          {...rest}
        >
          {children}
        </nav>
      </BottomNavContext.Provider>
    );
  },
);

BottomNavigationRoot.displayName = 'BottomNavigation';

/* ---- Item ---- */

const BottomNavigationItem = forwardRef<HTMLButtonElement, BottomNavigationItemProps>(
  function BottomNavigationItem(
    { value, icon, label, badge, disabled = false, href, className, onClick, ...rest },
    ref,
  ) {
    const { activeValue, showLabels, onSelect } = useContext(BottomNavContext);
    const isActive = activeValue === value;

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        onSelect(value);
        onClick?.(e);
      },
      [disabled, onSelect, value, onClick],
    );

    const content = (
      <>
        <span className="relative inline-flex">
          <span className={cn('[&>svg]:h-5 [&>svg]:w-5', isActive ? 'text-action-primary' : 'text-text-secondary')}>
            {icon}
          </span>
          {badge != null && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-state-danger-text px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </span>
        {showLabels && (
          <span
            className={cn(
              'mt-0.5 text-[10px] font-medium leading-tight',
              isActive ? 'text-action-primary' : 'text-text-secondary',
            )}
          >
            {label}
          </span>
        )}
      </>
    );

    const sharedClasses = cn(
      'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-(--motion-duration-fast)',
      'outline-none focus-visible:bg-surface-muted',
      isActive && 'bg-action-primary/5',
      disabled && 'pointer-events-none opacity-40',
      className,
    );

    if (href && !disabled) {
      return (
        <a
          href={href}
          className={sharedClasses}
          aria-current={isActive ? 'page' : undefined}
          aria-label={label}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        className={sharedClasses}
        {...rest}
      >
        {content}
      </button>
    );
  },
);

BottomNavigationItem.displayName = 'BottomNavigation.Item';

/* ---- Compound assembly ---- */

type CompoundBottomNavigation = typeof BottomNavigationRoot & {
  Item: typeof BottomNavigationItem;
};

export const BottomNavigation = BottomNavigationRoot as CompoundBottomNavigation;
BottomNavigation.Item = BottomNavigationItem;
