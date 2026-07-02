import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { cn } from '../../utils/cn';
import {
  resolveAccessState,
  accessStyles,
  type AccessControlledProps,
} from '../../internal/access-controller';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProcessNodeType =
  | 'start'
  | 'end'
  | 'task'
  | 'decision'
  | 'subprocess'
  | 'timer'
  | 'message'
  | 'parallel-gateway';

export type ProcessNodeStatus = 'idle' | 'active' | 'completed' | 'error' | 'skipped';

export interface ProcessNode {
  id: string;
  type: ProcessNodeType;
  label: string;
  status?: ProcessNodeStatus;
}

export interface ProcessEdge {
  from: string;
  to: string;
  label?: string;
}

/** SVG-based process flow diagram with auto-layout, status badges, and path highlighting. */
export interface ProcessFlowProps extends AccessControlledProps {
  /** Process nodes (tasks, decisions, gateways, etc.) to render */
  nodes: ProcessNode[];
  /** Directed edges connecting nodes */
  edges: ProcessEdge[];
  /** Layout direction for the auto-arranged diagram */
  orientation?: 'horizontal' | 'vertical';
  /** Node IDs to highlight as the active execution path */
  highlightPath?: string[];
  /** Called when a node shape is clicked */
  onNodeClick?: (nodeId: string) => void;
  /** Additional CSS class names for the root element */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_W = 120;
const NODE_H = 60;
const GAP_H = 100;
const GAP_V = 40;
const CIRCLE_R = 22;

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_FILL: Record<ProcessNodeStatus, string> = {
  idle: 'var(--text-disabled)',
  active: 'var(--action-primary)',
  completed: 'var(--state-success-text)',
  error: 'var(--state-error-text)',
  skipped: 'var(--border-strong)',
};

const STATUS_STROKE: Record<ProcessNodeStatus, string> = {
  idle: 'var(--border-strong)',
  active: 'var(--action-primary)',
  completed: 'var(--state-success-text)',
  error: 'var(--state-error-text)',
  skipped: 'var(--text-secondary)',
};

// ---------------------------------------------------------------------------
// Layout algorithm
// ---------------------------------------------------------------------------

interface LayoutNode {
  id: string;
  layer: number;
  order: number;
  x: number;
  y: number;
  node: ProcessNode;
}

function buildLayout(
  nodes: ProcessNode[],
  edges: ProcessEdge[],
  orientation: 'horizontal' | 'vertical',
): { layoutNodes: LayoutNode[]; width: number; height: number } {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  // Topological sort + longest-path layering
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    dist.set(n.id, 0);
    if ((inDeg.get(n.id) ?? 0) === 0) queue.push(n.id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    sorted.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const nd = Math.max(dist.get(next) ?? 0, (dist.get(cur) ?? 0) + 1);
      dist.set(next, nd);
      const newIn = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, newIn);
      if (newIn === 0) queue.push(next);
    }
  }

  // Group by layer
  const layers = new Map<number, string[]>();
  for (const id of sorted) {
    const layer = dist.get(id) ?? 0;
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(id);
  }

  const maxLayer = Math.max(...Array.from(layers.keys()), 0);
  const maxPerLayer = Math.max(...Array.from(layers.values()).map((l) => l.length), 1);

  const layoutNodes: LayoutNode[] = [];
  const padding = 40;

  for (const [layer, ids] of layers) {
    ids.forEach((id, order) => {
      let x: number;
      let y: number;
      if (orientation === 'horizontal') {
        x = padding + layer * (NODE_W + GAP_H) + NODE_W / 2;
        y = padding + order * (NODE_H + GAP_V) + NODE_H / 2;
      } else {
        x = padding + order * (NODE_W + GAP_H) + NODE_W / 2;
        y = padding + layer * (NODE_H + GAP_V) + NODE_H / 2;
      }
      layoutNodes.push({ id, layer, order, x, y, node: nodeMap.get(id)! });
    });
  }

  const w =
    orientation === 'horizontal'
      ? padding * 2 + (maxLayer + 1) * (NODE_W + GAP_H) - GAP_H
      : padding * 2 + maxPerLayer * (NODE_W + GAP_H) - GAP_H;
  const h =
    orientation === 'horizontal'
      ? padding * 2 + maxPerLayer * (NODE_H + GAP_V) - GAP_V
      : padding * 2 + (maxLayer + 1) * (NODE_H + GAP_V) - GAP_V;

  return { layoutNodes, width: Math.max(w, 200), height: Math.max(h, 120) };
}

// ---------------------------------------------------------------------------
// Node shape renderers
// ---------------------------------------------------------------------------

function renderNodeShape(
  type: ProcessNodeType,
  status: ProcessNodeStatus,
  x: number,
  y: number,
  highlight: boolean,
): React.ReactNode {
  const fill = STATUS_FILL[status];
  const stroke = highlight ? 'var(--state-info-text)' : STATUS_STROKE[status];
  const sw = highlight ? 3 : 2;
  const dashArray = status === 'skipped' ? '6 3' : undefined;

  switch (type) {
    case 'start':
      return (
        <circle
          cx={x}
          cy={y}
          r={CIRCLE_R}
          fill="var(--state-success-text)"
          fillOpacity={0.2}
          stroke="var(--state-success-text)"
          strokeWidth={sw}
          strokeDasharray={dashArray}
        />
      );
    case 'end':
      return (
        <g>
          <circle
            cx={x}
            cy={y}
            r={CIRCLE_R}
            fill="var(--state-error-text)"
            fillOpacity={0.2}
            stroke="var(--state-error-text)"
            strokeWidth={4}
            strokeDasharray={dashArray}
          />
          <circle
            cx={x}
            cy={y}
            r={CIRCLE_R - 6}
            fill="var(--state-error-text)"
            fillOpacity={0.4}
            stroke="none"
          />
        </g>
      );
    case 'task':
      return (
        <rect
          x={x - NODE_W / 2}
          y={y - NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={fill}
          fillOpacity={0.2}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dashArray}
        />
      );
    case 'decision': {
      const half = 30;
      const pts = `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`;
      return (
        <polygon
          points={pts}
          fill="var(--state-warning-text)"
          fillOpacity={0.2}
          stroke="var(--state-warning-text)"
          strokeWidth={sw}
          strokeDasharray={dashArray}
        />
      );
    }
    case 'subprocess':
      return (
        <g>
          <rect
            x={x - NODE_W / 2}
            y={y - NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx={4}
            fill={fill}
            fillOpacity={0.2}
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray={dashArray}
          />
          <rect
            x={x - NODE_W / 2 + 4}
            y={y - NODE_H / 2 + 4}
            width={NODE_W - 8}
            height={NODE_H - 8}
            rx={2}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
          />
        </g>
      );
    case 'timer':
      return (
        <g>
          <circle
            cx={x}
            cy={y}
            r={CIRCLE_R}
            fill={fill}
            fillOpacity={0.2}
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray="4 2"
          />
          {/* Clock icon */}
          <line x1={x} y1={y - 8} x2={x} y2={y} stroke={stroke} strokeWidth={1.5} />
          <line x1={x} y1={y} x2={x + 6} y2={y + 4} stroke={stroke} strokeWidth={1.5} />
        </g>
      );
    case 'message': {
      const w = NODE_W * 0.7;
      const h = NODE_H * 0.55;
      return (
        <g>
          <rect
            x={x - w / 2}
            y={y - h / 2}
            width={w}
            height={h}
            rx={2}
            fill={fill}
            fillOpacity={0.2}
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray={dashArray}
          />
          {/* Envelope flap */}
          <polyline
            points={`${x - w / 2},${y - h / 2} ${x},${y + 2} ${x + w / 2},${y - h / 2}`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
          />
        </g>
      );
    }
    case 'parallel-gateway': {
      const half = 28;
      const pts = `${x},${y - half} ${x + half},${y} ${x},${y + half} ${x - half},${y}`;
      return (
        <g>
          <polygon
            points={pts}
            fill={fill}
            fillOpacity={0.2}
            stroke={stroke}
            strokeWidth={sw}
            strokeDasharray={dashArray}
          />
          {/* Plus sign */}
          <line x1={x - 10} y1={y} x2={x + 10} y2={y} stroke={stroke} strokeWidth={2} />
          <line x1={x} y1={y - 10} x2={x} y2={y + 10} stroke={stroke} strokeWidth={2} />
        </g>
      );
    }
    default:
      return (
        <rect
          x={x - NODE_W / 2}
          y={y - NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={4}
          fill={fill}
          fillOpacity={0.2}
          stroke={stroke}
          strokeWidth={sw}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status, x, y }: { status: ProcessNodeStatus; x: number; y: number }) {
  if (status === 'idle') return null;
  const color = STATUS_FILL[status];
  const labels: Record<ProcessNodeStatus, string> = {
    idle: '',
    active: 'A',
    completed: '\u2713',
    error: '!',
    skipped: '-',
  };
  return (
    <g>
      <circle
        cx={x + NODE_W / 2 - 8}
        cy={y - NODE_H / 2 + 4}
        r={9}
        fill={color}
        stroke="var(--surface-default)"
        strokeWidth={1.5}
      />
      <text
        x={x + NODE_W / 2 - 8}
        y={y - NODE_H / 2 + 8}
        textAnchor="middle"
        fontSize={10}
        fill="var(--text-inverse)"
        fontWeight="bold"
      >
        {labels[status]}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Active pulse animation
// ---------------------------------------------------------------------------

function ActivePulse({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={CIRCLE_R + 6}
      fill="none"
      stroke="var(--action-primary)"
      strokeWidth={1.5}
      opacity={0.5}
    >
      <animate
        attributeName="r"
        from={String(CIRCLE_R + 2)}
        to={String(CIRCLE_R + 16)}
        dur="1.5s"
        repeatCount="indefinite"
      />
      <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
    </circle>
  );
}

// ---------------------------------------------------------------------------
// Edge rendering
// ---------------------------------------------------------------------------

function renderEdge(fromNode: LayoutNode, toNode: LayoutNode, label?: string, highlight?: boolean) {
  const stroke = highlight ? 'var(--state-info-text)' : 'var(--border-strong)';
  const sw = highlight ? 2.5 : 1.5;
  const mx = (fromNode.x + toNode.x) / 2;
  const my = (fromNode.y + toNode.y) / 2;

  // Bezier if nodes differ in both axes, straight otherwise
  const sameLine = fromNode.y === toNode.y || fromNode.x === toNode.x;
  const d = sameLine
    ? `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`
    : `M ${fromNode.x} ${fromNode.y} C ${mx} ${fromNode.y}, ${mx} ${toNode.y}, ${toNode.x} ${toNode.y}`;

  return (
    <g key={`edge-${fromNode.id}-${toNode.id}`}>
      <defs>
        <marker
          id={`arrow-${fromNode.id}-${toNode.id}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        markerEnd={`url(#arrow-${fromNode.id}-${toNode.id})`}
      />
      {label && (
        <text
          x={mx}
          y={my - 6}
          textAnchor="middle"
          fontSize={10}
          fill="var(--text-secondary)"
          className="pointer-events-none"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// ProcessFlow component
// ---------------------------------------------------------------------------

/**
 * SVG-based process flow diagram with auto-layout, status badges, and path highlighting.
 *
 * @example
 * ```tsx
 * <ProcessFlow
 *   nodes={[
 *     { id: 'start', type: 'start', label: 'Begin' },
 *     { id: 'review', type: 'task', label: 'Review', status: 'active' },
 *     { id: 'end', type: 'end', label: 'Done' },
 *   ]}
 *   edges={[{ from: 'start', to: 'review' }, { from: 'review', to: 'end' }]}
 * />
 * ```
 */
export function ProcessFlow({
  nodes,
  edges,
  orientation = 'horizontal',
  highlightPath = [],
  onNodeClick,
  access,
  accessReason,
  className,
}: ProcessFlowProps) {
  const { state, isHidden } = resolveAccessState(access);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollNeeded, setScrollNeeded] = useState(false);

  const highlightSet = useMemo(() => new Set(highlightPath), [highlightPath]);

  const { layoutNodes, width, height } = useMemo(
    () => buildLayout(nodes, edges, orientation),
    [nodes, edges, orientation],
  );

  const nodePositions = useMemo(() => {
    const map = new Map<string, LayoutNode>();
    for (const ln of layoutNodes) map.set(ln.id, ln);
    return map;
  }, [layoutNodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      setScrollNeeded(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    }
  }, [width, height]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (state === 'disabled' || state === 'readonly') return;
      onNodeClick?.(nodeId);
    },
    [onNodeClick, state],
  );

  if (isHidden) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-auto rounded-lg border border-border-default bg-[var(--surface-primary)]',
        accessStyles(state),
        className,
      )}
      data-access-state={state}
      role="figure"
      aria-label="Process flow diagram"
      title={accessReason}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Edges */}
        {edges.map((e) => {
          const from = nodePositions.get(e.from);
          const to = nodePositions.get(e.to);
          if (!from || !to) return null;
          const edgeHighlight = highlightSet.has(e.from) && highlightSet.has(e.to);
          return renderEdge(from, to, e.label, edgeHighlight);
        })}

        {/* Nodes */}
        {layoutNodes.map((ln) => {
          const status = ln.node.status ?? 'idle';
          const highlight = highlightSet.has(ln.id);
          return (
            <g
              key={ln.id}
              role="button"
              tabIndex={0}
              aria-label={`${ln.node.label} (${status})`}
              className={cn('cursor-pointer', state === 'disabled' && 'pointer-events-none')}
              onClick={() => handleNodeClick(ln.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleNodeClick(ln.id);
              }}
            >
              {status === 'active' && <ActivePulse x={ln.x} y={ln.y} />}
              {renderNodeShape(ln.node.type, status, ln.x, ln.y, highlight)}
              <StatusBadge status={status} x={ln.x} y={ln.y} />
              <text
                x={ln.x}
                y={ln.y + 4}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-primary)"
                className="pointer-events-none select-none"
                style={{ maxWidth: NODE_W - 12 }}
              >
                {ln.node.label.length > 14 ? ln.node.label.slice(0, 13) + '\u2026' : ln.node.label}
              </text>
            </g>
          );
        })}
      </svg>

      {scrollNeeded && (
        <div className="absolute bottom-1 right-1 rounded-xs bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-secondary opacity-70">
          scroll to explore
        </div>
      )}
    </div>
  );
}

ProcessFlow.displayName = 'ProcessFlow';
