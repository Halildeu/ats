/* ------------------------------------------------------------------ */
/*  Color tokens                                                       */
/*                                                                     */
/*  Semantic color aliases consumed via CSS custom properties.          */
/*  Raw palette values come from Figma (design-tokens/).               */
/* ------------------------------------------------------------------ */

/** Core palette — raw values (reference only, prefer semantic tokens) */
export const palette = {
  white: '#ffffff',
  black: '#000000',

  /* Neutrals */
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  /* Primary */
  primary50: '#eff6ff',
  primary100: '#dbeafe',
  primary200: '#bfdbfe',
  primary300: '#93c5fd',
  primary400: '#60a5fa',
  primary500: '#3b82f6',
  primary600: '#2563eb',
  primary700: '#1d4ed8',
  primary800: '#1e40af',
  primary900: '#1e3a8a',

  /* Success */
  green50: '#f0fdf4',
  green500: '#22c55e',
  green700: '#15803d',
  green950: '#052e16',

  /* Warning */
  amber50: '#fffbeb',
  amber500: '#f59e0b',
  amber700: '#b45309',
  amber950: '#451a03',

  /* Error / Danger */
  red50: '#fef2f2',
  red500: '#ef4444',
  red700: '#b91c1c',
  red950: '#450a0a',

  /* Info */
  blue50: '#eff6ff',
  blue500: '#3b82f6',
  blue700: '#1d4ed8',
  blue950: '#172554',
} as const;

/** Semantic token contract — maps intent to CSS custom property names */
export const semanticColorTokens = {
  /* Surfaces */
  'surface-default': '--surface-default',
  'surface-canvas': '--surface-canvas',
  'surface-muted': '--surface-muted',
  'surface-raised': '--surface-raised',

  /* Text */
  'text-primary': '--text-primary',
  'text-secondary': '--text-secondary',
  'text-disabled': '--text-disabled',
  'text-inverse': '--text-inverse',

  /* Borders */
  'border-default': '--border-default',
  'border-subtle': '--border-subtle',
  'border-strong': '--border-strong',

  /* Actions */
  'action-primary': '--action-primary',
  'action-primary-hover': '--action-primary-hover',
  'action-primary-active': '--action-primary-active',
  'action-secondary': '--action-secondary',

  /* State */
  'state-success-bg': '--state-success-bg',
  'state-success-text': '--state-success-text',
  'state-warning-bg': '--state-warning-bg',
  'state-warning-text': '--state-warning-text',
  'state-error-bg': '--state-danger-bg',
  'state-error-text': '--state-danger-text',
  'state-info-bg': '--state-info-bg',
  'state-info-text': '--state-info-text',
} as const;

export type SemanticColorToken = keyof typeof semanticColorTokens;
