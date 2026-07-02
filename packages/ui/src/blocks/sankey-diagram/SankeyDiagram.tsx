import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';
import { formatValue, type FormatOptions } from '../../utils/format-helpers';

// ── Types ──

export interface SankeyNode {
  id: string;
  label: string;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface LayoutNode {
  id: string;
  label: string;
  color: string;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  totalFlow: number;
  sourceOffset: number;
  targetOffset: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  sourceY: number;
  targetY: number;
  thickness: number;
}

/** Props for the SankeyDiagram component. */
export interface SankeyDiagramProps extends AccessControlledProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Diagram width (default 700) */
  width?: number;
  /** Diagram height (default 400) */
  height?: number;
  /** Node rectangle width (default 20) */
  nodeWidth?: number;
  /** Vertical gap between nodes (default 12) */
  nodePadding?: number;
  /** Show values on links */
  showValues?: boolean;
  /** Number formatting */
  formatOptions?: FormatOptions;
  /** Click handlers */
  onNodeClick?: (node: SankeyNode) => void;
  onLinkClick?: (link: SankeyLink) => void;
  /** Color palette for nodes without explicit color */
  palette?: string[];
  /** Additional class names */
  className?: string;
}

// ── Default palette ──

const DEFAULT_PALETTE = [
  'var(--action-primary)',
  'var(--state-info-text)',
  'var(--state-success-text)',
  'var(--state-warning-text)',
  'var(--state-error-text)',
  'var(--chart-purple)',
  'var(--chart-pink)',
  'var(--chart-cyan)',
  'var(--chart-amber)',
  'var(--chart-emerald)',
];

// ── Layout algorithm ──

function computeNodeLayers(nodes: SankeyNode[], links: SankeyLink[]): Map<string, number> {
  const layers = new Map<string, number>();
  const incomingSources = new Map<string, Set<string>>();

  for (const n of nodes) {
    incomingSources.set(n.id, new Set());
  }
  for (const l of links) {
    incomingSources.get(l.target)?.add(l.source);
  }

  // Topological assignment — nodes with no incoming links are layer 0
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incomingSources.get(n.id)?.size ?? 0) === 0) {
      layers.set(n.id, 0);
      queue.push(n.id);
    }
  }

  const outLinks = new Map<string, SankeyLink[]>();
  for (const l of links) {
    if (!outLinks.has(l.source)) outLinks.set(l.source, []);
    outLinks.get(l.source)!.push(l);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const currentLayer = layers.get(nodeId) ?? 0;
    for (const l of outLinks.get(nodeId) ?? []) {
      const prevLayer = layers.get(l.target) ?? -1;
      if (currentLayer + 1 > prevLayer) {
        layers.set(l.target, currentLayer + 1);
      }
      // Only add to queue if all sources have been assigned
      const sources = incomingSources.get(l.target);
      const allAssigned = sources ? [...sources].every((s) => layers.has(s)) : true;
      if (allAssigned && !queue.includes(l.target)) {
        queue.push(l.target);
      }
    }
  }

  // Fallback: assign any unvisited nodes
  for (const n of nodes) {
    if (!layers.has(n.id)) layers.set(n.id, 0);
  }

  return layers;
}

function computeLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  height: number,
  nodeWidth: number,
  nodePadding: number,
  palette: string[],
): { layoutNodes: LayoutNode[]; layoutLinks: LayoutLink[] } {
  const layerMap = computeNodeLayers(nodes, links);
  const maxLayer = Math.max(0, ...layerMap.values());

  // Group by layer
  const layerGroups = new Map<number, SankeyNode[]>();
  for (const n of nodes) {
    const layer = layerMap.get(n.id) ?? 0;
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(n);
  }

  // Compute total flow per node
  const flowMap = new Map<string, number>();
  for (const n of nodes) flowMap.set(n.id, 0);
  for (const l of links) {
    flowMap.set(l.source, (flowMap.get(l.source) ?? 0) + l.value);
    flowMap.set(l.target, (flowMap.get(l.target) ?? 0) + l.value);
  }

  // Horizontal spacing
  const layerSpacing = maxLayer > 0 ? (width - nodeWidth) / maxLayer : 0;

  // Compute node positions per layer
  const layoutNodeMap = new Map<string, LayoutNode>();
  let globalIdx = 0;

  for (let layer = 0; layer <= maxLayer; layer++) {
    const group = layerGroups.get(layer) ?? [];
    const totalFlow = group.reduce((s, n) => s + (flowMap.get(n.id) ?? 0), 0);
    const availableH = height - nodePadding * (group.length - 1);
    let yOffset = 0;

    for (const n of group) {
      const flow = flowMap.get(n.id) ?? 0;
      const nodeH =
        totalFlow > 0 ? Math.max(4, (flow / totalFlow) * availableH) : availableH / group.length;
      const color = n.color ?? palette[globalIdx % palette.length];

      const layoutNode: LayoutNode = {
        id: n.id,
        label: n.label,
        color,
        layer,
        x: layer * layerSpacing,
        y: yOffset,
        width: nodeWidth,
        height: nodeH,
        totalFlow: flow,
        sourceOffset: 0,
        targetOffset: 0,
      };
      layoutNodeMap.set(n.id, layoutNode);
      yOffset += nodeH + nodePadding;
      globalIdx++;
    }
  }

  // Compute link paths with port offsets
  const layoutLinks: LayoutLink[] = [];

  // Sort links by target y for consistent ordering
  const sortedLinks = [...links].sort((a, b) => {
    const aNode = layoutNodeMap.get(a.target);
    const bNode = layoutNodeMap.get(b.target);
    return (aNode?.y ?? 0) - (bNode?.y ?? 0);
  });

  for (const l of sortedLinks) {
    const sourceNode = layoutNodeMap.get(l.source);
    const targetNode = layoutNodeMap.get(l.target);
    if (!sourceNode || !targetNode) continue;

    const thickness =
      sourceNode.totalFlow > 0
        ? Math.max(1, (l.value / sourceNode.totalFlow) * sourceNode.height)
        : 2;

    const sourceY = sourceNode.y + sourceNode.sourceOffset + thickness / 2;
    const targetY = targetNode.y + targetNode.targetOffset + thickness / 2;

    sourceNode.sourceOffset += thickness;
    targetNode.targetOffset += thickness;

    layoutLinks.push({
      source: sourceNode,
      target: targetNode,
      value: l.value,
      sourceY,
      targetY,
      thickness,
    });
  }

  return {
    layoutNodes: [...layoutNodeMap.values()],
    layoutLinks,
  };
}

// ── Component ──

/**
 * Flow diagram visualizing weighted directional relationships between nodes using proportional links.
 *
 * @example
 * ```tsx
 * <SankeyDiagram
 *   nodes={[{ id: 'a', label: 'Source' }, { id: 'b', label: 'Target' }]}
 *   links={[{ source: 'a', target: 'b', value: 100 }]}
 *   width={600}
 *   height={300}
 * />
 * ```
 */
export const SankeyDiagram: React.FC<SankeyDiagramProps> = ({
  nodes,
  links,
  width = 700,
  height = 400,
  nodeWidth = 20,
  nodePadding = 12,
  showValues = false,
  formatOptions = {},
  onNodeClick,
  onLinkClick,
  palette = DEFAULT_PALETTE,
  className,
  access,
  accessReason,
}) => {
  const accessState = resolveAccessState(access);
  if (accessState.isHidden) return null;

  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [hoveredLinkIdx, setHoveredLinkIdx] = React.useState<number | null>(null);

  const { layoutNodes, layoutLinks } = React.useMemo(
    () => computeLayout(nodes, links, width, height, nodeWidth, nodePadding, palette),
    [nodes, links, width, height, nodeWidth, nodePadding, palette],
  );

  // Generate unique gradient IDs per component instance
  const gradientIdPrefix = React.useId?.() ?? 'sankey';

  if (nodes.length === 0) {
    return (
      <div className={cn('p-8 text-center text-sm text-[var(--text-tertiary)]', className)}>
        No Sankey data
      </div>
    );
  }

  // Set of connected link indices for hover highlight
  const connectedLinks = new Set<number>();
  if (hoveredNodeId !== null) {
    layoutLinks.forEach((l, i) => {
      if (l.source.id === hoveredNodeId || l.target.id === hoveredNodeId) {
        connectedLinks.add(i);
      }
    });
  }

  const labelPad = 6;

  return (
    <div
      className={cn(
        'border border-border-default rounded-lg bg-surface-default p-4 overflow-hidden',
        accessStyles(accessState.state),
        className,
      )}
      data-component="sankey-diagram"
      data-access-state={accessState.state}
      title={accessReason}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Sankey diagram"
      >
        <defs>
          {layoutLinks.map((l, i) => (
            <linearGradient
              key={`grad-${i}`}
              id={`${gradientIdPrefix}-link-${i}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={l.source.color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={l.target.color} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {/* Links */}
        {layoutLinks.map((l, i) => {
          const sx = l.source.x + l.source.width;
          const tx = l.target.x;
          const cp = (tx - sx) * 0.5;
          const path = `M ${sx},${l.sourceY} C ${sx + cp},${l.sourceY} ${tx - cp},${l.targetY} ${tx},${l.targetY}`;

          const isConnected = connectedLinks.has(i);
          const isLinkHovered = hoveredLinkIdx === i;
          const isDimmed = hoveredNodeId !== null && !isConnected;

          return (
            <g key={`link-${i}`}>
              <path
                d={path}
                fill="none"
                stroke={`url(#${gradientIdPrefix}-link-${i})`}
                strokeWidth={l.thickness}
                opacity={isDimmed ? 0.15 : isLinkHovered || isConnected ? 0.85 : 0.45}
                role={onLinkClick ? 'button' : undefined}
                tabIndex={onLinkClick ? 0 : undefined}
                className={cn(onLinkClick && 'cursor-pointer')}
                onClick={() => {
                  const original = links.find(
                    (ol) =>
                      ol.source === l.source.id &&
                      ol.target === l.target.id &&
                      ol.value === l.value,
                  );
                  if (original) onLinkClick?.(original);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const original = links.find(
                      (ol) =>
                        ol.source === l.source.id &&
                        ol.target === l.target.id &&
                        ol.value === l.value,
                    );
                    if (original) onLinkClick?.(original);
                  }
                }}
                onMouseEnter={() => setHoveredLinkIdx(i)}
                onMouseLeave={() => setHoveredLinkIdx(null)}
                style={{ transition: 'opacity 0.15s ease' }}
              />
              {/* Value label on link */}
              {showValues && l.thickness > 6 && (
                <text
                  x={(sx + tx) / 2}
                  y={(l.sourceY + l.targetY) / 2 + 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-tertiary)"
                  opacity={isDimmed ? 0.3 : 0.8}
                  style={{ pointerEvents: 'none' }}
                >
                  {formatValue(l.value, formatOptions)}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {layoutNodes.map((n) => {
          const isDimmed = hoveredNodeId !== null && hoveredNodeId !== n.id;
          const isRight = n.layer === Math.max(...layoutNodes.map((nn) => nn.layer));

          return (
            <g
              key={n.id}
              role={onNodeClick ? 'button' : undefined}
              tabIndex={onNodeClick ? 0 : undefined}
              className={cn(onNodeClick && 'cursor-pointer')}
              onClick={() => {
                const original = nodes.find((on) => on.id === n.id);
                if (original) onNodeClick?.(original);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const original = nodes.find((on) => on.id === n.id);
                  if (original) onNodeClick?.(original);
                }
              }}
              onMouseEnter={() => setHoveredNodeId(n.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              <rect
                x={n.x}
                y={n.y}
                width={n.width}
                height={n.height}
                fill={n.color}
                opacity={isDimmed ? 0.3 : 1}
                rx={2}
                style={{ transition: 'opacity 0.15s ease' }}
              />
              {/* Node label */}
              <text
                x={isRight ? n.x - labelPad : n.x + n.width + labelPad}
                y={n.y + n.height / 2}
                textAnchor={isRight ? 'end' : 'start'}
                dominantBaseline="central"
                fontSize={11}
                fontWeight={500}
                fill="var(--text-primary)"
                opacity={isDimmed ? 0.3 : 1}
                style={{ pointerEvents: 'none' }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

SankeyDiagram.displayName = 'SankeyDiagram';
export default SankeyDiagram;
