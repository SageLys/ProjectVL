import { ARENA_HEIGHT, ARENA_WIDTH } from '../platform/stageMetrics';

export const MAX_RENDER_DPR = 2;

export function renderDpr(deviceDpr: number): number {
  return Math.min(Math.max(1, Number.isFinite(deviceDpr) ? deviceDpr : 1), MAX_RENDER_DPR);
}

export interface CanvasBackingMetrics {
  logicalWidth: number;
  logicalHeight: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  backingWidth: number;
  backingHeight: number;
  scaleX: number;
  scaleY: number;
}

export function calculateCanvasBacking(cssWidth: number, cssHeight: number, dpr: number): CanvasBackingMetrics {
  const safeDpr = Math.max(1, Number.isFinite(dpr) ? dpr : 1);
  const backingWidth = Math.max(1, Math.round(cssWidth * safeDpr));
  const backingHeight = Math.max(1, Math.round(cssHeight * safeDpr));
  return {
    logicalWidth: ARENA_WIDTH,
    logicalHeight: ARENA_HEIGHT,
    cssWidth,
    cssHeight,
    dpr: safeDpr,
    backingWidth,
    backingHeight,
    scaleX: backingWidth / ARENA_WIDTH,
    scaleY: backingHeight / ARENA_HEIGHT,
  };
}

export function resizeCanvasBackingStore(canvas: HTMLCanvasElement, dpr = renderDpr(window.devicePixelRatio || 1)): CanvasBackingMetrics {
  const rect = canvas.getBoundingClientRect();
  const metrics = calculateCanvasBacking(rect.width, rect.height, dpr);
  if (canvas.width !== metrics.backingWidth) canvas.width = metrics.backingWidth;
  if (canvas.height !== metrics.backingHeight) canvas.height = metrics.backingHeight;
  return metrics;
}

export function applyLogicalCanvasTransform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.setTransform(canvas.width / ARENA_WIDTH, 0, 0, canvas.height / ARENA_HEIGHT, 0, 0);
}

export function logicalFontPx(targetScreenCssPx: number, arenaCssScale: number, min = 12, max = 30): number {
  return Math.max(min, Math.min(max, targetScreenCssPx / Math.max(0.01, arenaCssScale)));
}

export function currentArenaCssScale(ctx: CanvasRenderingContext2D): number {
  const canvas = ctx.canvas as HTMLCanvasElement | undefined;
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return 1;
  return canvas.getBoundingClientRect().width / ARENA_WIDTH;
}
