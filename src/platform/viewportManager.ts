import { calculateStageMetrics, type Insets, type StageMetrics } from './stageMetrics';
import { resizeCanvasBackingStore, type CanvasBackingMetrics } from '../render/renderMetrics';

export interface ViewportSnapshot {
  metrics: StageMetrics;
  visualViewport: { width: number; height: number; scale: number; offsetLeft: number; offsetTop: number };
  safeArea: Insets;
  arenaRect: DOMRect;
  canvas: CanvasBackingMetrics;
}

function readSafeArea(probe: HTMLElement): Insets {
  const style = getComputedStyle(probe);
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
}

export function createViewportManager(options: {
  host: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  onChange?: (snapshot: ViewportSnapshot) => void;
}) {
  const probe = document.createElement('div');
  probe.className = 'safe-area-probe';
  options.host.append(probe);
  let frame = 0;
  let current: ViewportSnapshot | null = null;

  const update = (): void => {
    frame = 0;
    const vv = window.visualViewport;
    const visual = {
      width: vv?.width ?? window.innerWidth,
      height: vv?.height ?? window.innerHeight,
      scale: vv?.scale ?? 1,
      offsetLeft: vv?.offsetLeft ?? 0,
      offsetTop: vv?.offsetTop ?? 0,
    };
    // User-initiated page zoom changes the visual viewport. Preserve the last
    // scale=1 stage geometry instead of continuously shrinking against it.
    if (visual.scale !== 1 && current) {
      current = { ...current, visualViewport: visual, arenaRect: options.canvas.parentElement?.getBoundingClientRect() ?? options.canvas.getBoundingClientRect() };
      options.onChange?.(current);
      return;
    }
    const safeArea = readSafeArea(probe);
    const metrics = calculateStageMetrics({
      x: visual.offsetLeft,
      y: visual.offsetTop,
      width: visual.width,
      height: visual.height,
    }, safeArea);
    const root = document.documentElement;
    root.style.setProperty('--stage-x', `${metrics.stageRect.x}px`);
    root.style.setProperty('--stage-y', `${metrics.stageRect.y}px`);
    root.style.setProperty('--stage-scale', String(metrics.scale));
    root.style.setProperty('--stage-logical-height', `${metrics.logicalHeight}px`);
    options.stage.dataset.layout = metrics.variant;
    options.stage.dataset.containFallback = String(metrics.usedContainFallback);
    const canvas = resizeCanvasBackingStore(options.canvas);
    current = { metrics, visualViewport: visual, safeArea, arenaRect: options.canvas.parentElement?.getBoundingClientRect() ?? options.canvas.getBoundingClientRect(), canvas };
    options.onChange?.(current);
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  schedule();

  return {
    schedule,
    getSnapshot: (): ViewportSnapshot | null => current,
    destroy(): void {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      probe.remove();
    },
  };
}
