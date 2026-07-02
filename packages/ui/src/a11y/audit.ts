/* ------------------------------------------------------------------ */
/*  A11y Engine — Core audit engine                                    */
/*                                                                     */
/*  Implements 22 WCAG-aligned audit rules that inspect DOM elements    */
/*  and produce structured violation reports.                          */
/* ------------------------------------------------------------------ */

import type {
  A11yViolation,
  A11yAuditResult,
  A11yComponentReport,
  A11yRule,
  A11ySeverity,
} from './types';
import { getKeyboardContract, testKeyboardNavigation } from './keyboard';
import { getRecommendations } from './recommendations';

/* ---- Helpers ---- */

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const cls = el.className && typeof el.className === 'string'
    ? `.${el.className.split(/\s+/).slice(0, 2).join('.')}`
    : '';
  return `<${tag}${id}${cls}>`;
}

function getTextContent(el: Element): string {
  return (el.textContent ?? '').trim();
}

function hasAccessibleName(el: Element): boolean {
  const ariaLabel = el.getAttribute('aria-label');
  const ariaLabelledby = el.getAttribute('aria-labelledby');
  const title = el.getAttribute('title');
  const text = getTextContent(el);
  return !!(ariaLabel || ariaLabelledby || title || text);
}

/* ---- Valid ARIA attributes ---- */

const VALID_ARIA_ATTRIBUTES = new Set([
  'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-braillelabel',
  'aria-brailleroledescription', 'aria-busy', 'aria-checked', 'aria-colcount',
  'aria-colindex', 'aria-colindextext', 'aria-colspan', 'aria-controls',
  'aria-current', 'aria-describedby', 'aria-description', 'aria-details',
  'aria-disabled', 'aria-dropeffect', 'aria-errormessage', 'aria-expanded',
  'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid',
  'aria-keyshortcuts', 'aria-label', 'aria-labelledby', 'aria-level', 'aria-live',
  'aria-modal', 'aria-multiline', 'aria-multiselectable', 'aria-orientation',
  'aria-owns', 'aria-placeholder', 'aria-posinset', 'aria-pressed', 'aria-readonly',
  'aria-relevant', 'aria-required', 'aria-roledescription', 'aria-rowcount',
  'aria-rowindex', 'aria-rowindextext', 'aria-rowspan', 'aria-selected',
  'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow',
  'aria-valuetext',
]);

/* ---- Rule definitions ---- */

const rules: A11yRule[] = [
  /* 1. Images without alt */
  {
    id: 'img-alt',
    description: 'Images must have an alt attribute',
    severity: 'critical',
    wcagCriteria: '1.1.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const images = root.querySelectorAll('img');
      images.forEach((img) => {
        if (!img.hasAttribute('alt')) {
          violations.push({
            rule: 'img-alt',
            severity: 'critical',
            element: describeElement(img),
            description: 'Image is missing alt attribute.',
            fix: 'Add an alt attribute describing the image, or alt="" for decorative images.',
            wcagCriteria: '1.1.1',
          });
        }
      });
      return violations;
    },
  },

  /* 2. Buttons without accessible name */
  {
    id: 'button-name',
    description: 'Buttons must have an accessible name',
    severity: 'critical',
    wcagCriteria: '4.1.2',
    check(root) {
      const violations: A11yViolation[] = [];
      const buttons = root.querySelectorAll('button');
      buttons.forEach((btn) => {
        if (!hasAccessibleName(btn)) {
          violations.push({
            rule: 'button-name',
            severity: 'critical',
            element: describeElement(btn),
            description: 'Button has no accessible name.',
            fix: 'Add text content, aria-label, or aria-labelledby to the button.',
            wcagCriteria: '4.1.2',
          });
        }
      });
      return violations;
    },
  },

  /* 3. Links without accessible name */
  {
    id: 'link-name',
    description: 'Links must have an accessible name',
    severity: 'serious',
    wcagCriteria: '2.4.4',
    check(root) {
      const violations: A11yViolation[] = [];
      const links = root.querySelectorAll('a[href]');
      links.forEach((link) => {
        if (!hasAccessibleName(link)) {
          violations.push({
            rule: 'link-name',
            severity: 'serious',
            element: describeElement(link),
            description: 'Link has no accessible name.',
            fix: 'Add text content, aria-label, or aria-labelledby to the link.',
            wcagCriteria: '2.4.4',
          });
        }
      });
      return violations;
    },
  },

  /* 4. Form inputs without labels */
  {
    id: 'input-label',
    description: 'Form inputs must have associated labels',
    severity: 'critical',
    wcagCriteria: '1.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const inputs = root.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select',
      );
      inputs.forEach((input) => {
        const hasLabel = input.getAttribute('aria-label')
          || input.getAttribute('aria-labelledby')
          || input.getAttribute('title')
          || (input.id && root.querySelector(`label[for="${input.id}"]`));
        if (!hasLabel) {
          violations.push({
            rule: 'input-label',
            severity: 'critical',
            element: describeElement(input),
            description: 'Form input has no associated label.',
            fix: 'Add a <label for="id">, aria-label, or aria-labelledby to the input.',
            wcagCriteria: '1.3.1',
          });
        }
      });
      return violations;
    },
  },

  /* 5. Missing document language */
  {
    id: 'html-lang',
    description: 'HTML element must have a lang attribute',
    severity: 'serious',
    wcagCriteria: '3.1.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const html = root.closest('html') ?? root.ownerDocument?.documentElement;
      if (html && !html.getAttribute('lang')) {
        violations.push({
          rule: 'html-lang',
          severity: 'serious',
          element: '<html>',
          description: 'HTML element is missing the lang attribute.',
          fix: 'Add lang attribute to <html>, e.g. <html lang="en">.',
          wcagCriteria: '3.1.1',
        });
      }
      return violations;
    },
  },

  /* 6. Color contrast (simplified) */
  {
    id: 'color-contrast',
    description: 'Text must have sufficient color contrast (4.5:1)',
    severity: 'serious',
    wcagCriteria: '1.4.3',
    check(root) {
      const violations: A11yViolation[] = [];
      const textEls = root.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, li, td, th, label, div');
      textEls.forEach((el) => {
        const text = getTextContent(el);
        if (!text || el.children.length > 0) return;

        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const style = window.getComputedStyle(el);
          const color = style.color;
          const bgColor = style.backgroundColor;
          // Flag transparent-on-transparent or same-color cases
          if (color && bgColor && color === bgColor && color !== 'rgba(0, 0, 0, 0)') {
            violations.push({
              rule: 'color-contrast',
              severity: 'serious',
              element: describeElement(el),
              description: 'Text color is identical to background color.',
              fix: 'Ensure text color has at least 4.5:1 contrast ratio against background.',
              wcagCriteria: '1.4.3',
            });
          }
        }
      });
      return violations;
    },
  },

  /* 7. Focus indicators */
  {
    id: 'focus-visible',
    description: 'Interactive elements should have visible focus indicators',
    severity: 'serious',
    wcagCriteria: '2.4.7',
    check(root) {
      const violations: A11yViolation[] = [];
      const interactive = root.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex="0"]',
      );
      interactive.forEach((el) => {
        const outline = el.getAttribute('style');
        if (outline && /outline\s*:\s*none/i.test(outline) && !el.classList.contains('focus-visible:outline')) {
          violations.push({
            rule: 'focus-visible',
            severity: 'serious',
            element: describeElement(el),
            description: 'Interactive element has outline:none without alternative focus styles.',
            fix: 'Provide a visible :focus or :focus-visible indicator via CSS.',
            wcagCriteria: '2.4.7',
          });
        }
      });
      return violations;
    },
  },

  /* 8. Heading hierarchy */
  {
    id: 'heading-order',
    description: 'Headings should not skip levels',
    severity: 'moderate',
    wcagCriteria: '1.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let prevLevel = 0;
      headings.forEach((h) => {
        const level = parseInt(h.tagName.charAt(1), 10);
        if (prevLevel > 0 && level > prevLevel + 1) {
          violations.push({
            rule: 'heading-order',
            severity: 'moderate',
            element: describeElement(h),
            description: `Heading level ${level} skips from level ${prevLevel}. Expected level ${prevLevel + 1} or lower.`,
            fix: `Use an <h${prevLevel + 1}> instead, or add the missing heading levels.`,
            wcagCriteria: '1.3.1',
          });
        }
        prevLevel = level;
      });
      return violations;
    },
  },

  /* 9. Empty headings */
  {
    id: 'empty-heading',
    description: 'Headings must have text content',
    severity: 'moderate',
    wcagCriteria: '1.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((h) => {
        if (!getTextContent(h) && !h.getAttribute('aria-label')) {
          violations.push({
            rule: 'empty-heading',
            severity: 'moderate',
            element: describeElement(h),
            description: 'Heading element has no text content.',
            fix: 'Add meaningful text to the heading or remove it if unnecessary.',
            wcagCriteria: '1.3.1',
          });
        }
      });
      return violations;
    },
  },

  /* 10. Tabindex misuse */
  {
    id: 'tabindex-positive',
    description: 'tabindex should not have positive values',
    severity: 'serious',
    wcagCriteria: '2.4.3',
    check(root) {
      const violations: A11yViolation[] = [];
      const els = root.querySelectorAll('[tabindex]');
      els.forEach((el) => {
        const val = parseInt(el.getAttribute('tabindex') ?? '0', 10);
        if (val > 0) {
          violations.push({
            rule: 'tabindex-positive',
            severity: 'serious',
            element: describeElement(el),
            description: `Element has tabindex="${val}". Positive tabindex disrupts natural tab order.`,
            fix: 'Use tabindex="0" to make focusable or tabindex="-1" for programmatic focus only.',
            wcagCriteria: '2.4.3',
          });
        }
      });
      return violations;
    },
  },

  /* 11. Missing ARIA roles */
  {
    id: 'aria-roles',
    description: 'Common interactive patterns should have proper ARIA roles',
    severity: 'moderate',
    wcagCriteria: '4.1.2',
    check(root) {
      const violations: A11yViolation[] = [];
      // Check clickable non-button/link elements
      const clickable = root.querySelectorAll('[onclick]:not(button):not(a):not(input)');
      clickable.forEach((el) => {
        if (!el.getAttribute('role')) {
          violations.push({
            rule: 'aria-roles',
            severity: 'moderate',
            element: describeElement(el),
            description: 'Clickable element without a button/link role.',
            fix: 'Add role="button" and tabindex="0", or use a <button> element instead.',
            wcagCriteria: '4.1.2',
          });
        }
      });
      return violations;
    },
  },

  /* 12. Invalid ARIA attributes */
  {
    id: 'aria-valid-attr',
    description: 'ARIA attributes must be valid',
    severity: 'critical',
    wcagCriteria: '4.1.2',
    check(root) {
      const violations: A11yViolation[] = [];
      const allElements = root.querySelectorAll('*');
      allElements.forEach((el) => {
        const attrs = el.getAttributeNames();
        attrs.forEach((attr) => {
          if (attr.startsWith('aria-') && !VALID_ARIA_ATTRIBUTES.has(attr)) {
            violations.push({
              rule: 'aria-valid-attr',
              severity: 'critical',
              element: describeElement(el),
              description: `Invalid ARIA attribute: "${attr}".`,
              fix: `Remove or replace "${attr}" with a valid ARIA attribute.`,
              wcagCriteria: '4.1.2',
            });
          }
        });
      });
      return violations;
    },
  },

  /* 13. Missing landmark regions */
  {
    id: 'landmark-regions',
    description: 'Page should have landmark regions (main, nav, etc.)',
    severity: 'moderate',
    wcagCriteria: '1.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const hasMain = root.querySelector('main, [role="main"]');
      if (!hasMain && root === root.ownerDocument?.body) {
        violations.push({
          rule: 'landmark-regions',
          severity: 'moderate',
          element: '<body>',
          description: 'Page is missing a <main> landmark region.',
          fix: 'Wrap the primary content in a <main> element or add role="main".',
          wcagCriteria: '1.3.1',
        });
      }
      return violations;
    },
  },

  /* 14. Duplicate IDs */
  {
    id: 'duplicate-id',
    description: 'Element IDs must be unique',
    severity: 'serious',
    wcagCriteria: '4.1.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const idMap = new Map<string, number>();
      const allElements = root.querySelectorAll('[id]');
      allElements.forEach((el) => {
        const id = el.id;
        if (id) {
          idMap.set(id, (idMap.get(id) ?? 0) + 1);
        }
      });
      idMap.forEach((count, id) => {
        if (count > 1) {
          violations.push({
            rule: 'duplicate-id',
            severity: 'serious',
            element: `[id="${id}"]`,
            description: `ID "${id}" is used ${count} times. IDs must be unique.`,
            fix: `Give each element a unique id attribute.`,
            wcagCriteria: '4.1.1',
          });
        }
      });
      return violations;
    },
  },

  /* 15. Auto-playing media */
  {
    id: 'no-autoplay',
    description: 'Media should not autoplay',
    severity: 'serious',
    wcagCriteria: '1.4.2',
    check(root) {
      const violations: A11yViolation[] = [];
      const media = root.querySelectorAll('video[autoplay], audio[autoplay]');
      media.forEach((el) => {
        violations.push({
          rule: 'no-autoplay',
          severity: 'serious',
          element: describeElement(el),
          description: 'Media element has autoplay attribute.',
          fix: 'Remove the autoplay attribute or provide a control to stop/pause the media.',
          wcagCriteria: '1.4.2',
        });
      });
      return violations;
    },
  },

  /* 16. Missing skip navigation */
  {
    id: 'skip-nav',
    description: 'Page should have a skip navigation link',
    severity: 'moderate',
    wcagCriteria: '2.4.1',
    check(root) {
      const violations: A11yViolation[] = [];
      if (root === root.ownerDocument?.body) {
        const skipLink = root.querySelector(
          'a[href^="#main"], a[href^="#content"], [class*="skip"], a[href^="#skip"]',
        );
        if (!skipLink) {
          violations.push({
            rule: 'skip-nav',
            severity: 'moderate',
            element: '<body>',
            description: 'Page is missing a skip-to-content navigation link.',
            fix: 'Add a visually-hidden skip link as the first focusable element: <a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>.',
            wcagCriteria: '2.4.1',
          });
        }
      }
      return violations;
    },
  },

  /* 17. Touch target size */
  {
    id: 'touch-target-size',
    description: 'Interactive elements should be at least 44x44px',
    severity: 'moderate',
    wcagCriteria: '2.5.5',
    check(root) {
      const violations: A11yViolation[] = [];
      const interactive = root.querySelectorAll('button, a[href], input, select, textarea');
      interactive.forEach((el) => {
        if (typeof (el as HTMLElement).getBoundingClientRect === 'function') {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
            violations.push({
              rule: 'touch-target-size',
              severity: 'moderate',
              element: describeElement(el),
              description: `Interactive element is ${Math.round(rect.width)}x${Math.round(rect.height)}px. Minimum recommended is 44x44px.`,
              fix: 'Increase the element size or add padding to meet the 44x44px minimum touch target.',
              wcagCriteria: '2.5.5',
            });
          }
        }
      });
      return violations;
    },
  },

  /* 18. Motion preferences */
  {
    id: 'prefers-reduced-motion',
    description: 'Animations should respect prefers-reduced-motion',
    severity: 'moderate',
    wcagCriteria: '2.3.3',
    check(root) {
      const violations: A11yViolation[] = [];
      const animated = root.querySelectorAll('[class*="animate-"], [class*="transition"]');
      animated.forEach((el) => {
        const classList = Array.from(el.classList);
        const hasMotionOverride = classList.some(
          (c) => c.includes('motion-reduce') || c.includes('motion-safe'),
        );
        if (!hasMotionOverride) {
          violations.push({
            rule: 'prefers-reduced-motion',
            severity: 'moderate',
            element: describeElement(el),
            description: 'Animated element does not respect prefers-reduced-motion.',
            fix: 'Add motion-reduce:animate-none or use @media (prefers-reduced-motion: reduce) to disable animations.',
            wcagCriteria: '2.3.3',
          });
        }
      });
      return violations;
    },
  },

  /* 19. Focus trap in modals */
  {
    id: 'modal-focus-trap',
    description: 'Modals should trap focus within',
    severity: 'critical',
    wcagCriteria: '2.4.3',
    check(root) {
      const violations: A11yViolation[] = [];
      const modals = root.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"]',
      );
      modals.forEach((modal) => {
        const isModal = modal.getAttribute('aria-modal') === 'true';
        const hasRole = modal.getAttribute('role') === 'dialog'
          || modal.getAttribute('role') === 'alertdialog';
        if (hasRole && !isModal) {
          violations.push({
            rule: 'modal-focus-trap',
            severity: 'critical',
            element: describeElement(modal),
            description: 'Dialog element is missing aria-modal="true" for focus trapping.',
            fix: 'Add aria-modal="true" to the dialog and implement keyboard focus trapping.',
            wcagCriteria: '2.4.3',
          });
        }
      });
      return violations;
    },
  },

  /* 20. Live region updates */
  {
    id: 'aria-live-region',
    description: 'Dynamic content areas should use aria-live',
    severity: 'moderate',
    wcagCriteria: '4.1.3',
    check(root) {
      const violations: A11yViolation[] = [];
      const statusEls = root.querySelectorAll('[role="status"], [role="alert"], [role="log"], [role="timer"]');
      statusEls.forEach((el) => {
        const ariaLive = el.getAttribute('aria-live');
        const role = el.getAttribute('role');
        // role="alert" implies aria-live="assertive", role="status" implies aria-live="polite"
        if (role !== 'alert' && role !== 'status' && !ariaLive) {
          violations.push({
            rule: 'aria-live-region',
            severity: 'moderate',
            element: describeElement(el),
            description: 'Dynamic content region is missing aria-live attribute.',
            fix: 'Add aria-live="polite" (or "assertive" for urgent updates) to the container.',
            wcagCriteria: '4.1.3',
          });
        }
      });
      return violations;
    },
  },

  /* 21. Table accessibility */
  {
    id: 'table-headers',
    description: 'Data tables must have header cells',
    severity: 'serious',
    wcagCriteria: '1.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const tables = root.querySelectorAll('table');
      tables.forEach((table) => {
        const headers = table.querySelectorAll('th');
        if (headers.length === 0) {
          violations.push({
            rule: 'table-headers',
            severity: 'serious',
            element: describeElement(table),
            description: 'Data table has no header cells (<th>).',
            fix: 'Add <th> elements to identify column or row headers.',
            wcagCriteria: '1.3.1',
          });
        }
      });
      return violations;
    },
  },

  /* 22. Form field error identification */
  {
    id: 'form-error-identification',
    description: 'Invalid form fields should have aria-invalid and error descriptions',
    severity: 'serious',
    wcagCriteria: '3.3.1',
    check(root) {
      const violations: A11yViolation[] = [];
      const invalidInputs = root.querySelectorAll('[aria-invalid="true"]');
      invalidInputs.forEach((input) => {
        const hasErrorMsg = input.getAttribute('aria-errormessage')
          || input.getAttribute('aria-describedby');
        if (!hasErrorMsg) {
          violations.push({
            rule: 'form-error-identification',
            severity: 'serious',
            element: describeElement(input),
            description: 'Invalid form field lacks an associated error message.',
            fix: 'Add aria-errormessage or aria-describedby pointing to the error message element.',
            wcagCriteria: '3.3.1',
          });
        }
      });
      return violations;
    },
  },
];

/* ---- Scoring ---- */

const SEVERITY_WEIGHT: Record<A11ySeverity, number> = {
  critical: 25,
  serious: 15,
  moderate: 8,
  minor: 3,
};

function calculateScore(violations: A11yViolation[], totalRules: number): number {
  if (totalRules === 0) return 100;
  const penalty = violations.reduce(
    (sum, v) => sum + SEVERITY_WEIGHT[v.severity],
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

function buildSummary(result: Pick<A11yAuditResult, 'passed' | 'failed' | 'warnings' | 'score'>): string {
  if (result.failed === 0 && result.warnings === 0) {
    return `All ${result.passed} rules passed. Score: ${result.score}/100.`;
  }
  const parts: string[] = [];
  if (result.failed > 0) parts.push(`${result.failed} failure(s)`);
  if (result.warnings > 0) parts.push(`${result.warnings} warning(s)`);
  return `${result.passed} passed, ${parts.join(', ')}. Score: ${result.score}/100.`;
}

/* ---- Public API ---- */

/**
 * Run all audit rules against a DOM element subtree.
 */
export function auditElement(element: HTMLElement): A11yAuditResult {
  const allViolations: A11yViolation[] = [];

  for (const rule of rules) {
    const ruleViolations = rule.check(element);
    allViolations.push(...ruleViolations);
  }

  const failures = allViolations.filter(
    (v) => v.severity === 'critical' || v.severity === 'serious',
  );
  const warnings = allViolations.filter(
    (v) => v.severity === 'moderate' || v.severity === 'minor',
  );
  const passed = rules.length - new Set(allViolations.map((v) => v.rule)).size;
  const score = calculateScore(allViolations, rules.length);

  const result: A11yAuditResult = {
    passed,
    failed: failures.length,
    warnings: warnings.length,
    violations: allViolations,
    score,
    summary: '',
  };
  result.summary = buildSummary(result);
  return result;
}

/**
 * Generate a full accessibility report for a named component.
 * Combines DOM audit, keyboard navigation testing, and recommendations.
 */
export function auditComponent(
  componentName: string,
  element: HTMLElement,
): A11yComponentReport {
  const audit = auditElement(element);

  // Extract ARIA attributes from root element
  const ariaAttributes: Record<string, string> = {};
  const attrs = element.getAttributeNames();
  for (const attr of attrs) {
    if (attr.startsWith('aria-') || attr === 'role') {
      ariaAttributes[attr] = element.getAttribute(attr) ?? '';
    }
  }

  // Determine component type from name or role
  const normalizedName = componentName.toLowerCase();
  const contract = getKeyboardContract(normalizedName);
  const keyboardNav = testKeyboardNavigation(element, contract);

  const recommendations = getRecommendations(audit.violations);

  return {
    componentName,
    audit,
    keyboardNav,
    ariaAttributes,
    recommendations,
  };
}

/**
 * Get all registered audit rules.
 */
export function getAuditRules(): readonly A11yRule[] {
  return rules;
}

export { rules as _rules };
