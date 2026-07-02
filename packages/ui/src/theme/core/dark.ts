/* ------------------------------------------------------------------ */
/*  Dark theme — semantic token assignments                            */
/* ------------------------------------------------------------------ */

import { palette } from '../../tokens/color';
import type { SemanticTokenSet } from '../../tokens/semantic';

export const darkTheme: SemanticTokenSet = {
  surfaceDefault: palette.gray800,
  surfaceCanvas: palette.gray900,
  surfaceMuted: palette.gray700,
  surfaceRaised: palette.gray700,

  textPrimary: palette.gray50,
  textSecondary: palette.gray400,
  textDisabled: palette.gray600,
  textInverse: palette.gray900,

  borderDefault: palette.gray600,
  borderSubtle: palette.gray700,
  borderStrong: palette.gray500,

  actionPrimary: palette.primary500,
  actionPrimaryHover: palette.primary400,
  actionPrimaryActive: palette.primary300,
  actionSecondary: palette.gray700,

  stateSuccessBg: palette.green950,
  stateSuccessText: palette.green500,
  stateWarningBg: palette.amber950,
  stateWarningText: palette.amber500,
  stateErrorBg: palette.red950,
  stateErrorText: palette.red500,
  stateInfoBg: palette.blue950,
  stateInfoText: palette.blue500,

  focusRing: palette.primary400,
};
