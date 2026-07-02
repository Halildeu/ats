import React, { useRef } from "react";
import { cn } from "../../utils/cn";
import {
  resolveAccessState,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { stateAttrs } from "../../internal/interaction-core";
import { useThemeTokens, flattenTokens, type ThemeTokenSnapshot } from "./useThemeTokens";
import { useScopedTheme } from "./useScopedTheme";
import type { ThemeAxes } from "../../theme/core/semantic-theme";

/* ------------------------------------------------------------------ */
/*  ThemePreviewCard — Live token preview with real CSS variable reads  */
/* ------------------------------------------------------------------ */

export type ThemePreviewCardSize = "sm" | "md" | "lg";

export interface ThemePreviewCardProps extends AccessControlledProps {
  /** Whether this theme card is currently selected. */
  selected?: boolean;
  /** Additional CSS class name. */
  className?: string;
  /** Size variant controlling detail level. @default "md" */
  size?: ThemePreviewCardSize;
  /** Theme axes override for scoped preview. Reads global theme if omitted. */
  themeAxes?: Partial<ThemeAxes>;
  /** Show real color token swatches. @default true */
  showTokenSwatches?: boolean;
  /** Show mini component preview area. @default true for md/lg */
  showComponentPreview?: boolean;
  /** Show tooltip with token name + hex on swatch hover. @default true */
  showTokenTooltip?: boolean;
  /** Called when user clicks on a token swatch. */
  onTokenClick?: (tokenName: string, value: string) => void;
  /** Locale-specific label overrides. */
  localeText?: {
    titleText?: React.ReactNode;
    secondaryText?: React.ReactNode;
    saveLabel?: React.ReactNode;
    selectedLabel?: React.ReactNode;
    appearanceLabel?: React.ReactNode;
    densityLabel?: React.ReactNode;
  };
}

/* ---- Swatch rendering ---- */

const SWATCH_TOKENS_SM = [
  { cssVar: "--surface-default", label: "Surface" },
  { cssVar: "--action-primary", label: "Primary" },
  { cssVar: "--text-primary", label: "Text" },
  { cssVar: "--border-subtle", label: "Border" },
] as const;

const SWATCH_TOKENS_MD = [
  { cssVar: "--surface-default", label: "Surface" },
  { cssVar: "--surface-muted", label: "Muted" },
  { cssVar: "--surface-raised", label: "Raised" },
  { cssVar: "--text-primary", label: "Text" },
  { cssVar: "--action-primary", label: "Primary" },
  { cssVar: "--action-secondary", label: "Secondary" },
  { cssVar: "--border-subtle", label: "Border" },
  { cssVar: "--state-success-bg", label: "Success" },
] as const;

type SwatchDef = { cssVar: string; label: string };

function TokenSwatch({
  token,
  showTooltip,
  onClick,
  size,
}: {
  token: SwatchDef;
  showTooltip: boolean;
  onClick?: (name: string, value: string) => void;
  size: ThemePreviewCardSize;
}) {
  const dim = size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div
      role="img"
      className={cn(
        dim,
        "rounded-sm border border-border-subtle transition-transform hover:scale-125",
        onClick && "cursor-pointer",
      )}
      style={{ backgroundColor: `var(${token.cssVar})` }}
      title={showTooltip ? `${token.label}: var(${token.cssVar})` : undefined}
      aria-label={`${token.label} token swatch`}
      onClick={onClick ? () => {
        const el = document.documentElement;
        const val = getComputedStyle(el).getPropertyValue(token.cssVar).trim();
        onClick(token.cssVar, val);
      } : undefined}
    />
  );
}

/* ---- Mini component preview ---- */

function MiniComponentPreview({ saveLabel }: { saveLabel: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-action-primary px-2 py-0.5 text-[8px] font-semibold text-text-inverse">
        {saveLabel}
      </span>
      <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-[8px] text-text-secondary">
        Badge
      </span>
    </div>
  );
}

/* ---- Appearance/Density chips ---- */

function ThemeChips({
  axes,
  localeText,
}: {
  axes: ThemeAxes;
  localeText?: ThemePreviewCardProps["localeText"];
}) {
  const isDark = axes.appearance === "dark" || axes.appearance === "high-contrast";
  return (
    <div className="flex items-center gap-1 text-[8px] text-text-secondary">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
          isDark ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700",
        )}
      >
        {isDark ? "☾" : "☀"}
        <span className="sr-only">{localeText?.appearanceLabel ?? "Gorunum"}</span>
      </span>
      <span className="inline-flex items-center rounded-full bg-surface-muted px-1.5 py-0.5">
        {axes.density === "compact" ? "Compact" : "Comfy"}
      </span>
    </div>
  );
}

/* ---- Full token catalog for lg ---- */

function FullTokenCatalog({
  snapshot,
  showTooltip,
  onClick,
}: {
  snapshot: ThemeTokenSnapshot;
  showTooltip: boolean;
  onClick?: (name: string, value: string) => void;
}) {
  const flat = flattenTokens(snapshot);
  const categories = ["surface", "text", "border", "action", "state"] as const;

  return (
    <div className="flex flex-col gap-1.5">
      {categories.map((cat) => {
        const tokens = flat.filter((t) => t.category === cat);
        return (
          <div key={cat} className="flex flex-col gap-0.5">
            <span className="text-[7px] font-semibold uppercase tracking-wider text-text-secondary">
              {cat}
            </span>
            <div className="flex flex-wrap gap-1">
              {tokens.map((t) => (
                <div
                  key={t.cssVar}
                  role="img"
                  className={cn(
                    "h-4 w-4 rounded-sm border border-border-subtle transition-transform hover:scale-125",
                    onClick && "cursor-pointer",
                  )}
                  style={{ backgroundColor: t.value || `var(${t.cssVar})` }}
                  title={showTooltip ? `${t.cssVar}: ${t.value}` : undefined}
                  aria-label={`${t.name} token: ${t.value}`}
                  onClick={onClick ? () => onClick(t.cssVar, t.value) : undefined}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Live theme preview card showing real CSS variable swatches, mini component
 * previews, and appearance/density indicators. Supports 3 size variants
 * and scoped theme previews via `themeAxes` prop.
 *
 * @example
 * ```tsx
 * <ThemePreviewCard size="md" themeAxes={{ appearance: 'dark' }} />
 * ```
 */
export const ThemePreviewCard = React.forwardRef<HTMLDivElement, ThemePreviewCardProps>(
  (
    {
      selected = false,
      className,
      size = "md",
      themeAxes,
      showTokenSwatches = true,
      showComponentPreview,
      showTokenTooltip = true,
      onTokenClick,
      localeText,
      access = "full",
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const scoped = useScopedTheme(themeAxes);
    const scopeRef = useRef<HTMLDivElement>(null);
    const tokens = useThemeTokens(themeAxes ? scopeRef : undefined);

    const resolvedShowComponentPreview =
      showComponentPreview ?? (size === "md" || size === "lg");
    const resolvedSelectedLabel =
      localeText?.selectedLabel ?? "Secili tema onizlemesi";

    const sizeClasses: Record<ThemePreviewCardSize, string> = {
      sm: "w-20 p-1.5 gap-1",
      md: "w-[180px] p-2 gap-1.5",
      lg: "w-80 p-3 gap-2",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col rounded-xl border text-[10px] transition",
          "bg-surface-default",
          sizeClasses[size],
          selected
            ? "border-action-primary shadow-xs ring-1 ring-action-primary/30"
            : "border-border-subtle hover:border-text-secondary",
          className,
        )}
        data-component="theme-preview-card"
        data-access-state={accessState.state}
        title={accessReason}
        {...stateAttrs({
          access,
          disabled: accessState.isDisabled,
          component: "theme-preview-card",
        })}
      >
        {/* Selected indicator */}
        {selected && (
          <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-action-primary text-[9px] font-bold text-text-inverse">
            <span aria-hidden="true">✓</span>
            <span className="sr-only">{resolvedSelectedLabel}</span>
          </div>
        )}

        {/* Scoped theme container */}
        <div
          ref={scopeRef}
          {...(themeAxes ? scoped.attrs : {})}
          style={themeAxes ? scoped.style : undefined}
          className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-muted p-2"
        >
          {/* Token swatches */}
          {showTokenSwatches && (
            <div className="flex flex-wrap gap-1">
              {(size === "sm" ? SWATCH_TOKENS_SM : SWATCH_TOKENS_MD).map((t) => (
                <TokenSwatch
                  key={t.cssVar}
                  token={t}
                  showTooltip={showTokenTooltip}
                  onClick={onTokenClick}
                  size={size}
                />
              ))}
            </div>
          )}

          {/* Title/secondary text area */}
          {size !== "sm" && (
            <div className="flex flex-col gap-0.5">
              <div className="text-[9px] font-medium text-text-primary">
                {localeText?.titleText ?? "Baslik metni"}
              </div>
              <div className="text-[8px] text-text-secondary">
                {localeText?.secondaryText ?? "Ikincil metin"}
              </div>
            </div>
          )}

          {/* Mini component preview */}
          {resolvedShowComponentPreview && (
            <MiniComponentPreview saveLabel={localeText?.saveLabel ?? "Kaydet"} />
          )}

          {/* Full token catalog (lg only) */}
          {size === "lg" && tokens && (
            <FullTokenCatalog
              snapshot={tokens}
              showTooltip={showTokenTooltip}
              onClick={onTokenClick}
            />
          )}
        </div>

        {/* Appearance/density chips */}
        {size !== "sm" && <ThemeChips axes={scoped.axes} localeText={localeText} />}
      </div>
    );
  },
);

ThemePreviewCard.displayName = "ThemePreviewCard";

export default ThemePreviewCard;

/* ---- Type aliases (backward compat) ---- */
export type ThemePreviewCardRef = React.Ref<HTMLElement>;
export type ThemePreviewCardElement = HTMLElement;
export type ThemePreviewCardCSSProperties = React.CSSProperties;
