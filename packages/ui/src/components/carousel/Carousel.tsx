import React from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState, _accessStyles,
  type AccessControlledProps,
} from "../../internal/access-controller";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CarouselProps extends AccessControlledProps {
  /** Slides to render. Each must have a unique key. */
  items: { key: React.Key; content: React.ReactNode }[];
  /** Enable auto-play. @default false */
  autoPlay?: boolean;
  /** Auto-play interval in ms. @default 5000 */
  autoPlayInterval?: number;
  /** Show dot indicators. @default true */
  showDots?: boolean;
  /** Show prev/next arrows. @default true */
  showArrows?: boolean;
  /** Loop back to start after last slide. @default true */
  loop?: boolean;
  /** Number of slides visible at once. @default 1 */
  slidesPerView?: 1 | 2 | 3;
  /** Gap between slides in px. @default 0 */
  gap?: number;
  /** Size variant. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Orientation. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** Called when active slide changes. */
  onSlideChange?: (index: number) => void;
  /** Additional class name for the root element. */
  className?: string;
  /** Accessible label for the carousel region. @default "Slayt gosterisi" */
  "aria-label"?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------
   */

const SIZE_HEIGHT: Record<"sm" | "md" | "lg", string> = {
  sm: "h-48",
  md: "h-64",
  lg: "h-96",
};

/* ------------------------------------------------------------------ */
/*  Arrow SVGs                                                         */
/* ------------------------------------------------------------------ */

const ChevronLeft: React.FC = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight: React.FC = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ 
 * @example
 * ```tsx
 * <Carousel />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/carousel)
 */
export const Carousel = React.forwardRef<HTMLDivElement, CarouselProps>(function Carousel(
  {
    items,
    autoPlay = false,
    autoPlayInterval = 5000,
    showDots = true,
    showArrows = true,
    loop = true,
    slidesPerView = 1,
    gap = 0,
    size = "md",
    orientation = "horizontal",
    onSlideChange,
    className,
    access = "full",
    accessReason,
    "aria-label": ariaLabel = "Slayt gosterisi",
    ...rest
  },
  forwardedRef,
) {
  if (access === 'hidden') return null;

  const accessState = resolveAccessState(access);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const isInteractive = !accessState.isReadonly && !accessState.isDisabled;
  const isHorizontal = orientation === "horizontal";
  const maxIndex = Math.max(0, items.length - slidesPerView);

  /* ---- navigation helpers ---- */
  const goTo = React.useCallback(
    (index: number) => {
      let next = index;
      if (next < 0) next = loop ? maxIndex : 0;
      if (next > maxIndex) next = loop ? 0 : maxIndex;
      setCurrentIndex(next);
      onSlideChange?.(next);
    },
    [maxIndex, loop, onSlideChange],
  );

  const goNext = React.useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);
  const goPrev = React.useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);

  /* ---- auto-play ---- */
  React.useEffect(() => {
    if (!autoPlay || isPaused || !isInteractive) return;
    timerRef.current = setInterval(goNext, autoPlayInterval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlay, isPaused, autoPlayInterval, goNext, isInteractive]);

  /* ---- keyboard ---- */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!isInteractive) return;
      const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";
      if (e.key === prevKey) {
        e.preventDefault();
        goPrev();
      } else if (e.key === nextKey) {
        e.preventDefault();
        goNext();
      }
    },
    [isInteractive, isHorizontal, goPrev, goNext],
  );

  /* ---- slide transform ---- */
  const slideWidthPercent = 100 / slidesPerView;
  const translateValue = -(currentIndex * slideWidthPercent);
  const transformProp = isHorizontal
    ? `translateX(${translateValue}%)`
    : `translateY(${translateValue}%)`;

  const canGoPrev = loop || currentIndex > 0;
  const canGoNext = loop || currentIndex < maxIndex;

  return (
    <div
      ref={forwardedRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      aria-disabled={accessState.isDisabled || undefined}
      aria-readonly={accessState.isReadonly || undefined}
      title={accessReason}
      tabIndex={isInteractive ? 0 : undefined}
      data-access-state={accessState.state}
      className={cn(
        "relative w-full overflow-hidden",
        "bg-surface-default text-text-primary",
        SIZE_HEIGHT[size],
        accessState.isDisabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {/* Slide track */}
      <div
        data-testid="carousel-track"
        className="h-full transition-transform duration-(--motion-duration-slow) ease-in-out"
        style={{
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          transform: transformProp,
          gap: `${gap}px`,
        }}
        aria-live="polite"
      >
        {items.map((item, idx) => (
          <div
            key={item.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slayt ${idx + 1} / ${items.length}`}
            className="h-full shrink-0"
            style={{
              width: isHorizontal ? `${slideWidthPercent}%` : "100%",
              height: isHorizontal ? "100%" : `${slideWidthPercent}%`,
            }}
          >
            {item.content}
          </div>
        ))}
      </div>

      {/* Arrows */}
      {showArrows && isInteractive && (
        <>
          <button
            type="button"
            aria-label="Onceki slayt"
            disabled={!canGoPrev}
            onClick={goPrev}
            className={cn(
              "absolute z-10 flex items-center justify-center rounded-full",
              "bg-surface-overlay text-text-primary",
              "shadow-xs hover:bg-[var(--surface-hover)]",
              "h-8 w-8 transition-opacity",
              isHorizontal ? "top-1/2 start-2 -translate-y-1/2" : "top-2 left-1/2 -translate-x-1/2 rotate-90",
              !canGoPrev && "opacity-30 cursor-not-allowed",
            )}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Sonraki slayt"
            disabled={!canGoNext}
            onClick={goNext}
            className={cn(
              "absolute z-10 flex items-center justify-center rounded-full",
              "bg-surface-overlay text-text-primary",
              "shadow-xs hover:bg-[var(--surface-hover)]",
              "h-8 w-8 transition-opacity",
              isHorizontal ? "top-1/2 end-2 -translate-y-1/2" : "bottom-2 left-1/2 -translate-x-1/2 rotate-90",
              !canGoNext && "opacity-30 cursor-not-allowed",
            )}
          >
            <ChevronRight />
          </button>
        </>
      )}

      {/* Dots */}
      {showDots && (
        <div
          role="tablist"
          aria-label="Slayt gostergeleri"
          className={cn(
            "absolute z-10 flex gap-1.5",
            isHorizontal
              ? "bottom-3 left-1/2 -translate-x-1/2"
              : "right-3 top-1/2 -translate-y-1/2 flex-col",
          )}
        >
          {Array.from({ length: maxIndex + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`Slayt ${i + 1}`}
              onClick={() => isInteractive && goTo(i)}
              className={cn(
                "h-2 w-2 rounded-full transition-all",
                "bg-[var(--surface-inverse)]",
                i === currentIndex ? "opacity-100 scale-125" : "opacity-40",
                !isInteractive && "cursor-default",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
});

Carousel.displayName = "Carousel";

export default Carousel;

/** Type alias for Carousel ref. */
export type CarouselRef = React.Ref<HTMLElement>;
/** Type alias for Carousel element. */
export type CarouselElement = HTMLElement;
/** Type alias for Carousel cssproperties. */
export type CarouselCSSProperties = React.CSSProperties;
