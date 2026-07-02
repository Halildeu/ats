export type { BlockMeta, BlockRegistry } from './types';
export {
  blockRegistry,
  getAllBlocks,
  getBlocksByCategory,
  searchBlocks,
  getBlock,
} from './registry';

/* Component re-exports use `export *` so each block's value AND its public
 * type surface (e.g. RiskMatrixProps, ActivityItem) reach this barrel — and,
 * via the root index.ts re-export, the canonical `@ats/ui` surface. */

/* Phase 2a (2026-05-14) — moved from enterprise/ dashboard/event blocks */
export * from './activity-feed';
export * from './notification-center';
export * from './status-timeline';
export * from './gantt-timeline';
export * from './process-flow';

/* Phase 2b (2026-05-15) — moved from enterprise/ chart-adjacent blocks */
export * from './bullet-chart';
export * from './micro-chart';
export * from './box-plot';
export * from './histogram-chart';
export * from './control-chart';
export * from './pareto-chart';

/* Phase 2c (2026-05-15) — moved from enterprise/ workspace blocks */
export * from './sankey-diagram';
export * from './heatmap-calendar';
export * from './org-chart';
export * from './pivot-table';
export * from './comment-thread';
export * from './file-upload-zone';
export * from './filter-presets';
export * from './value-stream';

/* Phase 4 (2026-05-15) — moved from enterprise/ showcase to blocks */
export * from './risk-matrix';
export * from './governance-board';
export * from './approval-workflow';
