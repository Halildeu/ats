import React, { useState, useMemo } from "react";
import { cn } from "../../utils/cn";
import { Badge } from "../../primitives/badge";
import { EmptyState as Empty } from "../empty-state";
import { Text } from "../../primitives/text";
import { ThemePreviewCard } from "../theme-preview-card";
import { type ThemePresetGalleryItem } from "./ThemePresetGallery";
import {
  resolveAccessState,
  type AccessControlledProps,
} from "../../internal/access-controller";
import { stateAttrs } from "../../internal/interaction-core";
import { useScopedTheme } from "../theme-preview-card/useScopedTheme";
import { useThemeTokens, flattenTokens, type TokenCategory } from "../theme-preview-card/useThemeTokens";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ThemePresetCompareProps extends AccessControlledProps {
  leftPreset?: ThemePresetGalleryItem | null;
  rightPreset?: ThemePresetGalleryItem | null;
  title?: React.ReactNode;
  description?: React.ReactNode;
  axes?: string[];
  className?: string;
  /** Show live component previews side by side. @default true */
  showLivePreview?: boolean;
  /** Show visual token diff with color swatches. @default true */
  showTokenDiff?: boolean;
  /** Token categories in visual diff. @default all */
  tokenCategories?: TokenCategory[];
  /** Collapsible diff groups. @default true */
  collapsible?: boolean;
  /** Initially expanded groups. @default all */
  defaultExpandedGroups?: string[];
  /** Highlight value differences. @default true */
  highlightDifferences?: boolean;
  /** Show swap button. @default true */
  showSwapButton?: boolean;
  /** Swap callback. */
  onSwap?: () => void;
  /** Locale overrides. */
  localeText?: {
    axisHeader?: string;
    tokenHeader?: string;
    sameLabel?: string;
    differentLabel?: string;
    swapLabel?: string;
    emptyMessage?: string;
    collapseLabel?: string;
    expandLabel?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const normalizeAxisValue = (
  preset: ThemePresetGalleryItem,
  axis: string,
): React.ReactNode => {
  switch (axis) {
    case "appearance":
      return preset.appearance ?? "\u2014";
    case "density":
      return preset.density ?? "\u2014";
    case "intent":
      return preset.intent ?? "\u2014";
    case "contrast":
      return preset.isHighContrast ? "high" : "standard";
    case "mode":
    case "themeMode":
      return preset.themeMode ?? "\u2014";
    default:
      return "\u2014";
  }
};

const CATEGORY_LABELS: Record<TokenCategory, string> = {
  surface: "Surface",
  text: "Text",
  border: "Border",
  action: "Action",
  state: "State",
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Side-by-side live component preview panels */
function LivePreviewPanels({
  leftPreset,
  rightPreset,
}: {
  leftPreset: ThemePresetGalleryItem;
  rightPreset: ThemePresetGalleryItem;
}) {
  const leftScoped = useScopedTheme(leftPreset.themeAxes);
  const rightScoped = useScopedTheme(rightPreset.themeAxes);

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
    >
      {[
        { preset: leftPreset, scoped: leftScoped },
        { preset: rightPreset, scoped: rightScoped },
      ].map(({ preset, scoped }) => (
        <div
          key={preset.presetId}
          className="rounded-[24px] border border-border-subtle bg-surface-default p-4"
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 rounded-[20px] border border-border-subtle bg-surface-muted p-3"
              {...(preset.themeAxes ? scoped.attrs : {})}
              style={preset.themeAxes ? scoped.style : undefined}
            >
              <ThemePreviewCard
                selected={preset.isDefaultMode}
                size="sm"
                themeAxes={preset.themeAxes}
              />
            </div>
            <div className="min-w-0">
              <Text as="div" className="text-sm font-semibold text-text-primary">
                {preset.label}
              </Text>
              <Text variant="secondary" className="mt-1 block text-sm leading-6">
                {preset.intent ?? "Preset intent belirtilmedi."}
              </Text>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Semantic comparison table */
function AxisComparisonTable({
  leftPreset,
  rightPreset,
  axes,
  highlightDifferences,
  localeText,
}: {
  leftPreset: ThemePresetGalleryItem;
  rightPreset: ThemePresetGalleryItem;
  axes: string[];
  highlightDifferences: boolean;
  localeText?: ThemePresetCompareProps["localeText"];
}) {
  return (
    <div className="rounded-[24px] border border-border-subtle bg-surface-default p-4">
      <table className="w-full text-sm" role="table" aria-label="Theme axis comparison">
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="pb-3 text-start text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {localeText?.axisHeader ?? "Eksen"}
            </th>
            <th scope="col" className="pb-3 text-start text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {leftPreset.label}
            </th>
            <th scope="col" className="pb-3 text-start text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {rightPreset.label}
            </th>
            {highlightDifferences && (
              <th scope="col" className="sr-only">Durum</th>
            )}
          </tr>
        </thead>
        <tbody>
          {axes.map((axis) => {
            const leftVal = String(normalizeAxisValue(leftPreset, axis));
            const rightVal = String(normalizeAxisValue(rightPreset, axis));
            const isDifferent = leftVal !== rightVal;

            return (
              <tr key={axis} className="border-b border-border-subtle last:border-b-0">
                <th scope="row" className="py-3 text-start font-semibold capitalize text-text-primary">
                  {axis}
                </th>
                <td className="py-3 text-text-secondary">{leftVal}</td>
                <td className="py-3 text-text-secondary">{rightVal}</td>
                {highlightDifferences && (
                  <td className="py-3">
                    <Badge variant={isDifferent ? "warning" : "success"} className="text-[10px]">
                      {isDifferent
                        ? (localeText?.differentLabel ?? "Farkli")
                        : (localeText?.sameLabel ?? "Ayni")}
                    </Badge>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Collapsible token diff group */
function TokenDiffGroup({
  category,
  leftTokens,
  rightTokens,
  collapsible,
  defaultExpanded,
  highlightDifferences,
}: {
  category: TokenCategory;
  leftTokens: Array<{ name: string; cssVar: string; value: string }>;
  rightTokens: Array<{ name: string; cssVar: string; value: string }>;
  collapsible: boolean;
  defaultExpanded: boolean;
  highlightDifferences: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-default">
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between px-4 py-3 text-start",
          collapsible && "cursor-pointer hover:bg-surface-muted",
        )}
        onClick={collapsible ? () => setExpanded((e) => !e) : undefined}
        aria-expanded={collapsible ? expanded : undefined}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {CATEGORY_LABELS[category]} ({leftTokens.length})
        </span>
        {collapsible && (
          <span className="text-text-secondary transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▾
          </span>
        )}
      </button>

      {(!collapsible || expanded) && (
        <div className="border-t border-border-subtle px-4 py-2">
          {leftTokens.map((leftToken, i) => {
            const rightToken = rightTokens[i];
            const isDifferent = leftToken?.value !== rightToken?.value;

            return (
              <div
                key={leftToken.cssVar}
                className={cn(
                  "flex items-center gap-3 py-1.5",
                  highlightDifferences && isDifferent && "bg-state-warning-bg/30 -mx-2 rounded px-2",
                )}
              >
                <span className="w-24 shrink-0 text-[11px] text-text-secondary">
                  {leftToken.name}
                </span>
                <div
                  className="h-5 w-5 shrink-0 rounded-sm border border-border-subtle"
                  style={{ backgroundColor: leftToken.value || `var(${leftToken.cssVar})` }}
                  title={`${leftToken.cssVar}: ${leftToken.value}`}
                  role="img"
                  aria-label={`Left ${leftToken.name}: ${leftToken.value}`}
                />
                <span className="w-16 shrink-0 text-[10px] text-text-disabled">
                  {leftToken.value?.slice(0, 7) || "—"}
                </span>
                <span className="text-text-disabled">→</span>
                <div
                  className="h-5 w-5 shrink-0 rounded-sm border border-border-subtle"
                  style={{ backgroundColor: rightToken?.value || `var(${rightToken?.cssVar ?? ""})` }}
                  title={`${rightToken?.cssVar}: ${rightToken?.value}`}
                  role="img"
                  aria-label={`Right ${rightToken?.name}: ${rightToken?.value}`}
                />
                <span className="w-16 shrink-0 text-[10px] text-text-disabled">
                  {rightToken?.value?.slice(0, 7) || "—"}
                </span>
                {highlightDifferences && isDifferent && (
                  <Badge variant="warning" className="ml-auto text-[9px]">≠</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Side-by-side theme comparison with live component previews,
 * semantic axis table, and visual token diff with collapsible groups.
 *
 * @example
 * ```tsx
 * <ThemePresetCompare leftPreset={light} rightPreset={dark} />
 * ```
 */
export const ThemePresetCompare = React.forwardRef<HTMLElement, ThemePresetCompareProps>(
  (
    {
      leftPreset,
      rightPreset,
      title = "Theme preset compare",
      description = "Presetler appearance, density, contrast ve intent eksenlerinde ayni compare matrisiyle okunur.",
      axes = ["appearance", "density", "intent", "contrast"],
      className,
      showLivePreview = true,
      showTokenDiff = true,
      tokenCategories = ["surface", "text", "border", "action", "state"],
      collapsible = true,
      defaultExpandedGroups,
      highlightDifferences = true,
      showSwapButton = true,
      onSwap,
      localeText,
      access = "full",
      accessReason,
    },
    ref,
  ) => {
    const accessState = resolveAccessState(access);
    if (accessState.isHidden) return null;

    const leftTokens = useThemeTokens();
    const rightTokens = useThemeTokens();

    const leftFlat = useMemo(
      () => (leftTokens ? flattenTokens(leftTokens) : []),
      [leftTokens],
    );
    const rightFlat = useMemo(
      () => (rightTokens ? flattenTokens(rightTokens) : []),
      [rightTokens],
    );

    const sectionClass = cn(
      "rounded-3xl border border-border-subtle bg-surface-muted p-5 shadow-xs",
      className,
    );

    // Empty state
    if (!leftPreset || !rightPreset) {
      return (
        <section
          ref={ref}
          className={sectionClass}
          data-access-state={accessState.state}
          data-component="theme-preset-compare"
          title={accessReason}
        >
          <Text as="div" className="text-base font-semibold text-text-primary">
            {title}
          </Text>
          <Text variant="secondary" className="mt-1 block text-sm leading-6">
            {description}
          </Text>
          <div className="mt-4 rounded-[24px] border border-border-subtle bg-surface-default p-4">
            <Empty description={localeText?.emptyMessage ?? "Karsilastirma icin iki preset gerekli."} />
          </div>
        </section>
      );
    }

    return (
      <section
        ref={ref}
        className={sectionClass}
        data-access-state={accessState.state}
        data-component="theme-preset-compare"
        title={accessReason}
        {...stateAttrs({ access, component: "theme-preset-compare" })}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Text as="div" className="text-base font-semibold text-text-primary">
              {title}
            </Text>
            <Text variant="secondary" className="mt-1 block text-sm leading-6">
              {description}
            </Text>
          </div>
          {showSwapButton && onSwap && (
            <button
              type="button"
              onClick={onSwap}
              className="shrink-0 rounded-full border border-border-subtle bg-surface-default px-3 py-1.5 text-xs font-medium text-text-primary transition hover:bg-surface-muted"
              aria-label={localeText?.swapLabel ?? "Yer degistir"}
            >
              ⇄ {localeText?.swapLabel ?? "Yer degistir"}
            </button>
          )}
        </div>

        {/* Live preview panels */}
        {showLivePreview && (
          <div className="mt-4">
            <LivePreviewPanels leftPreset={leftPreset} rightPreset={rightPreset} />
          </div>
        )}

        {/* Axis comparison table */}
        <div className="mt-4">
          <AxisComparisonTable
            leftPreset={leftPreset}
            rightPreset={rightPreset}
            axes={axes}
            highlightDifferences={highlightDifferences}
            localeText={localeText}
          />
        </div>

        {/* Visual token diff */}
        {showTokenDiff && leftFlat.length > 0 && rightFlat.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <Text as="div" className="text-sm font-semibold text-text-primary">
              {localeText?.tokenHeader ?? "Token Karsilastirmasi"}
            </Text>
            {tokenCategories.map((cat) => {
              const leftCatTokens = leftFlat.filter((t) => t.category === cat);
              const rightCatTokens = rightFlat.filter((t) => t.category === cat);
              if (leftCatTokens.length === 0) return null;

              const isDefaultExpanded = defaultExpandedGroups
                ? defaultExpandedGroups.includes(cat)
                : true;

              return (
                <TokenDiffGroup
                  key={cat}
                  category={cat}
                  leftTokens={leftCatTokens}
                  rightTokens={rightCatTokens}
                  collapsible={collapsible}
                  defaultExpanded={isDefaultExpanded}
                  highlightDifferences={highlightDifferences}
                />
              );
            })}
          </div>
        )}
      </section>
    );
  },
);

ThemePresetCompare.displayName = "ThemePresetCompare";

export default ThemePresetCompare;

/* ---- Type aliases (backward compat) ---- */
export type ThemePresetCompareRef = React.Ref<HTMLElement>;
export type ThemePresetCompareElement = HTMLElement;
export type ThemePresetCompareCSSProperties = React.CSSProperties;
