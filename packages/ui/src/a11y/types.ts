/* ------------------------------------------------------------------ */
/*  A11y Engine — Type definitions                                     */
/*                                                                     */
/*  Core types for WCAG audit results, keyboard navigation testing,    */
/*  and component accessibility reports.                               */
/* ------------------------------------------------------------------ */

export type A11ySeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export type A11yViolation = {
  /** Rule identifier (e.g. "img-alt", "button-name") */
  rule: string;
  /** Impact severity */
  severity: A11ySeverity;
  /** CSS selector or description of the offending element */
  element: string;
  /** Human-readable description of the issue */
  description: string;
  /** Suggested fix */
  fix: string;
  /** WCAG success criterion (e.g. "1.1.1", "2.1.1") */
  wcagCriteria: string;
};

export type A11yAuditResult = {
  /** Number of rules that passed */
  passed: number;
  /** Number of rules that failed */
  failed: number;
  /** Number of warnings (moderate/minor issues) */
  warnings: number;
  /** List of violations found */
  violations: A11yViolation[];
  /** Overall accessibility score 0-100 */
  score: number;
  /** Human-readable summary */
  summary: string;
};

export type KeyboardNavTest = {
  /** Key or key combination (e.g. "Enter", "ArrowDown", "Shift+Tab") */
  key: string;
  /** What should happen when the key is pressed */
  expectedAction: string;
  /** Whether the test passed */
  passed: boolean;
  /** Actual observed behavior (populated during testing) */
  actual?: string;
};

export type A11yComponentReport = {
  /** Name of the component being audited */
  componentName: string;
  /** DOM audit results */
  audit: A11yAuditResult;
  /** Keyboard navigation test results */
  keyboardNav: KeyboardNavTest[];
  /** Map of ARIA attributes found on the root element */
  ariaAttributes: Record<string, string>;
  /** Actionable recommendations */
  recommendations: string[];
};

/** Supported component types for keyboard contracts */
export type A11yComponentType =
  | 'button'
  | 'menu'
  | 'dialog'
  | 'accordion'
  | 'tabs'
  | 'tree'
  | 'combobox'
  | 'listbox'
  | 'slider'
  | 'checkbox'
  | 'radio-group';

/** A single audit rule definition */
export type A11yRule = {
  id: string;
  description: string;
  severity: A11ySeverity;
  wcagCriteria: string;
  check: (root: HTMLElement) => A11yViolation[];
};
