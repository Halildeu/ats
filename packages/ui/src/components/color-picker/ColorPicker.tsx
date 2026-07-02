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

export type ColorPickerFormat = 'hex' | 'rgb' | 'hsl';
export type ColorPickerSize = 'sm' | 'md' | 'lg';

export interface ColorPickerPreset {
  label: string;
  colors: string[];
}

export interface ColorPickerProps extends AccessControlledProps {
  /** Controlled color value (hex string). */
  value?: string;
  /** Default value for uncontrolled usage. @default "var(--action-primary)" */
  defaultValue?: string;
  /** Display format for the input. @default "hex" */
  format?: ColorPickerFormat;
  /** Preset color palettes. */
  presets?: ColorPickerPreset[];
  /** Show the text input for manual entry. @default true */
  showInput?: boolean;
  /** Show preset palettes section. @default true */
  showPresets?: boolean;
  /** Visual size variant. @default "md" */
  size?: ColorPickerSize;
  /** Callback when color changes. */
  onValueChange?: (color: string) => void;
  /** Label displayed above the picker. */
  label?: string;
  /** Description text displayed below the label. */
  description?: string;
  /** Additional class name for the root element. */
  className?: string;
  /** Accessible label. @default "Renk secici" */
  'aria-label'?: string;
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------
 */

const SIZE_MAP: Record<ColorPickerSize, { swatch: number; presetSwatch: number; font: string }> = {
  sm: { swatch: 24, presetSwatch: 20, font: 'text-xs' },
  md: { swatch: 32, presetSwatch: 24, font: 'text-sm' },
  lg: { swatch: 40, presetSwatch: 28, font: 'text-base' },
};

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6 && cleaned.length !== 3) return null;
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const num = parseInt(full, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function formatColor(hex: string, format: ColorPickerFormat): string {
  if (format === 'hex') return hex;
  if (format === 'rgb') {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }
  if (format === 'hsl') {
    const hsl = hexToHsl(hex);
    if (!hsl) return hex;
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  }
  return hex;
}

function isValidHex(str: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str);
}

function hsvToHex(h: number, s: number, v: number): string {
  const sNorm = s / 100;
  const vNorm = v / 100;
  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vNorm - c;
  let r: number;
  let g: number;
  let b: number;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  return rgbToHex(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, v: 0 };
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------
 * @example
 * ```tsx
 * <ColorPicker />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/color-picker)
 */
export const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(function ColorPicker(
  {
    value,
    defaultValue = 'var(--action-primary)',
    format = 'hex',
    presets,
    showInput = true,
    showPresets = true,
    size = 'md',
    onValueChange,
    label,
    description,
    className,
    access = 'full',
    accessReason,
    'aria-label': ariaLabel = 'Renk secici',
    ...rest
  },
  forwardedRef,
) {
  const accessState = resolveAccessState(access);
  const isInteractive = !accessState.isReadonly && !accessState.isDisabled;

  // Controlled vs uncontrolled
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = isControlled ? value : internalValue;

  // Popover open state
  const [isOpen, setIsOpen] = React.useState(false);

  // Ref for the trigger button (focus management)
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Ref for the popup panel
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Text input state
  const [inputValue, setInputValue] = React.useState(formatColor(currentValue, format));

  // Keep input in sync with value changes
  React.useEffect(() => {
    setInputValue(formatColor(currentValue, format));
  }, [currentValue, format]);

  // HSV derived from current color (for the gradient picker)
  const hsv = React.useMemo(() => hexToHsv(currentValue), [currentValue]);

  const commitColor = React.useCallback(
    (hex: string) => {
      if (!isControlled) setInternalValue(hex);
      onValueChange?.(hex);
    },
    [isControlled, onValueChange],
  );

  // Focus the first interactive element when popup opens
  React.useEffect(() => {
    if (isOpen && popoverRef.current) {
      const firstFocusable = popoverRef.current.querySelector<HTMLElement>(
        'input, button, [tabindex="0"]',
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  const handleSwatchClick = () => {
    if (!isInteractive) return;
    setIsOpen((prev) => !prev);
  };

  const handleSwatchKeyDown = (e: React.KeyboardEvent) => {
    if (!isInteractive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  };

  /** Close popup on Escape; trap focus inside the dialog. */
  const handlePopoverKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    // Basic focus trap on Tab
    if (e.key === 'Tab' && popoverRef.current) {
      const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
        'input, button, [tabindex="0"]',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handlePresetClick = (color: string) => {
    if (!isInteractive) return;
    commitColor(color);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isInteractive) return;
    const val = e.target.value;
    setInputValue(val);

    // Try to parse and commit
    if (format === 'hex' && isValidHex(val)) {
      const normalized =
        val.length === 4 ? `#${val[1]}${val[1]}${val[2]}${val[2]}${val[3]}${val[3]}` : val;
      commitColor(normalized.toLowerCase());
    }
  };

  const handleInputBlur = () => {
    // Reset to current value if input is invalid
    setInputValue(formatColor(currentValue, format));
  };

  // Hue slider change
  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isInteractive) return;
    const newHue = parseInt(e.target.value, 10);
    const newHex = hsvToHex(newHue, hsv.s, hsv.v);
    commitColor(newHex);
  };

  // Saturation-Value gradient click
  const handleGradientClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const newS = x * 100;
    const newV = (1 - y) * 100;
    const newHex = hsvToHex(hsv.h, newS, newV);
    commitColor(newHex);
  };

  if (accessState.isHidden) return null;

  const sizeConfig = SIZE_MAP[size];

  return (
    <div
      ref={forwardedRef}
      data-access-state={accessState.state}
      className={cn('inline-flex flex-col gap-1', className)}
      title={accessReason}
      aria-label={ariaLabel}
      role="group"
      {...stateAttrs({
        component: 'color-picker',
        state: isOpen ? 'open' : 'closed',
        disabled: accessState.isDisabled,
      })}
      data-testid="color-picker-root"
      {...rest}
    >
      {/* Label */}
      {label && (
        <span
          className={cn('font-medium text-text-primary', sizeConfig.font)}
          data-testid="color-picker-label"
        >
          {label}
        </span>
      )}

      {/* Description */}
      {description && (
        <span
          className={cn('text-text-secondary', size === 'sm' ? 'text-[11px]' : 'text-xs')}
          data-testid="color-picker-description"
        >
          {description}
        </span>
      )}

      {/* Swatch trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'rounded-md border-2 border-border-subtle transition-all duration-(--motion-duration-fast)',
          focusRingClass('ring'),
          isInteractive && 'cursor-pointer hover:border-[var(--border-hover)]',
          accessState.isDisabled && 'opacity-50 cursor-not-allowed',
          !isInteractive && !accessState.isDisabled && 'cursor-default',
        )}
        style={{
          width: sizeConfig.swatch,
          height: sizeConfig.swatch,
          backgroundColor: currentValue,
        }}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={`Secili renk: ${formatColor(currentValue, format)}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-disabled={accessState.isDisabled || undefined}
        onClick={handleSwatchClick}
        onKeyDown={handleSwatchKeyDown}
        data-testid="color-picker-swatch"
      />

      {/* Popover panel */}
      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            'mt-1 rounded-lg border border-border-subtle',
            'bg-[var(--surface-primary)] p-3 shadow-lg',
            'flex flex-col gap-3',
            'w-full max-w-[232px]',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Renk secimi"
          onKeyDown={handlePopoverKeyDown}
          data-testid="color-picker-popover"
        >
          {/* Saturation-Value gradient */}
          <div
            className="relative w-full rounded-xs cursor-crosshair"
            style={{
              maxWidth: 200,
              height: 150,
              background: `
                  linear-gradient(to top, var(--text-primary), transparent),
                  linear-gradient(to right, var(--surface-default), hsl(${hsv.h}, 100%, 50%))
                `,
            }}
            onClick={handleGradientClick}
            role="slider"
            aria-label="Doygunluk ve parlaklik"
            aria-valuetext={`Doygunluk ${Math.round(hsv.s)}%, Parlaklik ${Math.round(hsv.v)}%`}
            tabIndex={isInteractive ? 0 : -1}
            data-testid="color-picker-gradient"
          >
            {/* Indicator dot */}
            <div
              className="absolute w-3 h-3 rounded-full border-2 border-surface-default shadow-xs pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: currentValue,
              }}
              data-testid="color-picker-indicator"
            />
          </div>

          {/* Hue slider */}
          <input
            type="range"
            min={0}
            max={360}
            value={Math.round(hsv.h)}
            onChange={handleHueChange}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{
              background:
                'linear-gradient(to right, var(--state-danger-text), var(--state-warning-text), var(--state-success-text), var(--state-info-text), var(--action-primary), var(--action-primary), var(--state-danger-text))',
            }}
            aria-label="Ton"
            data-testid="color-picker-hue"
          />

          {/* Text input */}
          {showInput && (
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-xs border border-border-subtle"
                style={{ backgroundColor: currentValue }}
                data-testid="color-picker-preview"
              />
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                className={cn(
                  'flex-1 rounded-xs border border-border-subtle px-2 py-1',
                  'bg-[var(--surface-primary)] text-text-primary',
                  'focus:outline-hidden focus:ring-1 focus:ring-[var(--focus-outline)]',
                  sizeConfig.font,
                  'font-mono',
                )}
                aria-label="Renk degeri"
                data-testid="color-picker-input"
              />
            </div>
          )}

          {/* Preset palettes */}
          {showPresets && presets && presets.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="color-picker-presets">
              {presets.map((preset) => (
                <div key={preset.label}>
                  <span
                    className={cn(
                      'block mb-1 text-text-secondary',
                      size === 'sm' ? 'text-[11px]' : 'text-xs',
                    )}
                    data-testid={`color-picker-preset-label-${preset.label}`}
                  >
                    {preset.label}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {preset.colors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          'rounded-xs border transition-[scale] duration-(--motion-duration-fast)',
                          `hover:scale-110 ${focusRingClass('ring')}`,
                          color.toLowerCase() === currentValue.toLowerCase()
                            ? 'border-[var(--border-active)] ring-1 ring-[var(--focus-outline)]'
                            : 'border-border-subtle',
                        )}
                        style={{
                          width: sizeConfig.presetSwatch,
                          height: sizeConfig.presetSwatch,
                          backgroundColor: color,
                        }}
                        aria-label={`Renk: ${color}`}
                        onClick={() => handlePresetClick(color)}
                        data-testid={`color-picker-preset-${color}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ColorPicker.displayName = 'ColorPicker';

export default ColorPicker;
