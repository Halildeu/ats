import React from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ── Types ──

/**
 * Represents a single node in the organization chart hierarchy.
 * @since 1.0.0
 */
export interface OrgChartNode {
  /** Unique identifier for the node */
  id: string;
  /** Display name — rendered as the primary text */
  label: string;
  /** Job title or role — rendered as secondary text */
  title?: string;
  /** URL or initials string for the avatar circle */
  avatar?: string;
  /** Child nodes in the hierarchy */
  children?: OrgChartNode[];
  /** Arbitrary metadata attached to the node */
  metadata?: Record<string, unknown>;
}

/**
 * Props for the OrgChart component.
 *
 * @example
 * ```tsx
 * <OrgChart
 *   data={{
 *     id: 'ceo',
 *     label: 'Jane Doe',
 *     title: 'CEO',
 *     children: [
 *       { id: 'cto', label: 'John Smith', title: 'CTO' },
 *       { id: 'cfo', label: 'Alice Brown', title: 'CFO' },
 *     ],
 *   }}
 *   onNodeClick={(node) => console.log(node.id)}
 * />
 * ```
 *
 * @since 1.0.0
 * @see OrgChartNode
 */
export interface OrgChartProps extends AccessControlledProps {
  /** Root node of the organization hierarchy */
  data: OrgChartNode;
  /** Callback when a node is clicked */
  onNodeClick?: (node: OrgChartNode) => void;
  /** Tree orientation — vertical renders top-to-bottom, horizontal renders left-to-right */
  orientation?: 'vertical' | 'horizontal';
  /** Width of each node box in pixels (default 160) */
  nodeWidth?: number;
  /** Height of each node box in pixels (default 72) */
  nodeHeight?: number;
  /** Compact mode — tighter spacing, smaller text */
  compact?: boolean;
  /** Array of node IDs to highlight with a colored border */
  highlightPath?: string[];
  /** Additional class names */
  className?: string;
}

// ── Layout helpers ──

interface LayoutNode {
  node: OrgChartNode;
  x: number;
  y: number;
  width: number;
  height: number;
  children: LayoutNode[];
  collapsed: boolean;
}

const H_GAP = 24;
const V_GAP = 56;
const COMPACT_H_GAP = 16;
const COMPACT_V_GAP = 40;

/**
 * Recursively calculate the subtree width needed.
 */
function subtreeWidth(
  node: OrgChartNode,
  nodeW: number,
  hGap: number,
  collapsed: Set<string>,
): number {
  if (!node.children?.length || collapsed.has(node.id)) return nodeW;
  const childrenWidth = node.children.reduce(
    (sum, child) => sum + subtreeWidth(child, nodeW, hGap, collapsed) + hGap,
    -hGap,
  );
  return Math.max(nodeW, childrenWidth);
}

/**
 * Recursively position nodes into a LayoutNode tree.
 */
function layoutTree(
  node: OrgChartNode,
  x: number,
  y: number,
  nodeW: number,
  nodeH: number,
  hGap: number,
  vGap: number,
  collapsed: Set<string>,
): LayoutNode {
  const isCollapsed = collapsed.has(node.id);
  const treeW = subtreeWidth(node, nodeW, hGap, collapsed);
  const nodeX = x + treeW / 2 - nodeW / 2;

  const childLayouts: LayoutNode[] = [];
  if (node.children?.length && !isCollapsed) {
    let childX = x;
    for (const child of node.children) {
      const cw = subtreeWidth(child, nodeW, hGap, collapsed);
      childLayouts.push(
        layoutTree(child, childX, y + nodeH + vGap, nodeW, nodeH, hGap, vGap, collapsed),
      );
      childX += cw + hGap;
    }
  }

  return {
    node,
    x: nodeX,
    y,
    width: nodeW,
    height: nodeH,
    children: childLayouts,
    collapsed: isCollapsed,
  };
}

/**
 * Compute the bounding box of the entire layout tree.
 */
function treeBounds(layout: LayoutNode): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = layout.x;
  let minY = layout.y;
  let maxX = layout.x + layout.width;
  let maxY = layout.y + layout.height;
  for (const child of layout.children) {
    const cb = treeBounds(child);
    minX = Math.min(minX, cb.minX);
    minY = Math.min(minY, cb.minY);
    maxX = Math.max(maxX, cb.maxX);
    maxY = Math.max(maxY, cb.maxY);
  }
  return { minX, minY, maxX, maxY };
}

// ── SVG rendering helpers ──

function renderConnectors(layout: LayoutNode): React.ReactNode[] {
  const connectors: React.ReactNode[] = [];
  if (!layout.children.length) return connectors;

  const parentCx = layout.x + layout.width / 2;
  const parentBottom = layout.y + layout.height;

  for (const child of layout.children) {
    const childCx = child.x + child.width / 2;
    const childTop = child.y;
    const midY = parentBottom + (childTop - parentBottom) / 2;

    connectors.push(
      <path
        key={`conn-${layout.node.id}-${child.node.id}`}
        d={`M ${parentCx} ${parentBottom} L ${parentCx} ${midY} L ${childCx} ${midY} L ${childCx} ${childTop}`}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />,
    );

    connectors.push(...renderConnectors(child));
  }

  return connectors;
}

function renderNode(
  layout: LayoutNode,
  compact: boolean,
  highlighted: Set<string>,
  onClick?: (node: OrgChartNode) => void,
  isDisabled?: boolean,
): React.ReactNode[] {
  const { node, x, y, width, height, collapsed } = layout;
  const isHighlighted = highlighted.has(node.id);
  const hasChildren = !!node.children?.length;
  const avatarR = compact ? 12 : 16;
  const padding = compact ? 6 : 10;
  const labelFontSize = compact ? 10 : 12;
  const titleFontSize = compact ? 8 : 10;
  const rx = 8;

  const elements: React.ReactNode[] = [];

  elements.push(
    <g
      key={`node-${node.id}`}
      role="treeitem"
      aria-label={node.label}
      aria-expanded={hasChildren ? !collapsed : undefined}
      data-node-id={node.id}
      style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
      onClick={() => {
        if (!isDisabled && onClick) onClick(node);
      }}
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (!isDisabled && onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(node);
        }
      }}
    >
      {/* Shadow */}
      <rect x={x + 1} y={y + 2} width={width} height={height} rx={rx} fill="rgba(0,0,0,0.06)" />
      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={rx}
        fill="var(--surface-primary)"
        stroke={isHighlighted ? 'var(--interactive-primary)' : 'var(--border-default)'}
        strokeWidth={isHighlighted ? 2.5 : 1}
      />
      {/* Avatar circle */}
      <circle
        cx={x + padding + avatarR}
        cy={y + height / 2}
        r={avatarR}
        fill="var(--surface-muted)"
        stroke="var(--border-default)"
        strokeWidth={0.5}
      />
      {/* Avatar initials */}
      <text
        x={x + padding + avatarR}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={avatarR * 0.85}
        fontWeight={600}
        fill="var(--text-secondary)"
      >
        {node.avatar ??
          node.label
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
      </text>
      {/* Label */}
      <text
        x={x + padding + avatarR * 2 + 8}
        y={y + height / 2 - (node.title ? titleFontSize * 0.6 : 0)}
        fontSize={labelFontSize}
        fontWeight={600}
        fill="var(--text-primary)"
        dominantBaseline="central"
      >
        {node.label.length > 16 ? `${node.label.slice(0, 15)}...` : node.label}
      </text>
      {/* Title */}
      {node.title && (
        <text
          x={x + padding + avatarR * 2 + 8}
          y={y + height / 2 + titleFontSize * 1.1}
          fontSize={titleFontSize}
          fill="var(--text-secondary)"
          dominantBaseline="central"
        >
          {node.title.length > 20 ? `${node.title.slice(0, 19)}...` : node.title}
        </text>
      )}
      {/* Expand/collapse indicator */}
      {hasChildren && (
        <g>
          <circle
            cx={x + width / 2}
            cy={y + height + 8}
            r={8}
            fill="var(--surface-primary)"
            stroke="var(--border-default)"
            strokeWidth={1}
          />
          <text
            x={x + width / 2}
            y={y + height + 8}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fill="var(--text-secondary)"
          >
            {collapsed ? '+' : '\u2212'}
          </text>
        </g>
      )}
    </g>,
  );

  for (const child of layout.children) {
    elements.push(...renderNode(child, compact, highlighted, onClick, isDisabled));
  }

  return elements;
}

// ── Component ──

/**
 * **OrgChart** — hierarchical organization chart rendered as pure SVG.
 *
 * Renders a tree of `OrgChartNode` items with connector lines, avatar circles,
 * expand/collapse toggling, path highlighting, and compact mode.
 *
 * @example
 * ```tsx
 * <OrgChart
 *   data={orgTree}
 *   orientation="vertical"
 *   highlightPath={['ceo', 'cto']}
 *   onNodeClick={(n) => alert(n.label)}
 * />
 * ```
 *
 * @since 1.0.0
 * @see OrgChartNode
 * @see OrgChartProps
 */
export function OrgChart({
  data,
  onNodeClick,
  orientation = 'vertical',
  nodeWidth = 160,
  nodeHeight = 72,
  compact = false,
  highlightPath = [],
  className,
  access,
}: OrgChartProps) {
  const { isHidden, isDisabled, state } = resolveAccessState(access);

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const handleNodeClick = React.useCallback(
    (node: OrgChartNode) => {
      if (node.children?.length) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
      }
      onNodeClick?.(node);
    },
    [onNodeClick],
  );

  if (isHidden) return null;

  const isHorizontal = orientation === 'horizontal';
  const nw = compact ? Math.round(nodeWidth * 0.8) : nodeWidth;
  const nh = compact ? Math.round(nodeHeight * 0.8) : nodeHeight;
  const hGap = compact ? COMPACT_H_GAP : H_GAP;
  const vGap = compact ? COMPACT_V_GAP : V_GAP;

  const layout = layoutTree(data, 0, 0, nw, nh, hGap, vGap, collapsed);
  const bounds = treeBounds(layout);
  const padding = 24;
  const svgW = bounds.maxX - bounds.minX + padding * 2;
  const svgH = bounds.maxY - bounds.minY + padding * 2;
  const offsetX = -bounds.minX + padding;
  const offsetY = -bounds.minY + padding;

  const highlighted = new Set(highlightPath);

  return (
    <div
      className={cn('org-chart-root overflow-auto', accessStyles(state), className)}
      role="tree"
      aria-label="Organization chart"
      data-testid="org-chart"
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          minWidth: svgW,
          minHeight: svgH,
          transform: isHorizontal ? 'rotate(90deg)' : undefined,
          transformOrigin: isHorizontal ? 'center center' : undefined,
        }}
      >
        <g transform={`translate(${offsetX}, ${offsetY})`}>
          {/* Connectors first (behind nodes) */}
          {renderConnectors(layout)}
          {/* Nodes */}
          {renderNode(layout, compact, highlighted, handleNodeClick, isDisabled)}
        </g>
      </svg>
    </div>
  );
}

OrgChart.displayName = 'OrgChart';
