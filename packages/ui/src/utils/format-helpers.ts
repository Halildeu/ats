/* Format helpers — generic utility surface for value formatting, trend, tone */

import type { AccessLevel } from '../internal/access-controller';

// --- Formatting ---

export type NumberFormat = 'number' | 'currency' | 'percent' | 'duration' | 'compact';

export interface FormatOptions {
  format?: NumberFormat;
  currency?: string;
  locale?: string;
  decimals?: number;
}

export function formatValue(value: number, options: FormatOptions = {}): string {
  const { format = 'number', currency = 'TRY', locale = 'tr-TR', decimals } = options;

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 0,
      }).format(value);

    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals ?? 1,
        maximumFractionDigits: decimals ?? 1,
      }).format(value / 100);

    case 'compact':
      return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: decimals ?? 1,
      }).format(value);

    case 'duration': {
      const hours = Math.floor(value / 60);
      const mins = Math.round(value % 60);
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    }

    default:
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
  }
}

// --- Trend ---

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendInfo {
  direction: TrendDirection;
  value: number;
  label?: string;
}

export function getTrendColor(direction: TrendDirection, invertColors = false): string {
  if (direction === 'flat') return 'var(--text-secondary)';
  const isPositive = invertColors ? direction === 'down' : direction === 'up';
  return isPositive ? 'var(--state-success-text)' : 'var(--state-error-text)';
}

export function getTrendIcon(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'flat':
      return '→';
  }
}

// --- Tone ---

/**
 * Canonical status tone alias. Replaces legacy `EnterpriseTone` naming.
 * Tone names align with semantic state tokens (`--state-{success,warning,error,info}-*`).
 */
export type StatusTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

/** @deprecated Use `StatusTone` instead. Kept for backward compatibility. */
export type EnterpriseTone = StatusTone;

export function getToneClasses(tone: StatusTone): { bg: string; text: string; border: string } {
  const map: Record<StatusTone, { bg: string; text: string; border: string }> = {
    default: {
      bg: 'bg-[var(--surface-muted)]',
      text: 'text-[var(--text-primary)]',
      border: 'border-[var(--border-default)]',
    },
    success: {
      bg: 'bg-[var(--state-success-bg)]',
      text: 'text-[var(--state-success-text)]',
      border: 'border-[var(--state-success-border))]',
    },
    warning: {
      bg: 'bg-[var(--state-warning-bg)]',
      text: 'text-[var(--state-warning-text)]',
      border: 'border-[var(--state-warning-border))]',
    },
    danger: {
      bg: 'bg-[var(--state-error-bg)]',
      text: 'text-[var(--state-error-text)]',
      border: 'border-[var(--state-error-border))]',
    },
    info: {
      bg: 'bg-[var(--state-info-bg)]',
      text: 'text-[var(--state-info-text)]',
      border: 'border-[var(--state-info-border))]',
    },
  };
  return map[tone];
}

// Re-export for convenience
export type { AccessLevel };
