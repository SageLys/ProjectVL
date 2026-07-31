export const STAGE_WIDTH = 540;
export const STANDARD_STAGE_HEIGHT = 1140;
export const COMPACT_STAGE_HEIGHT = 1020;
export const ARENA_WIDTH = 540;
export const ARENA_HEIGHT = 730;
export const MIN_STAGE_SCALE = 0.62;

export type StageVariant = 'standard' | 'compact';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageMetrics {
  availableRect: ViewportRect;
  variant: StageVariant;
  logicalWidth: number;
  logicalHeight: number;
  widthScale: number;
  scale: number;
  usedContainFallback: boolean;
  belowReadabilityBudget: boolean;
  stageRect: ViewportRect;
}

const nonNegative = (value: number): number => Math.max(0, Number.isFinite(value) ? value : 0);

export function insetViewport(viewport: ViewportRect, insets: Insets): ViewportRect {
  const left = nonNegative(insets.left);
  const right = nonNegative(insets.right);
  const top = nonNegative(insets.top);
  const bottom = nonNegative(insets.bottom);
  return {
    x: viewport.x + left,
    y: viewport.y + top,
    width: Math.max(0, viewport.width - left - right),
    height: Math.max(0, viewport.height - top - bottom),
  };
}

export function calculateStageMetrics(viewport: ViewportRect, insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): StageMetrics {
  const availableRect = insetViewport(viewport, insets);
  const widthScale = availableRect.width / STAGE_WIDTH;
  let variant: StageVariant;
  let scale: number;
  let usedContainFallback = false;

  if (STANDARD_STAGE_HEIGHT * widthScale <= availableRect.height) {
    variant = 'standard';
    scale = widthScale;
  } else if (COMPACT_STAGE_HEIGHT * widthScale <= availableRect.height) {
    variant = 'compact';
    scale = widthScale;
  } else {
    variant = 'compact';
    scale = Math.min(widthScale, availableRect.height / COMPACT_STAGE_HEIGHT);
    usedContainFallback = true;
  }

  const logicalHeight = variant === 'standard' ? STANDARD_STAGE_HEIGHT : COMPACT_STAGE_HEIGHT;
  const width = STAGE_WIDTH * scale;
  const height = logicalHeight * scale;
  return {
    availableRect,
    variant,
    logicalWidth: STAGE_WIDTH,
    logicalHeight,
    widthScale,
    scale,
    usedContainFallback,
    belowReadabilityBudget: scale < MIN_STAGE_SCALE,
    stageRect: {
      x: availableRect.x + Math.max(0, (availableRect.width - width) / 2),
      y: availableRect.y + Math.max(0, (availableRect.height - height) / 2),
      width,
      height,
    },
  };
}
