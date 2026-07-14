import type { SlotKind } from '../core/types';
import type { InputConfig } from '../config/types';
import type { SlotSource } from '../ui/slotFactory';

export type PointerSample = { x: number; y: number; at: number };
export type DropTarget =
  | { kind: 'slot'; slotKind: SlotKind; index: number }
  | { kind: 'arena'; x: number; y: number }
  | { kind: 'cancel' };
export type PreviewSpec = { placement: 'point'; radius: number } | { placement: 'screen' };

export function isTap(start: PointerSample, end: PointerSample, maxDistance: number, input: Pick<InputConfig, 'tapMaxPx' | 'tapMaxMs'>): boolean {
  return maxDistance < input.tapMaxPx && end.at - start.at < input.tapMaxMs;
}

export function canvasPoint(canvas: Pick<HTMLCanvasElement, 'width' | 'height'>, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, clientX: number, clientY: number) {
  return { x: ((clientX - rect.left) / rect.width) * canvas.width, y: ((clientY - rect.top) / rect.height) * canvas.height };
}

export function distanceFrom(start: PointerSample, x: number, y: number): number {
  return Math.hypot(x - start.x, y - start.y);
}

export function resolveTarget(canvas: Pick<HTMLCanvasElement, 'width' | 'height'>, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>, clientX: number, clientY: number, slot?: { slotKind: SlotKind; index: number }): DropTarget {
  if (slot) return { kind: 'slot', ...slot };
  if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
    return { kind: 'arena', ...canvasPoint(canvas, rect, clientX, clientY) };
  }
  return { kind: 'cancel' };
}

export function targetAt(canvas: HTMLCanvasElement, clientX: number, clientY: number): DropTarget {
  const hit = document.elementFromPoint(clientX, clientY);
  const slot = hit?.closest?.('[data-testid="card-slot"], [data-testid="equipment-slot"]') as HTMLElement | null;
  const rect = canvas.getBoundingClientRect();
  const slotInfo = slot ? { slotKind: (slot.dataset.testid === 'card-slot' ? 'cards' : 'equipment') as SlotKind, index: Number(slot.dataset.index) } : undefined;
  return resolveTarget(canvas, rect, clientX, clientY, slotInfo);
}

type RouterOptions = {
  canvas: HTMLCanvasElement;
  dock: HTMLElement;
  aimPreview: HTMLElement;
  screenPreview: HTMLElement;
  input: InputConfig;
  bountyEnabled: boolean;
  isPaused?: () => boolean;
  onArenaTap(x: number, y: number): void;
  onBountyTap?: (x: number, y: number) => boolean;
  onDrop(source: SlotSource, index: number, target: Exclude<DropTarget, { kind: 'cancel' }>): void;
  previewFor(source: SlotSource, index: number): PreviewSpec;
};

export function createPointerRouter(options: RouterOptions) {
  let active: { pointerId: number; start: PointerSample; maxDistance: number; source?: SlotSource; index?: number; el?: HTMLElement; dragging: boolean } | null = null;
  let hot: Element | null = null;
  let suppressClick = false;

  function hidePreview(): void {
    options.aimPreview.classList.remove('show');
    options.screenPreview.classList.remove('show');
    hot?.classList.remove('hot', 'equip-warning');
    hot = null;
  }

  function showPreview(clientX: number, clientY: number): void {
    if (!active?.source || active.index == null) return;
    const preview = options.previewFor(active.source, active.index);
    const target = targetAt(options.canvas, clientX, clientY);
    const slot = document.elementFromPoint(clientX, clientY)?.closest?.('[data-testid="card-slot"], [data-testid="equipment-slot"]') ?? null;
    if (hot !== slot) { hot?.classList.remove('hot', 'equip-warning'); hot = slot; hot?.classList.add('hot'); }
    if (slot && active.source === 'cards' && (slot as HTMLElement).dataset.testid === 'equipment-slot') slot.classList.add('equip-warning');
    options.aimPreview.classList.remove('show');
    options.screenPreview.classList.remove('show');
    if (target.kind !== 'arena') return;
    if (preview.placement === 'screen') { options.screenPreview.classList.add('show'); return; }
    const rect = options.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / options.canvas.width, rect.height / options.canvas.height);
    options.aimPreview.style.setProperty('--radius', `${preview.radius * scale}px`);
    options.aimPreview.style.left = `${clientX}px`;
    options.aimPreview.style.top = `${clientY - options.input.reticleOffsetY}px`;
    options.aimPreview.classList.add('show');
  }

  function onMove(event: PointerEvent): void {
    if (!active || event.pointerId !== active.pointerId) return;
    active.maxDistance = Math.max(active.maxDistance, distanceFrom(active.start, event.clientX, event.clientY));
    if (active.source && active.maxDistance >= options.input.tapMaxPx) {
      if (!active.dragging) { active.dragging = true; active.el?.classList.add('dragging'); }
      showPreview(event.clientX, event.clientY);
    }
  }

  function finish(event: PointerEvent, cancelled: boolean): void {
    if (!active || event.pointerId !== active.pointerId) return;
    const current = active;
    current.maxDistance = Math.max(current.maxDistance, distanceFrom(current.start, event.clientX, event.clientY));
    active = null;
    current.el?.classList.remove('dragging');
    hidePreview();
    if (cancelled || options.isPaused?.()) return;
    const end = { x: event.clientX, y: event.clientY, at: performance.now() };
    if (!current.source && isTap(current.start, end, current.maxDistance, options.input)) {
      const point = canvasPoint(options.canvas, options.canvas.getBoundingClientRect(), event.clientX, event.clientY);
      if (options.bountyEnabled && options.onBountyTap?.(point.x, point.y)) return;
      options.onArenaTap(point.x, point.y);
      return;
    }
    if (!current.source || !current.dragging || current.index == null) return;
    suppressClick = true;
    const target = targetAt(options.canvas, event.clientX, event.clientY);
    if (target.kind !== 'cancel') options.onDrop(current.source, current.index, target);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', event => finish(event, false));
  document.addEventListener('pointercancel', event => finish(event, true));
  document.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  options.canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || options.isPaused?.()) return;
    active = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY, at: performance.now() }, maxDistance: 0, dragging: false };
    options.canvas.setPointerCapture(event.pointerId);
  });

  return {
    begin(event: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void {
      if (event.button !== 0 || options.isPaused?.()) return;
      active = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY, at: performance.now() }, maxDistance: 0, source, index, el, dragging: false };
      el.setPointerCapture(event.pointerId);
    },
  };
}
