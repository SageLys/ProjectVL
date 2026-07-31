import type { ViewportSnapshot } from '../platform/viewportManager';

declare const __GIT_COMMIT__: string;

export function createLayoutDebug(getSnapshot: () => ViewportSnapshot | null): { update(): void } {
  const params = new URLSearchParams(location.search);
  if (!import.meta.env.DEV && !params.has('layoutDebug')) return { update() {} };
  if (!params.has('layoutDebug')) return { update() {} };
  const panel = document.createElement('pre');
  panel.className = 'layout-debug';
  panel.setAttribute('aria-live', 'polite');
  document.body.append(panel);
  const update = (): void => {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const { metrics, visualViewport: vv, arenaRect, canvas, safeArea } = snapshot;
    const resources = [...document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>('link[href],script[src]')]
      .map(node => node instanceof HTMLLinkElement ? node.href : node.src).join('\n');
    const active = document.activeElement as HTMLElement | null;
    panel.textContent = [
      `build ${__GIT_COMMIT__}`,
      resources,
      `inner ${innerWidth}×${innerHeight}`,
      `visual ${vv.width.toFixed(1)}×${vv.height.toFixed(1)} scale=${vv.scale} offset=${vv.offsetLeft},${vv.offsetTop}`,
      `safe ${safeArea.top},${safeArea.right},${safeArea.bottom},${safeArea.left}`,
      `available ${formatRect(metrics.availableRect)}`,
      `stage ${metrics.variant} ${metrics.logicalWidth}×${metrics.logicalHeight} scale=${metrics.scale.toFixed(4)} ${formatRect(metrics.stageRect)}`,
      `arena ${formatRect(arenaRect)}`,
      `canvas attr=${canvas.backingWidth}×${canvas.backingHeight} renderDpr=${canvas.dpr} deviceDpr=${devicePixelRatio}`,
      `active ${active?.tagName ?? 'none'}#${active?.id ?? ''}[role=${active?.getAttribute('role') ?? ''}]`,
      `document ${document.documentElement.scrollWidth}×${document.documentElement.scrollHeight}`,
    ].join('\n');
  };
  document.addEventListener('focusin', update);
  window.visualViewport?.addEventListener('resize', update);
  return { update };
}

function formatRect(rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>): string {
  return `${rect.x.toFixed(1)},${rect.y.toFixed(1)} ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}`;
}
