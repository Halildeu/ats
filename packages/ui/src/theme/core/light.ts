/* ------------------------------------------------------------------ */
/*  Light theme — semantic token assignments                           */
/* ------------------------------------------------------------------ */

import { palette } from "../../tokens/color";
import type { SemanticTokenSet } from "../../tokens/semantic";

export const lightTheme: SemanticTokenSet = {
  surfaceDefault: palette.white,
  surfaceCanvas: palette.gray50,
  surfaceMuted: palette.gray100,
  surfaceRaised: palette.white,

  textPrimary: palette.gray900,
  textSecondary: palette.gray500,
  textDisabled: palette.gray300,
  textInverse: palette.white,

  borderDefault: palette.gray300,
  borderSubtle: palette.gray200,
  borderStrong: palette.gray400,

  actionPrimary: palette.primary600,
  actionPrimaryHover: palette.primary700,
  actionPrimaryActive: palette.primary800,
  actionSecondary: palette.gray100,

  stateSuccessBg: palette.green50,
  stateSuccessText: palette.green700,
  stateWarningBg: palette.amber50,
  stateWarningText: palette.amber700,
  stateErrorBg: palette.red50,
  stateErrorText: palette.red700,
  stateInfoBg: palette.blue50,
  stateInfoText: palette.blue700,

  focusRing: palette.primary500,
};
