/* ------------------------------------------------------------------ */
/*  useSlider — Slider state management hook                           */
/*                                                                     */
/*  Manages slider value, min/max, step, keyboard control, and range  */
/*  mode with proper ARIA attributes per WAI-ARIA APG Slider pattern. */
/* ------------------------------------------------------------------ */

import { useState, useCallback, useId, useMemo } from "react";
import type React from "react";

/* ---- Types ---- */

export interface UseSliderOptions {
  /** Minimum value (default: 0) */
  min?: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Step increment (default: 1) */
  step?: number;
  /** Large step for PageUp/PageDown (default: step * 10) */
  largeStep?: number;
  /** Controlled value (single slider) */
  value?: number;
  /** Default value (uncontrolled single slider) */
  defaultValue?: number;
  /** Controlled range values [start, end] */
  rangeValue?: [number, number];
  /** Default range values (uncontrolled) */
  defaultRangeValue?: [number, number];
  /** Called when value changes */
  onValueChange?: (value: number) => void;
  /** Called when range values change */
  onRangeValueChange?: (values: [number, number]) => void;
  /** Orientation (default: "horizontal") */
  orientation?: "horizontal" | "vertical";
  /** Whether the slider is disabled */
  disabled?: boolean;
  /** Accessible label */
  "aria-label"?: string;
  /** ID of the labelling element */
  "aria-labelledby"?: string;
  /** Custom value text formatter */
  getValueText?: (value: number) => string;
}

export interface SliderTrackProps {
  role: "none";
  "data-orientation": "horizontal" | "vertical";
  "data-disabled": string | undefined;
}

export interface SliderThumbProps {
  role: "slider";
  "aria-valuemin": number;
  "aria-valuemax": number;
  "aria-valuenow": number;
  "aria-valuetext": string | undefined;
  "aria-orientation": "horizontal" | "vertical";
  "aria-disabled": boolean | undefined;
  "aria-label": string | undefined;
  "aria-labelledby": string | undefined;
  tabIndex: number;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

export interface UseSliderReturn {
  /** Current value (single mode) */
  value: number;
  /** Current range values (range mode) */
  rangeValues: [number, number];
  /** Whether in range mode */
  isRange: boolean;
  /** Value as percentage (0-100) for single mode */
  percentage: number;
  /** Range percentages [start, end] for range mode */
  rangePercentages: [number, number];
  /** Props for the track element */
  getTrackProps: () => SliderTrackProps;
  /** Props for the thumb (single mode) or specific thumb (range mode, index 0 or 1) */
  getThumbProps: (thumbIndex?: number) => SliderThumbProps;
  /** Set value programmatically */
  setValue: (value: number) => void;
  /** Set range values programmatically */
  setRangeValues: (values: [number, number]) => void;
  /** Increment by step */
  increment: (thumbIndex?: number) => void;
  /** Decrement by step */
  decrement: (thumbIndex?: number) => void;
}

/* ---- Helpers ---- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToStep(value: number, step: number, min: number): number {
  const rounded = Math.round((value - min) / step) * step + min;
  // Fix floating point precision
  const decimals = (step.toString().split(".")[1] || "").length;
  return Number(rounded.toFixed(decimals));
}

function toPercentage(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((value - min) / (max - min)) * 100;
}

/* ---- Hook ---- */

export function useSlider(options: UseSliderOptions = {}): UseSliderReturn {
  const {
    min = 0,
    max = 100,
    step = 1,
    largeStep,
    value: controlledValue,
    defaultValue,
    rangeValue: controlledRangeValue,
    defaultRangeValue,
    onValueChange,
    onRangeValueChange,
    orientation = "horizontal",
    disabled = false,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    getValueText,
  } = options;

  const _baseId = useId();
  const resolvedLargeStep = largeStep ?? step * 10;

  const isRange = controlledRangeValue !== undefined || defaultRangeValue !== undefined;

  // Single value state
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? min,
  );

  // Range value state
  const [internalRangeValue, setInternalRangeValue] = useState<[number, number]>(
    defaultRangeValue ?? [min, max],
  );

  const isValueControlled = controlledValue !== undefined;
  const value = isValueControlled ? controlledValue : internalValue;

  const isRangeControlled = controlledRangeValue !== undefined;
  const rangeValues: [number, number] = isRangeControlled ? controlledRangeValue : internalRangeValue;

  // Update single value
  const updateValue = useCallback(
    (raw: number) => {
      const clamped = clamp(roundToStep(raw, step, min), min, max);
      if (!isValueControlled) setInternalValue(clamped);
      onValueChange?.(clamped);
    },
    [min, max, step, isValueControlled, onValueChange],
  );

  // Update range values
  const updateRangeValues = useCallback(
    (values: [number, number]) => {
      const sorted: [number, number] = [
        clamp(roundToStep(Math.min(values[0], values[1]), step, min), min, max),
        clamp(roundToStep(Math.max(values[0], values[1]), step, min), min, max),
      ];
      if (!isRangeControlled) setInternalRangeValue(sorted);
      onRangeValueChange?.(sorted);
    },
    [min, max, step, isRangeControlled, onRangeValueChange],
  );

  const setValue = useCallback(
    (v: number) => updateValue(v),
    [updateValue],
  );

  const setRangeValues = useCallback(
    (v: [number, number]) => updateRangeValues(v),
    [updateRangeValues],
  );

  const increment = useCallback(
    (thumbIndex: number = 0) => {
      if (disabled) return;
      if (isRange) {
        const next: [number, number] = [...rangeValues];
        next[thumbIndex] = rangeValues[thumbIndex] + step;
        updateRangeValues(next);
      } else {
        updateValue(value + step);
      }
    },
    [disabled, isRange, rangeValues, value, step, updateValue, updateRangeValues],
  );

  const decrement = useCallback(
    (thumbIndex: number = 0) => {
      if (disabled) return;
      if (isRange) {
        const next: [number, number] = [...rangeValues];
        next[thumbIndex] = rangeValues[thumbIndex] - step;
        updateRangeValues(next);
      } else {
        updateValue(value - step);
      }
    },
    [disabled, isRange, rangeValues, value, step, updateValue, updateRangeValues],
  );

  const percentage = useMemo(() => toPercentage(value, min, max), [value, min, max]);
  const rangePercentages = useMemo<[number, number]>(
    () => [toPercentage(rangeValues[0], min, max), toPercentage(rangeValues[1], min, max)],
    [rangeValues, min, max],
  );

  // Prop getters
  const getTrackProps = useCallback(
    (): SliderTrackProps => ({
      role: "none",
      "data-orientation": orientation,
      "data-disabled": disabled ? "" : undefined,
    }),
    [orientation, disabled],
  );

  const getThumbProps = useCallback(
    (thumbIndex: number = 0): SliderThumbProps => {
      const thumbValue = isRange ? rangeValues[thumbIndex] : value;
      const isHorizontal = orientation === "horizontal";

      const handleKey = (event: React.KeyboardEvent) => {
        if (disabled) return;

        let handled = true;
        const incKey = isHorizontal ? "ArrowRight" : "ArrowUp";
        const decKey = isHorizontal ? "ArrowLeft" : "ArrowDown";

        switch (event.key) {
          case incKey:
          case "ArrowUp":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = rangeValues[thumbIndex] + step;
              updateRangeValues(next);
            } else {
              updateValue(value + step);
            }
            break;
          case decKey:
          case "ArrowDown":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = rangeValues[thumbIndex] - step;
              updateRangeValues(next);
            } else {
              updateValue(value - step);
            }
            break;
          case "PageUp":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = rangeValues[thumbIndex] + resolvedLargeStep;
              updateRangeValues(next);
            } else {
              updateValue(value + resolvedLargeStep);
            }
            break;
          case "PageDown":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = rangeValues[thumbIndex] - resolvedLargeStep;
              updateRangeValues(next);
            } else {
              updateValue(value - resolvedLargeStep);
            }
            break;
          case "Home":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = min;
              updateRangeValues(next);
            } else {
              updateValue(min);
            }
            break;
          case "End":
            if (isRange) {
              const next: [number, number] = [...rangeValues];
              next[thumbIndex] = max;
              updateRangeValues(next);
            } else {
              updateValue(max);
            }
            break;
          default:
            handled = false;
        }

        if (handled) {
          event.preventDefault();
        }
      };

      return {
        role: "slider",
        "aria-valuemin": min,
        "aria-valuemax": max,
        "aria-valuenow": thumbValue,
        "aria-valuetext": getValueText ? getValueText(thumbValue) : undefined,
        "aria-orientation": orientation,
        "aria-disabled": disabled || undefined,
        "aria-label": ariaLabel,
        "aria-labelledby": ariaLabelledBy,
        tabIndex: disabled ? -1 : 0,
        onKeyDown: handleKey,
      };
    },
    [
      isRange, rangeValues, value, orientation, disabled, min, max, step,
      resolvedLargeStep, ariaLabel, ariaLabelledBy, getValueText,
      updateValue, updateRangeValues,
    ],
  );

  return useMemo(
    () => ({
      value,
      rangeValues,
      isRange,
      percentage,
      rangePercentages,
      getTrackProps,
      getThumbProps,
      setValue,
      setRangeValues,
      increment,
      decrement,
    }),
    [
      value, rangeValues, isRange, percentage, rangePercentages,
      getTrackProps, getThumbProps, setValue, setRangeValues,
      increment, decrement,
    ],
  );
}
