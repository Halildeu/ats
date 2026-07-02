import React from 'react';
import { createIcon } from '../Icon';

/**
 * Codex 019dde0c iter-44 — IconShield (plain shield, no checkmark).
 *
 * Used as the decorative leading icon for `RoleDrawer` in `mfe-access`,
 * paired with the `DetailDrawer.leading` slot prop introduced in this
 * iteration. Plain shield path was chosen over `ShieldCheck` per Codex
 * review: the checkmark variant carries "verified/success" semantics
 * that conflict with system-role / custom-role / unsaved-state badges
 * which already live in the drawer's `tags` slot. The naming contract
 * matches the path — `IconShield.tsx` ↔ plain shield path.
 */
export const IconShield = createIcon(
  'IconShield',
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
);
