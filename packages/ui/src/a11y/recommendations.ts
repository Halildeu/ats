/* ------------------------------------------------------------------ */
/*  A11y Engine — Fix suggestions and checklists                       */
/*                                                                     */
/*  Provides actionable recommendations based on audit violations      */
/*  and component-type-specific accessibility checklists.              */
/* ------------------------------------------------------------------ */

import type { A11yViolation } from './types';

/* ---- Violation-to-recommendation mapping ---- */

const RULE_RECOMMENDATIONS: Record<string, string> = {
  'img-alt':
    'Add descriptive alt text to all informative images. Use alt="" for purely decorative images.',
  'button-name':
    'Ensure every button has visible text, an aria-label, or aria-labelledby. Icon-only buttons require aria-label.',
  'link-name':
    'Give every link descriptive text. Avoid generic "click here" — describe the destination.',
  'input-label':
    'Associate every input with a visible <label> using the for/id pattern, or add aria-label for visually hidden labels.',
  'html-lang':
    'Set the lang attribute on <html> to the primary language of the page (e.g. lang="en").',
  'color-contrast':
    'Ensure text meets WCAG AA contrast ratios: 4.5:1 for normal text, 3:1 for large text. Use a contrast checker tool.',
  'focus-visible':
    'Never remove focus outlines without providing an alternative. Use :focus-visible for keyboard-only styles.',
  'heading-order':
    'Maintain a logical heading hierarchy. Do not skip levels (e.g. h1 to h3). Use CSS for visual sizing.',
  'empty-heading':
    'Remove empty headings or add meaningful content. Screen readers announce heading levels.',
  'tabindex-positive':
    'Avoid tabindex > 0. Use DOM order for tab sequence. Use tabindex="0" for custom focusable elements.',
  'aria-roles':
    'Use native HTML elements (<button>, <a>) instead of adding role to <div>/<span> when possible.',
  'aria-valid-attr':
    'Remove or correct invalid ARIA attributes. Refer to the WAI-ARIA specification for valid attributes.',
  'landmark-regions':
    'Structure pages with landmarks: <header>, <nav>, <main>, <aside>, <footer>. Each page needs a <main>.',
  'duplicate-id':
    'Ensure all id values are unique within the page. Duplicate IDs break ARIA references.',
  'no-autoplay':
    'Avoid autoplaying media. If autoplay is necessary, provide pause/stop controls and keep it under 5 seconds.',
  'skip-nav':
    'Add a skip-to-content link as the first focusable element for keyboard users to bypass navigation.',
  'touch-target-size':
    'Make interactive elements at least 44x44px (WCAG 2.5.5). Use padding if the visual size must be smaller.',
  'prefers-reduced-motion':
    'Wrap animations in @media (prefers-reduced-motion: no-preference) or use Tailwind motion-safe: prefix.',
  'modal-focus-trap':
    'Trap focus inside modals using aria-modal="true" and JavaScript focus management. Return focus on close.',
  'aria-live-region':
    'Use aria-live="polite" for status updates and aria-live="assertive" for urgent alerts.',
  'table-headers':
    'Add <th> elements to data tables. Use scope="col" or scope="row" to associate headers with data.',
  'form-error-identification':
    'Link error messages to invalid inputs using aria-errormessage or aria-describedby.',
};

/* ---- Component checklists ---- */

const COMPONENT_CHECKLISTS: Record<string, string[]> = {
  button: [
    'Has visible text content or aria-label',
    'Uses <button> element (not <div> or <span>)',
    'Has type="button" to prevent form submission',
    'Disabled state uses aria-disabled, not just visual styling',
    'Loading state announces to screen readers with aria-busy',
    'Icon-only buttons have aria-label describing the action',
    'Focus indicator is visible on keyboard navigation',
    'Meets 44x44px minimum touch target size',
  ],

  menu: [
    'Menu trigger has aria-haspopup="true"',
    'Menu trigger has aria-expanded indicating state',
    'Menu container has role="menu"',
    'Menu items have role="menuitem"',
    'Arrow keys navigate between items',
    'Escape closes the menu and returns focus to trigger',
    'Home/End keys jump to first/last item',
    'Type-ahead selects matching items',
  ],

  dialog: [
    'Has role="dialog" or role="alertdialog"',
    'Has aria-modal="true" for modal dialogs',
    'Has an accessible name via aria-label or aria-labelledby',
    'Focus moves to the dialog on open',
    'Tab key cycles focus within the dialog',
    'Escape key closes the dialog',
    'Focus returns to the trigger element on close',
    'Background content is inert (aria-hidden or inert attribute)',
  ],

  accordion: [
    'Headers use <button> inside heading elements',
    'Buttons have aria-expanded indicating state',
    'Buttons have aria-controls pointing to the panel id',
    'Panels have role="region"',
    'Panels have aria-labelledby pointing to the header',
    'Arrow keys navigate between headers',
    'Enter/Space toggles panels',
    'Home/End keys jump to first/last header',
  ],

  tabs: [
    'Tab list has role="tablist"',
    'Tabs have role="tab"',
    'Tab panels have role="tabpanel"',
    'Selected tab has aria-selected="true"',
    'Tab has aria-controls pointing to panel id',
    'Panel has aria-labelledby pointing to tab',
    'Arrow keys navigate between tabs',
    'Only the active tab is in the tab order (tabindex="0")',
  ],

  tree: [
    'Tree container has role="tree"',
    'Tree items have role="treeitem"',
    'Groups have role="group"',
    'Expandable items have aria-expanded',
    'Arrow keys navigate and expand/collapse',
    'Multi-select trees use aria-multiselectable',
    'Selected items have aria-selected="true"',
    'Level is communicated via aria-level',
  ],

  combobox: [
    'Input has role="combobox"',
    'Input has aria-expanded indicating dropdown state',
    'Input has aria-autocomplete indicating behavior',
    'Input has aria-controls pointing to listbox id',
    'Listbox has role="listbox"',
    'Options have role="option"',
    'Active option indicated by aria-activedescendant',
    'Escape closes dropdown, Enter selects option',
  ],

  form: [
    'All inputs have associated labels',
    'Required fields marked with aria-required="true"',
    'Error messages linked via aria-errormessage or aria-describedby',
    'Invalid fields use aria-invalid="true"',
    'Form has an accessible name via aria-label or heading',
    'Submit button has descriptive text',
    'Field groups use <fieldset> and <legend>',
    'Validation errors announced to screen readers via aria-live',
  ],

  table: [
    'Has <th> elements for column/row headers',
    'Headers use scope="col" or scope="row"',
    'Complex tables use headers/id associations',
    'Has a caption or aria-label describing the table',
    'Sortable columns indicate sort direction with aria-sort',
    'Row selection uses aria-selected',
    'Pagination controls are keyboard accessible',
    'Empty state is communicated to screen readers',
  ],

  modal: [
    'Has role="dialog" and aria-modal="true"',
    'Has an accessible name (aria-label or aria-labelledby)',
    'Focus trapped inside while open',
    'Escape key closes the modal',
    'Focus returns to trigger on close',
    'Background content is hidden from screen readers',
    'Close button has aria-label if icon-only',
    'Announced to screen readers on open',
  ],

  input: [
    'Has an associated visible label',
    'Placeholder text does not replace the label',
    'Required state indicated with aria-required',
    'Error state uses aria-invalid and aria-errormessage',
    'Help text linked via aria-describedby',
    'Autocomplete attribute set for common fields',
    'Disabled state uses aria-disabled or disabled attribute',
    'Character counters announced to screen readers',
  ],
};

/* ---- Public API ---- */

/**
 * Generate prioritized recommendations from a list of violations.
 * Returns deduplicated, severity-ordered recommendations.
 */
export function getRecommendations(violations: A11yViolation[]): string[] {
  if (violations.length === 0) {
    return ['No violations found. Continue following WCAG guidelines for new features.'];
  }

  const severityOrder: Record<string, number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  };

  // Sort by severity, then deduplicate by rule
  const sorted = [...violations].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
  );

  const seen = new Set<string>();
  const recommendations: string[] = [];

  for (const violation of sorted) {
    if (seen.has(violation.rule)) continue;
    seen.add(violation.rule);

    const rec = RULE_RECOMMENDATIONS[violation.rule];
    if (rec) {
      recommendations.push(`[${violation.severity.toUpperCase()}] ${rec}`);
    } else {
      recommendations.push(`[${violation.severity.toUpperCase()}] ${violation.fix}`);
    }
  }

  return recommendations;
}

/**
 * Get a component-specific accessibility checklist.
 * Returns a generic checklist for unknown component types.
 */
export function getComponentA11yChecklist(componentType: string): string[] {
  const normalized = componentType.toLowerCase();
  const checklist = COMPONENT_CHECKLISTS[normalized];

  if (checklist) {
    return [...checklist];
  }

  // Generic checklist for unknown components
  return [
    'Has a visible focus indicator',
    'Is keyboard operable (Enter/Space activates)',
    'Has an accessible name (text, aria-label, or aria-labelledby)',
    'Color is not the only means of conveying information',
    'Meets minimum contrast ratios (4.5:1 for text)',
    'Touch targets are at least 44x44px',
    'Animations respect prefers-reduced-motion',
    'Dynamic content updates use aria-live regions',
  ];
}

/**
 * Get all supported component types for checklists.
 */
export function getSupportedChecklistTypes(): string[] {
  return Object.keys(COMPONENT_CHECKLISTS);
}
