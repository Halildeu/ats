/**
 * @unstable These exports are NOT covered by semver guarantees.
 * They may change or be removed in any minor/patch release.
 * Prefer `@ats/ui/headless` for stable alternatives.
 *
 * Import path: `@ats/ui/unstable/interaction-core`
 */

// Runtime warning removed — JSDoc @unstable tag + package.json export path
// provide sufficient signal. Internal DS modules import this heavily,
// making per-import console.warn too noisy for dev workflows.

/* ------------------------------------------------------------------ */
/*  Interaction Core — Centralized interaction policy                  */
/*                                                                     */
/*  Provides unified interaction handling for all design system        */
/*  components: state attributes, focus management, keyboard           */
/*  contracts, event guarding, and semantic intent resolution.         */
/*                                                                     */
/*  Faz 1 — Interaction Core                                           */
/* ------------------------------------------------------------------ */

// State Attributes — data-* attribute helpers
export {
  stateAttrs,
  stateSelector,
  type StateAttributeOptions,
  type StateAttributes,
  type ComponentState,
  type ComponentStatus,
} from './state-attributes';

// Focus Policy — focus ring management
export {
  focusRingClass,
  focusRingClassWithColor,
  hasFocusVisibleRingClass,
  peerFocusVisibleRingClass,
  defaultFocusStrategy,
  isKeyboardInteraction,
  FOCUS_TRAP_ATTR,
  type FocusStrategy,
} from './focus-policy';

// Keyboard Contract — WAI-ARIA keyboard patterns
export {
  Keys,
  KEYBOARD_CONTRACTS,
  createKeyHandler,
  describeKeyboardContract,
  type KeyConstant,
  type KeyboardAction,
  type KeyBinding,
  type ComponentKeyboardContract,
} from './keyboard-contract';

// Event Guard — interaction blocking
export {
  evaluateGuard,
  guardEvent,
  guardStyles,
  guardAria,
  type EventGuardOptions,
  type EventGuardResult,
} from './event-guard';

// Semantic Intent — interaction intent resolver
export {
  resolveKeyboardIntent,
  resolveClickIntent,
  type SemanticIntent,
  type NavigationDirection,
  type ResolvedIntent,
} from './semantic-intent';

// Re-export access-controller for convenience
export {
  resolveAccessState,
  shouldBlockInteraction,
  withAccessGuard,
  accessStyles,
  type AccessLevel,
  type AccessControlledProps,
  type AccessResolution,
} from '../access-controller';
