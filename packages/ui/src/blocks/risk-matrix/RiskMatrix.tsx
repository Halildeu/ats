import React, { useMemo, useCallback, useState } from 'react';
import { resolveAccessState, accessStyles } from '../../internal/access-controller';
import type { AccessLevel } from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RiskItem {
  id: string;
  title: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
}

export type RiskMatrixSize = 'sm' | 'md' | 'lg';

/** Props for the RiskMatrix component.
 * @example
 * ```tsx
 * <RiskMatrix />
 * ```
 * @since 1.0.0
 * @see [Docs](https://design.mfe.dev/components/risk-matrix)
 */
export interface RiskMatrixProps {
  /** Risk items to plot on the 5x5 matrix grid */
  risks: RiskItem[];
  /** Labels for the likelihood axis (columns), index 0 = level 1. Default: Rare..Almost Certain */
  likelihoodLabels?: [string, string, string, string, string];
  /** Labels for the impact axis (rows), index 0 = level 1. Default: Insignificant..Catastrophic */
  impactLabels?: [string, string, string, string, string];
  /** Show color legend below matrix */
  showLegend?: boolean;
  /** Controls the cell dimensions and font sizes */
  size?: RiskMatrixSize;
  /** Access level controlling visibility and interactivity */
  access?: AccessLevel;
  /** Tooltip text explaining the current access restriction */
  accessReason?: string;
  /** Called when a matrix cell is clicked, receives the risks in that cell */
  onCellClick?: (risks: RiskItem[], likelihood: number, impact: number) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIKELIHOOD: [string, string, string, string, string] = [
  'Rare',
  'Unlikely',
  'Possible',
  'Likely',
  'Almost Certain',
];
const DEFAULT_IMPACT: [string, string, string, string, string] = [
  'Insignificant',
  'Minor',
  'Moderate',
  'Major',
  'Catastrophic',
];

type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

function getRiskLevel(likelihood: number, impact: number): RiskLevel {
  const score = likelihood * impact;
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 14) return 'high';
  return 'extreme';
}

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: { bg: 'var(--state-success-bg)', text: 'var(--state-success-text)', label: 'Low (1-4)' },
  medium: {
    bg: 'var(--state-warning-bg)',
    text: 'var(--state-warning-text)',
    label: 'Medium (5-9)',
  },
  high: { bg: 'var(--state-error-bg)', text: 'var(--state-error-text)', label: 'High (10-14)' },
  extreme: {
    bg: 'var(--state-error-bg)',
    text: 'var(--state-error-text)',
    label: 'Extreme (15-25)',
  },
};

const SIZE_CONFIG: Record<
  RiskMatrixSize,
  { cell: number; fontSize: string; labelSize: string; badgeSize: string }
> = {
  sm: {
    cell: 40,
    fontSize: 'text-[10px]',
    labelSize: 'text-[9px]',
    badgeSize: 'w-5 h-5 text-[10px]',
  },
  md: { cell: 56, fontSize: 'text-xs', labelSize: 'text-[10px]', badgeSize: 'w-6 h-6 text-xs' },
  lg: { cell: 72, fontSize: 'text-sm', labelSize: 'text-xs', badgeSize: 'w-8 h-8 text-sm' },
};

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  risks: RiskItem[];
  likelihood: number;
  impact: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** 5x5 risk assessment matrix plotting likelihood vs impact with color-coded severity levels. */
export function RiskMatrix({
  risks,
  likelihoodLabels = DEFAULT_LIKELIHOOD,
  impactLabels = DEFAULT_IMPACT,
  showLegend = true,
  size = 'md',
  access,
  accessReason,
  onCellClick,
  className = '',
}: RiskMatrixProps) {
  const accessState = resolveAccessState(access);
  const { isHidden, isDisabled, isReadonly } = accessState;
  if (isHidden) return null;

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const s = SIZE_CONFIG[size];

  // Group risks by cell
  const riskMap = useMemo(() => {
    const map = new Map<string, RiskItem[]>();
    for (const risk of risks) {
      const key = `${risk.likelihood}-${risk.impact}`;
      const arr = map.get(key) ?? [];
      arr.push(risk);
      map.set(key, arr);
    }
    return map;
  }, [risks]);

  const canInteract = !isDisabled && !isReadonly;

  const handleCellEnter = useCallback(
    (e: React.MouseEvent, cellRisks: RiskItem[], l: number, i: number) => {
      if (cellRisks.length === 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        risks: cellRisks,
        likelihood: l,
        impact: i,
      });
    },
    [],
  );

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  const handleCellClick = useCallback(
    (cellRisks: RiskItem[], l: number, i: number) => {
      if (onCellClick && canInteract) {
        onCellClick(cellRisks, l, i);
      }
    },
    [onCellClick, canInteract],
  );

  // Rows go from impact 5 (top) to 1 (bottom)
  const impactLevels = [5, 4, 3, 2, 1] as const;
  const likelihoodLevels = [1, 2, 3, 4, 5] as const;

  return (
    <div
      className={`inline-block ${accessStyles(accessState.state)} ${className}`}
      role="group"
      aria-label="Risk assessment matrix"
      data-access-state={accessState.state}
      {...(isDisabled ? { 'aria-disabled': true } : {})}
      {...(accessReason ? { title: accessReason } : {})}
    >
      {/* Axis label: Impact (vertical) */}
      <div className="flex">
        <div
          className="flex flex-col items-center justify-center mr-1"
          style={{ width: s.cell * 0.8 }}
        >
          <span
            className={`${s.labelSize} font-medium text-text-secondary writing-mode-vertical`}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Impact
          </span>
        </div>

        <div>
          {/* Column headers (likelihood) */}
          <div className="flex" style={{ marginLeft: s.cell * 0.7 }}>
            {likelihoodLevels.map((l) => (
              <div
                key={`lh-${l}`}
                className={`${s.labelSize} text-center text-text-secondary truncate px-0.5`}
                style={{ width: s.cell }}
                title={likelihoodLabels[l - 1]}
              >
                {likelihoodLabels[l - 1]}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {impactLevels.map((impact) => (
            <div key={`row-${impact}`} className="flex items-center">
              {/* Row label */}
              <div
                className={`${s.labelSize} text-right text-text-secondary pr-1.5 truncate`}
                style={{ width: s.cell * 0.7 }}
                title={impactLabels[impact - 1]}
              >
                {impactLabels[impact - 1]}
              </div>

              {/* Cells */}
              {likelihoodLevels.map((likelihood) => {
                const level = getRiskLevel(likelihood, impact);
                const color = RISK_COLORS[level];
                const key = `${likelihood}-${impact}`;
                const cellRisks = riskMap.get(key) ?? [];
                const count = cellRisks.length;
                const isClickable = canInteract && onCellClick;

                return (
                  <div
                    key={key}
                    role={isClickable ? 'button' : 'img'}
                    aria-label={`Likelihood ${likelihood}, Impact ${impact}: ${count} risk${count !== 1 ? 's' : ''}, ${level} level`}
                    tabIndex={isClickable ? 0 : undefined}
                    onClick={() => handleCellClick(cellRisks, likelihood, impact)}
                    onMouseEnter={(e) => handleCellEnter(e, cellRisks, likelihood, impact)}
                    onMouseLeave={handleCellLeave}
                    onKeyDown={
                      isClickable
                        ? (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCellClick(cellRisks, likelihood, impact);
                            }
                          }
                        : undefined
                    }
                    className={[
                      'flex items-center justify-center border border-surface-default',
                      'transition-[scale] duration-(--motion-duration-fast)',
                      isClickable
                        ? 'cursor-pointer hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]'
                        : '',
                    ].join(' ')}
                    style={{
                      width: s.cell,
                      height: s.cell,
                      backgroundColor: color.bg,
                    }}
                  >
                    {count > 0 && (
                      <span
                        className={`${s.badgeSize} inline-flex items-center justify-center rounded-full font-semibold`}
                        style={{ backgroundColor: color.text, color: 'var(--text-inverse)' }}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Axis label: Likelihood (horizontal) */}
          <div
            className={`${s.labelSize} text-center text-text-secondary mt-1 font-medium`}
            style={{ marginLeft: s.cell * 0.7 }}
          >
            Likelihood
          </div>
        </div>
      </div>

      {/* Tooltip (portal-free, positioned via fixed) */}
      {tooltip && tooltip.risks.length > 0 && (
        <div
          className="fixed z-50 px-2.5 py-1.5 rounded-xs shadow-lg bg-[var(--surface-elevated)] text-[var(--text-on-elevated)] text-xs max-w-[220px] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
          role="tooltip"
        >
          <div className="font-medium mb-0.5">
            L{tooltip.likelihood} / I{tooltip.impact} ({tooltip.risks.length} risk
            {tooltip.risks.length !== 1 ? 's' : ''})
          </div>
          <ul className="list-disc list-inside">
            {tooltip.risks.slice(0, 5).map((r) => (
              <li key={r.id} className="truncate">
                {r.title}
              </li>
            ))}
            {tooltip.risks.length > 5 && (
              <li className="text-text-secondary">+{tooltip.risks.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div
          className="flex items-center gap-3 mt-3 flex-wrap"
          role="list"
          aria-label="Risk level legend"
        >
          {(Object.keys(RISK_COLORS) as RiskLevel[]).map((level) => {
            const c = RISK_COLORS[level];
            return (
              <div key={level} className="flex items-center gap-1" role="listitem">
                <span
                  className="inline-block w-3 h-3 rounded-xs border"
                  style={{ backgroundColor: c.bg, borderColor: c.text }}
                  aria-hidden="true"
                />
                <span className={`${s.labelSize} text-text-secondary`}>{c.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

RiskMatrix.displayName = 'RiskMatrix';

export default RiskMatrix;
