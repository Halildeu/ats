import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  _accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingProps extends AccessControlledProps {
  /** Current value (0-max). Makes the component controlled. */
  value?: number;
  /** Default value for uncontrolled usage. */
  defaultValue?: number;
  /** Maximum number of stars. @default 5 */
  max?: number;
  /** Allow half-star precision. @default false */
  allowHalf?: boolean;
  /** Allow clearing by clicking the current value. @default true */
  allowClear?: boolean;
  /** Visual size variant. @default "md" */
  size?: RatingSize;
  /** Custom filled icon. */
  icon?: React.ReactNode;
  /** Custom empty icon. */
  emptyIcon?: React.ReactNode;
  /** Custom half icon (used when allowHalf is true). */
  halfIcon?: React.ReactNode;
  /** Array of colors applied per value (index 0 = value 1). */
  colors?: string[];
  /** Show numeric value label beside the stars. @default false */
  showValue?: boolean;
  /** Formatter for the value label. */
  valueFormatter?: (value: number) => string;
  /** Description labels keyed by value (e.g. { 1: "Kotu", 5: "Mukemmel" }). */
  labels?: Record<number, string>;
  /** Called when value changes. */
  onValueChange?: (value: number) => void;
  /** Called when hovered value changes. null when hover ends. */
  onHoverChange?: (value: number | null) => void;
  /** Additional class name for the root element. */
  className?: string;
  /** Accessible label for the rating group. @default "Degerlendirme" */
  'aria-label'?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------
 */

const SIZE_PX: Record<RatingSize, number> = {
  sm: 16,
  md: 20,
  lg: 28,
};

/* ------------------------------------------------------------------ */
/*  Default SVG icons                                                  */
/* ------------------------------------------------------------------ */

const StarFilled: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={color}
    stroke={color}
    strokeWidth={1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const StarEmpty: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const StarHalf: React.FC<{ size: number; filledColor: string; emptyColor: string }> = ({
  size,
  filledColor,
  emptyColor,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="star-half-left">
        <rect x="0" y="0" width="12" height="24" />
      </clipPath>
      <clipPath id="star-half-right">
        <rect x="12" y="0" width="12" height="24" />
      </clipPath>
    </defs>
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      fill={filledColor}
      stroke={filledColor}
      strokeWidth={1}
      clipPath="url(#star-half-left)"
    />
    <polygon
      points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      fill="none"
      stroke={emptyColor}
      strokeWidth={1.5}
      clipPath="url(#star-half-right)"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------
 * @example
 * ```tsx
 * <Rating />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/rating)
 */
export const Rating = React.forwardRef<HTMLDivElement, RatingProps>(function Rating(
  {
    value,
    defaultValue = 0,
    max = 5,
    allowHalf = false,
    allowClear = true,
    size = 'md',
    icon,
    emptyIcon,
    halfIcon,
    colors,
    showValue = false,
    valueFormatter,
    labels,
    onValueChange,
    onHoverChange,
    className,
    access = 'full',
    accessReason,
    'aria-label': ariaLabel = 'Degerlendirme',
    ...rest
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);

  // Controlled vs uncontrolled
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = isControlled ? value : internalValue;

  // Hover state
  const [hoverValue, setHoverValue] = React.useState<number | null>(null);
  const displayValue = hoverValue ?? currentValue;

  const px = SIZE_PX[size];
  const step = allowHalf ? 0.5 : 1;

  const filledColor = 'var(--rating-filled)';
  const emptyColor = 'var(--rating-empty))';

  const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

  /* ---- value helpers ---- */
  const commitValue = React.useCallback(
    (next: number) => {
      if (!isControlled) setInternalValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  /* ---- colour resolver ---- */
  const getColor = React.useCallback(
    (starIndex: number) => {
      if (!colors || colors.length === 0) return filledColor;
      const idx = clamp(starIndex, 0, colors.length - 1);
      return colors[idx];
    },
    [colors, filledColor],
  );

  /* ---- hover helpers ---- */
  const handleStarHover = React.useCallback(
    (starValue: number) => {
      if (!isInteractive) return;
      setHoverValue(starValue);
      onHoverChange?.(starValue);
    },
    [isInteractive, onHoverChange],
  );

  const handleMouseLeave = React.useCallback(() => {
    if (!isInteractive) return;
    setHoverValue(null);
    onHoverChange?.(null);
  }, [isInteractive, onHoverChange]);

  /* ---- click ---- */
  const handleStarClick = React.useCallback(
    (starValue: number) => {
      if (!isInteractive) return;
      if (allowClear && starValue === currentValue) {
        commitValue(0);
      } else {
        commitValue(starValue);
      }
    },
    [isInteractive, allowClear, currentValue, commitValue],
  );

  /* ---- keyboard ---- */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isInteractive) return;

      let next: number;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          e.preventDefault();
          next = clamp(currentValue + step, 0, max);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          e.preventDefault();
          next = clamp(currentValue - step, 0, max);
          break;
        case 'Home':
          e.preventDefault();
          next = 0;
          break;
        case 'End':
          e.preventDefault();
          next = max;
          break;
        default:
          return;
      }
      commitValue(next);
    },
    [isInteractive, currentValue, step, max, commitValue],
  );

  /* ---- half-star mouse position ---- */
  const getHoverValueFromEvent = React.useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, starIndex: number) => {
      if (!allowHalf) return starIndex + 1;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      return x < rect.width / 2 ? starIndex + 0.5 : starIndex + 1;
    },
    [allowHalf],
  );

  /* ---- hidden ---- */
  if (accessState.isHidden) return null;

  /* ---- render star ---- */
  const renderStar = (index: number) => {
    const starNumber = index + 1;
    const isFull = displayValue >= starNumber;
    const isHalfStar = allowHalf && !isFull && displayValue >= starNumber - 0.5;
    const color = getColor(index);

    const checked = currentValue === starNumber || (allowHalf && currentValue === starNumber - 0.5);

    let starContent: React.ReactNode;
    if (isFull) {
      starContent = icon ?? <StarFilled size={px} color={color} />;
    } else if (isHalfStar) {
      starContent = halfIcon ?? <StarHalf size={px} filledColor={color} emptyColor={emptyColor} />;
    } else {
      starContent = emptyIcon ?? <StarEmpty size={px} color={emptyColor} />;
    }

    return (
      <span
        key={index}
        role="radio"
        aria-checked={checked}
        aria-label={`${starNumber} ${starNumber === 1 ? 'yildiz' : 'yildiz'}`}
        tabIndex={-1}
        data-access-state={accessState.state}
        className={cn(
          'inline-flex cursor-pointer transition-transform duration-(--motion-duration-fast)',
          !isInteractive && 'cursor-default',
          accessState.isDisabled && 'opacity-50 cursor-not-allowed',
        )}
        data-star-index={index}
        onMouseMove={(e) => {
          if (!isInteractive) return;
          const val = getHoverValueFromEvent(e, index);
          handleStarHover(val);
        }}
        onClick={() => {
          if (!isInteractive) return;
          const val = hoverValue ?? starNumber;
          handleStarClick(val);
        }}
      >
        {starContent}
      </span>
    );
  };

  const resolvedLabel = labels?.[Math.ceil(displayValue)];
  const formattedValue = valueFormatter ? valueFormatter(displayValue) : `${displayValue}`;

  return (
    <div
      ref={forwardedRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={accessState.isDisabled || undefined}
      aria-readonly={accessState.isReadonly || undefined}
      title={accessReason}
      tabIndex={isInteractive ? 0 : undefined}
      className={cn('inline-flex items-center gap-1 text-text-primary', className)}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {Array.from({ length: max }, (_, i) => renderStar(i))}

      {showValue && (
        <span className="ms-2 text-sm tabular-nums text-text-secondary" aria-live="polite">
          {formattedValue}
        </span>
      )}

      {resolvedLabel && (
        <span
          className="ms-2 text-sm text-text-secondary"
          data-testid="rating-label"
          aria-live="polite"
        >
          {resolvedLabel}
        </span>
      )}
    </div>
  );
});

Rating.displayName = 'Rating';

export default Rating;
