/* ------------------------------------------------------------------ */
/*  A11y Engine — Barrel exports                                       */
/*                                                                     */
/*  Automated WCAG audit, fix suggestions, and keyboard navigation     */
/*  testing utilities for the design system.                           */
/* ------------------------------------------------------------------ */

/* ---- Types ---- */
export type {
  A11yViolation,
  A11yAuditResult,
  KeyboardNavTest,
  A11yComponentReport,
  A11yComponentType,
  A11yRule,
  A11ySeverity,
} from './types';

/* ---- Audit ---- */
export { auditElement, auditComponent, getAuditRules } from './audit';

/* ---- Keyboard ---- */
export {
  getKeyboardContract,
  testKeyboardNavigation,
  getSupportedComponentTypes,
  hasKeyboardContract,
} from './keyboard';

/* ---- Recommendations ---- */
export {
  getRecommendations,
  getComponentA11yChecklist,
  getSupportedChecklistTypes,
} from './recommendations';
