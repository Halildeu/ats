/* ------------------------------------------------------------------ */
/*  Semantic tokens — mode-agnostic aliases                            */
/*                                                                     */
/*  These map design intent to raw palette values.                     */
/*  Light/Dark assignments live in theme/core/.                        */
/* ------------------------------------------------------------------ */

export interface SemanticTokenSet {
  /* Surfaces */
  surfaceDefault: string;
  surfaceCanvas: string;
  surfaceMuted: string;
  surfaceRaised: string;

  /* Text */
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string;

  /* Borders */
  borderDefault: string;
  borderSubtle: string;
  borderStrong: string;

  /* Actions */
  actionPrimary: string;
  actionPrimaryHover: string;
  actionPrimaryActive: string;
  actionSecondary: string;

  /* Feedback states */
  stateSuccessBg: string;
  stateSuccessText: string;
  stateWarningBg: string;
  stateWarningText: string;
  stateErrorBg: string;
  stateErrorText: string;
  stateInfoBg: string;
  stateInfoText: string;

  /* Focus */
  focusRing: string;
}
