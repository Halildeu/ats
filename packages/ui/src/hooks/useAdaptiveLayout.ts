'use client';

import { useMemo } from 'react';

export interface AdaptiveBlock {
  key: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  span: number;
}

export interface AdaptiveGridConfig {
  columns: number;
  gap: string;
}

export interface UseAdaptiveLayoutReturn {
  orderedBlocks: AdaptiveBlock[];
  gridConfig: AdaptiveGridConfig;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function useAdaptiveLayout(
  blocks: AdaptiveBlock[],
  viewportWidth?: number,
): UseAdaptiveLayoutReturn {
  return useMemo(() => {
    const width = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);

    const columns = width < 640 ? 1 : width < 1024 ? 2 : width < 1280 ? 3 : 4;
    const gap = width < 640 ? '0.75rem' : '1rem';

    const orderedBlocks = [...blocks].sort(
      (a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1),
    );

    return { orderedBlocks, gridConfig: { columns, gap } };
  }, [blocks, viewportWidth]);
}
