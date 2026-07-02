export type OverlaySide = 'top' | 'right' | 'bottom' | 'left';
export type OverlayAlign = 'start' | 'center' | 'end';

export type OverlayPosition = {
  left: number;
  top: number;
  resolvedSide: OverlaySide;
  flipped: boolean;
};

type ResolveOverlayPositionOptions = {
  preferredSide: OverlaySide;
  align: OverlayAlign;
  triggerBounds: DOMRect;
  panelBounds: DOMRect;
  flipOnCollision?: boolean;
  gap?: number;
  edgePadding?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getOppositeSide = (side: OverlaySide): OverlaySide => {
  switch (side) {
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    case 'left':
      return 'right';
    case 'right':
    default:
      return 'left';
  }
};

const getAvailableSpace = (
  side: OverlaySide,
  triggerBounds: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
) => {
  switch (side) {
    case 'top':
      return triggerBounds.top;
    case 'bottom':
      return viewportHeight - triggerBounds.bottom;
    case 'left':
      return triggerBounds.left;
    case 'right':
    default:
      return viewportWidth - triggerBounds.right;
  }
};

const hasEnoughSpaceForSide = (
  side: OverlaySide,
  triggerBounds: DOMRect,
  panelBounds: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  gap: number,
  edgePadding: number,
) => {
  if (side === 'top' || side === 'bottom') {
    const requiredHeight = panelBounds.height + gap + edgePadding;
    return getAvailableSpace(side, triggerBounds, viewportWidth, viewportHeight) >= requiredHeight;
  }

  const requiredWidth = panelBounds.width + gap + edgePadding;
  return getAvailableSpace(side, triggerBounds, viewportWidth, viewportHeight) >= requiredWidth;
};

export const resolveOverlayArrowPositionClassName = (side: OverlaySide, align: OverlayAlign) => {
  const horizontalAlign =
    align === 'start' ? 'left-6' : align === 'end' ? 'right-6' : 'left-1/2 -translate-x-1/2';
  const verticalAlign =
    align === 'start' ? 'top-6' : align === 'end' ? 'bottom-6' : 'top-1/2 -translate-y-1/2';

  switch (side) {
    case 'top':
      return `${horizontalAlign} -bottom-1.5`;
    case 'bottom':
      return `${horizontalAlign} -top-1.5`;
    case 'left':
      return `${verticalAlign} -right-1.5`;
    case 'right':
    default:
      return `${verticalAlign} -left-1.5`;
  }
};

export const resolveOverlayPosition = ({
  preferredSide,
  align,
  triggerBounds,
  panelBounds,
  flipOnCollision = true,
  gap = 12,
  edgePadding = 12,
}: ResolveOverlayPositionOptions): OverlayPosition => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  let resolvedSide = preferredSide;
  let flipped = false;

  if (
    !hasEnoughSpaceForSide(
      preferredSide,
      triggerBounds,
      panelBounds,
      viewportWidth,
      viewportHeight,
      gap,
      edgePadding,
    ) &&
    flipOnCollision
  ) {
    const oppositeSide = getOppositeSide(preferredSide);
    const preferredSpace = getAvailableSpace(
      preferredSide,
      triggerBounds,
      viewportWidth,
      viewportHeight,
    );
    const oppositeSpace = getAvailableSpace(
      oppositeSide,
      triggerBounds,
      viewportWidth,
      viewportHeight,
    );
    if (
      hasEnoughSpaceForSide(
        oppositeSide,
        triggerBounds,
        panelBounds,
        viewportWidth,
        viewportHeight,
        gap,
        edgePadding,
      ) ||
      oppositeSpace > preferredSpace
    ) {
      resolvedSide = oppositeSide;
      flipped = true;
    }
  }

  let left: number;
  let top: number;

  if (resolvedSide === 'top' || resolvedSide === 'bottom') {
    left =
      align === 'start'
        ? triggerBounds.left
        : align === 'end'
          ? triggerBounds.right - panelBounds.width
          : triggerBounds.left + (triggerBounds.width - panelBounds.width) / 2;
    top =
      resolvedSide === 'top'
        ? triggerBounds.top - panelBounds.height - gap
        : triggerBounds.bottom + gap;
  } else {
    left =
      resolvedSide === 'left'
        ? triggerBounds.left - panelBounds.width - gap
        : triggerBounds.right + gap;
    top =
      align === 'start'
        ? triggerBounds.top
        : align === 'end'
          ? triggerBounds.bottom - panelBounds.height
          : triggerBounds.top + (triggerBounds.height - panelBounds.height) / 2;
  }

  return {
    left: clamp(
      left,
      edgePadding,
      Math.max(edgePadding, viewportWidth - panelBounds.width - edgePadding),
    ),
    top: clamp(
      top,
      edgePadding,
      Math.max(edgePadding, viewportHeight - panelBounds.height - edgePadding),
    ),
    resolvedSide,
    flipped,
  };
};
