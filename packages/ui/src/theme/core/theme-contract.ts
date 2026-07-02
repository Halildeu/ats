/* ------------------------------------------------------------------ */
/*  Theme contract — runtime type definitions                          */
/*                                                                     */
/*  Provides getThemeContract() and resolveThemeModeKey() for          */
/*  reading the generated theme-contract.json at runtime.              */
/*  NOTE: The JSON import is deferred — if the file is not found,      */
/*  a sensible default is returned.                                    */
/* ------------------------------------------------------------------ */

export type ThemeContract = {
  version: string;
  defaultMode: string;
  allowedModes?: string[];
  modes: Record<
    string,
    {
      label?: string;
      appearance?: string;
      isHighContrast?: boolean;
    }
  >;
  aliases?: {
    appearance?: Record<string, string>;
    density?: Record<string, string>;
  };
  coerce?: Array<{
    when: Partial<{ appearance: string; density: string }>;
    mode: string;
  }>;
};

/* ---- Default fallback contract (used if JSON unavailable) ---- */
const fallbackContract: ThemeContract = {
  version: "1.0.0",
  defaultMode: "light",
  modes: {
    light: { label: "Light", appearance: "light" },
    dark: { label: "Dark", appearance: "dark" },
  },
};

let _contract: ThemeContract | null = null;

function loadContract(): ThemeContract {
  if (_contract) return _contract;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    // Dynamic require so we don't break builds that don't have the generated file
    const json = require("../../../../../design-tokens/generated/theme-contract.json");
    _contract = json as ThemeContract;
  } catch {
    _contract = fallbackContract;
  }
  return _contract;
}

export const getThemeContract = (): ThemeContract => loadContract();

const normalizeKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isAllowedMode = (modeKey: string): boolean => {
  const contract = loadContract();
  const allowed =
    contract.allowedModes && contract.allowedModes.length > 0
      ? contract.allowedModes
      : undefined;
  if (allowed) {
    return allowed.includes(modeKey);
  }
  return Boolean(contract.modes?.[modeKey]);
};

const applyCoerceRules = (
  current: string,
  axes: { appearance?: string; density?: string },
): string => {
  const contract = loadContract();
  const rules = Array.isArray(contract.coerce) ? contract.coerce : [];
  if (rules.length === 0) return current;

  let next = current;
  for (const rule of rules) {
    if (!rule || typeof rule !== "object") continue;
    const when = rule.when ?? {};
    const matchAppearance = when.appearance
      ? when.appearance === axes.appearance
      : true;
    const matchDensity = when.density
      ? when.density === axes.density
      : true;
    if (
      matchAppearance &&
      matchDensity &&
      rule.mode &&
      typeof rule.mode === "string"
    ) {
      next = rule.mode;
    }
  }
  return next;
};

export const resolveThemeModeKey = (axes?: {
  appearance?: unknown;
  density?: unknown;
  modeKey?: unknown;
}): string => {
  const contract = loadContract();
  const explicit = normalizeKey(axes?.modeKey);
  if (explicit && isAllowedMode(explicit)) {
    return explicit;
  }

  const appearance = normalizeKey(axes?.appearance);
  const density = normalizeKey(axes?.density);

  const densityAlias = contract.aliases?.density?.[density];
  const appearanceAlias = contract.aliases?.appearance?.[appearance];

  let candidate = densityAlias ?? appearanceAlias ?? contract.defaultMode;
  candidate = applyCoerceRules(candidate, { appearance, density });

  if (!isAllowedMode(candidate)) {
    return contract.defaultMode;
  }

  return candidate;
};
