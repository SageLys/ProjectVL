import type { SlotKind } from '../core/types';

/** 输入层只关心槽位归属，不依赖 UI 或 core 的具体实现。 */
export type PointerSlotSource = 'cards' | 'equipment';

/** 统一输入配置；数值均为 CSS 像素/毫秒，reticleOffsetY 为向上偏移量。 */
export interface PointerRouterConfig {
  tapMaxPx: number;
  tapMaxMs: number;
  reticleOffsetY: number;
  minTargetCssPx: number;
}

export interface ClientPoint {
  x: number;
  y: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * 浏览器 PointerEvent 的最小纯数据投影。测试和 headless 工具无需构造 DOM 事件。
 */
export interface PointerSample {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
  pointerType?: string;
  button?: number;
  isPrimary?: boolean;
}

export type PointerHit =
  | { kind: 'slot'; slotKind: SlotKind; index: number; element?: Element }
  | { kind: 'arena'; element?: Element }
  | { kind: 'dock'; element?: Element }
  | { kind: 'outside' }
  | { kind: 'other'; element?: Element };

export type DropTarget =
  | { kind: 'slot'; slotKind: SlotKind; index: number }
  | { kind: 'arena'; x: number; y: number };

export type PointerCancelReason =
  | 'pointercancel'
  | 'lost-pointer-capture'
  | 'window-blur'
  | 'document-hidden'
  | 'disabled'
  | 'outside-screen'
  | 'dock-return'
  | 'same-slot'
  | 'invalid-target'
  | 'arena-gesture'
  | 'manual';

export type PointerRouteAction = 'arena-tap' | 'card-tap' | 'slot-drop' | 'arena-drop' | 'cancel';

/**
 * 上层可返回实际语义（如 bounty-accept / drop-pickup / empty-tap），供遥测区分同一点击动词。
 */
export interface PointerActionResult {
  action: string;
  targetKind?: string;
  targetId?: number | string;
}

export interface PointerActionMeta {
  pointerId: number;
  pointerType: string;
  durationMs: number;
  distancePx: number;
  startClient: ClientPoint;
  endClient: ClientPoint;
}

export interface ArenaTapContext extends PointerActionMeta {
  point: CanvasPoint;
}

export interface CardTapContext extends PointerActionMeta {
  source: PointerSlotSource;
  index: number;
}

export interface CardDropContext extends CardTapContext {
  target: DropTarget;
}

export interface PointerPreview {
  visible: boolean;
  valid: boolean;
  client?: ClientPoint;
  point?: CanvasPoint;
}

export interface PointerTelemetryEvent extends PointerActionMeta {
  type: 'pointer-action';
  action: PointerRouteAction;
  source: 'arena' | 'card';
  cancelled: boolean;
  cancelReason?: PointerCancelReason;
  canvasPoint?: CanvasPoint;
  targetKind?: string;
  targetId?: number | string;
  resolvedAction?: string;
}

export interface PointerRouterHooks {
  /** 主画面轻点的唯一入口；由 main 做 Bounty / 掉落等多目标优先级仲裁。 */
  onArenaTap(context: ArenaTapContext): PointerActionResult | void;
  /** 卡牌轻点；方案 B 在此切换锁定。 */
  onCardTap?(context: CardTapContext): PointerActionResult | void;
  /** 卡牌拖到槽位或偏移后的竞技场落点。 */
  onCardDrop?(context: CardDropContext): PointerActionResult | void;
  onPreview?(preview: PointerPreview): void;
  onCancel?(reason: PointerCancelReason, meta: PointerActionMeta): void;
  onTelemetry?(event: PointerTelemetryEvent): void;
  /** 暂停/弹窗等状态由控制层注入；false 时不会开始新手势。 */
  isEnabled?(): boolean;
}

export interface PointerRouterEnvironment {
  getCanvasMetrics(): CanvasMetrics;
  hitTest(clientX: number, clientY: number): PointerHit;
  setDragging?(element: unknown, dragging: boolean): void;
  setHotSlot?(hit: Extract<PointerHit, { kind: 'slot' }> | null): void;
  setPreview?(preview: PointerPreview): void;
  capture?(pointerId: number, element: unknown): void;
  release?(pointerId: number, element: unknown): void;
  now?(): number;
}

export interface PointerRouterOptions {
  config: PointerRouterConfig;
  hooks: PointerRouterHooks;
  environment: PointerRouterEnvironment;
}

export interface CardPointerOrigin {
  source: PointerSlotSource;
  index: number;
  element?: unknown;
}

export interface PointerRouter {
  pointerDownArena(sample: PointerSample, captureElement?: unknown): boolean;
  pointerDownCard(sample: PointerSample, origin: CardPointerOrigin): boolean;
  pointerMove(sample: PointerSample): boolean;
  pointerUp(sample: PointerSample): boolean;
  pointerCancel(sample: PointerSample): boolean;
  cancelActive(reason?: PointerCancelReason): boolean;
  hasActivePointer(): boolean;
}

interface ActivePointer {
  pointerId: number;
  pointerType: string;
  origin: { kind: 'arena'; captureElement?: unknown } | ({ kind: 'card' } & CardPointerOrigin);
  startClient: ClientPoint;
  lastClient: ClientPoint;
  startAt: number;
  lastAt: number;
  maxDistance: number;
  dragging: boolean;
}

function assertConfig(config: PointerRouterConfig): void {
  if (!(config.tapMaxPx > 0) || !(config.tapMaxMs > 0) || config.reticleOffsetY < 0 || !(config.minTargetCssPx > 0)) {
    throw new Error('pointerRouter 配置无效：点击阈值/最小目标必须 > 0，reticleOffsetY 必须 >= 0');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 客户区坐标转画布逻辑坐标；拖卡释放时 offsetY 会把落点抬到手指上方。 */
export function clientToCanvas(
  client: ClientPoint,
  metrics: CanvasMetrics,
  offsetY = 0,
): CanvasPoint {
  if (!(metrics.width > 0) || !(metrics.height > 0)) {
    throw new Error('canvas 尺寸必须大于 0');
  }
  const x = ((client.x - metrics.left) * metrics.canvasWidth) / metrics.width;
  const y = ((client.y - metrics.top - offsetY) * metrics.canvasHeight) / metrics.height;
  return {
    x: clamp(x, 0, metrics.canvasWidth),
    y: clamp(y, 0, metrics.canvasHeight),
  };
}

type MeasurableCanvas = Pick<HTMLCanvasElement, 'width' | 'height' | 'getBoundingClientRect'>;

/**
 * 把 CSS 触控半径换算为画布逻辑半径。采用较大缩放轴，保证非等比布局下两轴都不小于目标尺寸。
 * main 可用 `cssRadiusToCanvas(canvas, cfg.input.minTargetCssPx / 2)` 扩张 Bounty/掉落命中半径。
 */
export function cssRadiusToCanvas(canvasOrMetrics: MeasurableCanvas | CanvasMetrics, cssRadiusPx: number): number {
  if (cssRadiusPx < 0) throw new Error('CSS 半径不能为负数');
  const metrics: CanvasMetrics = 'canvasWidth' in canvasOrMetrics
    ? canvasOrMetrics
    : (() => {
        const rect = canvasOrMetrics.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          canvasWidth: canvasOrMetrics.width,
          canvasHeight: canvasOrMetrics.height,
        };
      })();
  if (!(metrics.width > 0) || !(metrics.height > 0)) throw new Error('canvas 尺寸必须大于 0');
  return cssRadiusPx * Math.max(metrics.canvasWidth / metrics.width, metrics.canvasHeight / metrics.height);
}

function canvasToClient(point: CanvasPoint, metrics: CanvasMetrics): ClientPoint {
  return {
    x: metrics.left + (point.x / metrics.canvasWidth) * metrics.width,
    y: metrics.top + (point.y / metrics.canvasHeight) * metrics.height,
  };
}

function samplePoint(sample: PointerSample): ClientPoint {
  return { x: sample.clientX, y: sample.clientY };
}

function captureElement(active: ActivePointer): unknown {
  return active.origin.kind === 'card' ? active.origin.element : active.origin.captureElement;
}

/**
 * 纯状态机版统一 Pointer 路由。浏览器适配器和 node 单测都走这一个实现。
 */
export function createPointerRouter(options: PointerRouterOptions): PointerRouter {
  const { config, hooks, environment } = options;
  assertConfig(config);
  let active: ActivePointer | null = null;

  function enabled(): boolean {
    return hooks.isEnabled?.() ?? true;
  }

  function update(sample: PointerSample): ActivePointer | null {
    if (!active || sample.pointerId !== active.pointerId) return null;
    active.lastClient = samplePoint(sample);
    active.lastAt = Math.max(active.startAt, sample.timeStamp);
    active.maxDistance = Math.max(active.maxDistance, distance(active.startClient, active.lastClient));
    return active;
  }

  function metaFor(current: ActivePointer): PointerActionMeta {
    return {
      pointerId: current.pointerId,
      pointerType: current.pointerType,
      durationMs: Math.max(0, current.lastAt - current.startAt),
      distancePx: current.maxDistance,
      startClient: { ...current.startClient },
      endClient: { ...current.lastClient },
    };
  }

  function preview(value: PointerPreview): void {
    environment.setPreview?.(value);
    hooks.onPreview?.(value);
  }

  function startDragging(current: ActivePointer): void {
    if (current.dragging || current.origin.kind !== 'card') return;
    current.dragging = true;
    environment.setDragging?.(current.origin.element, true);
  }

  function updateDragFeedback(current: ActivePointer): void {
    if (current.origin.kind !== 'card' || !current.dragging) return;
    const hit = environment.hitTest(current.lastClient.x, current.lastClient.y);
    environment.setHotSlot?.(hit.kind === 'slot' ? hit : null);
    if (hit.kind === 'arena' && current.origin.source === 'cards') {
      const metrics = environment.getCanvasMetrics();
      const point = clientToCanvas(current.lastClient, metrics, config.reticleOffsetY);
      preview({ visible: true, valid: true, client: canvasToClient(point, metrics), point });
    } else {
      preview({ visible: false, valid: false });
    }
  }

  function cleanup(current: ActivePointer): void {
    if (current.origin.kind === 'card') environment.setDragging?.(current.origin.element, false);
    environment.setHotSlot?.(null);
    preview({ visible: false, valid: false });
    const element = captureElement(current);
    active = null;
    if (element != null) environment.release?.(current.pointerId, element);
  }

  function telemetry(
    current: ActivePointer,
    action: PointerRouteAction,
    result?: PointerActionResult | void,
    extras: {
      cancelReason?: PointerCancelReason;
      canvasPoint?: CanvasPoint;
      targetKind?: string;
    } = {},
  ): void {
    const meta = metaFor(current);
    hooks.onTelemetry?.({
      type: 'pointer-action',
      ...meta,
      action,
      source: current.origin.kind,
      cancelled: action === 'cancel',
      ...(extras.cancelReason ? { cancelReason: extras.cancelReason } : {}),
      ...(extras.canvasPoint ? { canvasPoint: extras.canvasPoint } : {}),
      ...(result?.action ? { resolvedAction: result.action } : {}),
      ...(result?.targetKind ? { targetKind: result.targetKind } : extras.targetKind ? { targetKind: extras.targetKind } : {}),
      ...(result?.targetId != null ? { targetId: result.targetId } : {}),
    });
  }

  function cancel(current: ActivePointer, reason: PointerCancelReason): void {
    const meta = metaFor(current);
    hooks.onCancel?.(reason, meta);
    telemetry(current, 'cancel', undefined, { cancelReason: reason });
    cleanup(current);
  }

  function begin(sample: PointerSample, origin: ActivePointer['origin']): boolean {
    if (active || !enabled()) return false;
    if ((sample.button ?? 0) !== 0 || sample.isPrimary === false) return false;
    const point = samplePoint(sample);
    active = {
      pointerId: sample.pointerId,
      pointerType: sample.pointerType ?? 'unknown',
      origin,
      startClient: point,
      lastClient: { ...point },
      startAt: sample.timeStamp,
      lastAt: sample.timeStamp,
      maxDistance: 0,
      dragging: false,
    };
    const element = captureElement(active);
    if (element != null) environment.capture?.(sample.pointerId, element);
    return true;
  }

  function resolveCardDrop(current: ActivePointer): void {
    if (current.origin.kind !== 'card') return;
    const hit = environment.hitTest(current.lastClient.x, current.lastClient.y);
    if (hit.kind === 'outside') {
      cancel(current, 'outside-screen');
      return;
    }
    if (hit.kind === 'dock') {
      cancel(current, 'dock-return');
      return;
    }
    if (hit.kind === 'slot') {
      if (hit.slotKind === current.origin.source && hit.index === current.origin.index) {
        cancel(current, 'same-slot');
        return;
      }
      const target: DropTarget = { kind: 'slot', slotKind: hit.slotKind, index: hit.index };
      const context: CardDropContext = { ...metaFor(current), source: current.origin.source, index: current.origin.index, target };
      const result = hooks.onCardDrop?.(context);
      telemetry(current, 'slot-drop', result, { targetKind: hit.slotKind });
      cleanup(current);
      return;
    }
    if (hit.kind === 'arena' && current.origin.source === 'cards') {
      const point = clientToCanvas(current.lastClient, environment.getCanvasMetrics(), config.reticleOffsetY);
      const target: DropTarget = { kind: 'arena', ...point };
      const context: CardDropContext = { ...metaFor(current), source: current.origin.source, index: current.origin.index, target };
      const result = hooks.onCardDrop?.(context);
      telemetry(current, 'arena-drop', result, { canvasPoint: point, targetKind: 'arena' });
      cleanup(current);
      return;
    }
    cancel(current, 'invalid-target');
  }

  return {
    pointerDownArena(sample, captureTarget): boolean {
      return begin(sample, { kind: 'arena', captureElement: captureTarget });
    },

    pointerDownCard(sample, origin): boolean {
      return begin(sample, { kind: 'card', ...origin });
    },

    pointerMove(sample): boolean {
      const current = update(sample);
      if (!current) return false;
      const elapsed = current.lastAt - current.startAt;
      if (current.origin.kind === 'card' && (current.maxDistance >= config.tapMaxPx || elapsed >= config.tapMaxMs)) {
        startDragging(current);
        updateDragFeedback(current);
      }
      return true;
    },

    pointerUp(sample): boolean {
      const current = update(sample);
      if (!current) return false;
      if (!enabled()) {
        cancel(current, 'disabled');
        return true;
      }
      const meta = metaFor(current);
      const isTap = meta.distancePx < config.tapMaxPx && meta.durationMs < config.tapMaxMs;
      if (isTap && current.origin.kind === 'arena') {
        const hit = environment.hitTest(current.lastClient.x, current.lastClient.y);
        if (hit.kind !== 'arena') {
          cancel(current, hit.kind === 'outside' ? 'outside-screen' : 'arena-gesture');
          return true;
        }
        const point = clientToCanvas(current.lastClient, environment.getCanvasMetrics());
        const result = hooks.onArenaTap({ ...meta, point });
        telemetry(current, 'arena-tap', result, { canvasPoint: point, targetKind: 'arena' });
        cleanup(current);
        return true;
      }
      if (isTap && current.origin.kind === 'card') {
        const result = hooks.onCardTap?.({ ...meta, source: current.origin.source, index: current.origin.index });
        telemetry(current, 'card-tap', result, { targetKind: current.origin.source });
        cleanup(current);
        return true;
      }
      if (current.origin.kind === 'card') {
        startDragging(current);
        resolveCardDrop(current);
        return true;
      }
      cancel(current, 'arena-gesture');
      return true;
    },

    pointerCancel(sample): boolean {
      const current = update(sample);
      if (!current) return false;
      cancel(current, 'pointercancel');
      return true;
    },

    cancelActive(reason = 'manual'): boolean {
      if (!active) return false;
      active.lastAt = Math.max(active.lastAt, environment.now?.() ?? active.lastAt);
      cancel(active, reason);
      return true;
    },

    hasActivePointer(): boolean {
      return active !== null;
    },
  };
}

export interface BrowserPointerRouterOptions {
  document?: Document;
  window?: Window;
  dockSelector?: string;
  slotSelector?: string;
  createReticle?: boolean;
  /** 返回当前卡牌实际 AoE 的 CSS 直径；无落点半径时回退最小触控目标。 */
  getReticleDiameterCss?(source: PointerSlotSource, index: number): number | undefined;
}

export interface BrowserPointerRouter extends PointerRouter {
  beginCard(event: PointerEvent, source: PointerSlotSource, index: number, element: HTMLElement): boolean;
  dispose(): void;
}

function fromPointerEvent(event: PointerEvent): PointerSample {
  return {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    timeStamp: event.timeStamp,
    pointerType: event.pointerType,
    button: event.button,
    isPrimary: event.isPrimary,
  };
}

/** 浏览器绑定：监听 canvas pointerdown 与 document move/up/cancel，并提供卡牌 beginCard 入口。 */
export function createBrowserPointerRouter(
  canvas: HTMLCanvasElement,
  config: PointerRouterConfig,
  hooks: PointerRouterHooks,
  browserOptions: BrowserPointerRouterOptions = {},
): BrowserPointerRouter {
  const doc = browserOptions.document ?? document;
  const view = browserOptions.window ?? window;
  const dockSelector = browserOptions.dockSelector ?? '.cards-area, .equipment-bar';
  const slotSelector = browserOptions.slotSelector ?? '.card-slot, .equip-slot';
  let hotElement: Element | null = null;
  let reticle: HTMLDivElement | null = null;

  if (browserOptions.createReticle !== false) {
    reticle = doc.createElement('div');
    reticle.className = 'aim-reticle';
    reticle.setAttribute('aria-hidden', 'true');
    Object.assign(reticle.style, {
      position: 'fixed',
      zIndex: '20',
      display: 'none',
      width: '46px',
      height: '46px',
      boxSizing: 'border-box',
      border: '2px solid rgba(85, 223, 244, .95)',
      borderRadius: '50%',
      boxShadow: '0 0 0 4px rgba(85, 223, 244, .18)',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    });
    doc.body.append(reticle);
  }

  function elementAt(clientX: number, clientY: number): Element | null {
    return doc.elementFromPoint(clientX, clientY);
  }

  const environment: PointerRouterEnvironment = {
    getCanvasMetrics() {
      const rect = canvas.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      };
    },
    hitTest(clientX, clientY) {
      if (clientX < 0 || clientY < 0 || clientX > view.innerWidth || clientY > view.innerHeight) return { kind: 'outside' };
      const element = elementAt(clientX, clientY);
      if (!element) return { kind: 'outside' };
      const slot = element.closest(slotSelector) as HTMLElement | null;
      if (slot) {
        const rawIndex = Number(slot.dataset.index);
        if (Number.isInteger(rawIndex) && rawIndex >= 0) {
          return {
            kind: 'slot',
            slotKind: slot.dataset.testid === 'card-slot' ? 'cards' : 'equipment',
            index: rawIndex,
            element: slot,
          };
        }
      }
      const dock = element.closest(dockSelector);
      if (dock) return { kind: 'dock', element: dock };
      if (element === canvas || canvas.contains(element)) return { kind: 'arena', element };
      return { kind: 'other', element };
    },
    setDragging(element, dragging) {
      if (element instanceof HTMLElement) element.classList.toggle('dragging', dragging);
    },
    setHotSlot(hit) {
      const next = hit?.element ?? null;
      if (hotElement !== next) {
        hotElement?.classList.remove('hot');
        next?.classList.add('hot');
        hotElement = next;
      }
    },
    setPreview(value) {
      if (!reticle) return;
      if (!value.visible || !value.client) {
        reticle.style.display = 'none';
        return;
      }
      reticle.style.display = 'block';
      reticle.style.left = `${value.client.x}px`;
      reticle.style.top = `${value.client.y}px`;
      reticle.dataset.valid = value.valid ? 'true' : 'false';
    },
    capture(pointerId, element) {
      if (element instanceof Element && 'setPointerCapture' in element) {
        try { (element as Element & { setPointerCapture(id: number): void }).setPointerCapture(pointerId); } catch { /* 已失去指针时浏览器可抛异常 */ }
      }
    },
    release(pointerId, element) {
      if (element instanceof Element && 'releasePointerCapture' in element) {
        try { (element as Element & { releasePointerCapture(id: number): void }).releasePointerCapture(pointerId); } catch { /* capture 已自动释放 */ }
      }
    },
    now: () => performance.now(),
  };

  const router = createPointerRouter({ config, hooks, environment });

  const onCanvasDown = (event: PointerEvent): void => {
    if (router.pointerDownArena(fromPointerEvent(event), canvas)) event.preventDefault();
  };
  const onMove = (event: PointerEvent): void => {
    if (router.pointerMove(fromPointerEvent(event))) event.preventDefault();
  };
  const onUp = (event: PointerEvent): void => {
    if (router.pointerUp(fromPointerEvent(event))) event.preventDefault();
  };
  const onCancel = (event: PointerEvent): void => {
    if (router.pointerCancel(fromPointerEvent(event))) event.preventDefault();
  };
  const onLostCapture = (event: PointerEvent): void => {
    if (router.hasActivePointer() && router.cancelActive('lost-pointer-capture')) event.preventDefault();
  };
  const onBlur = (): void => { router.cancelActive('window-blur'); };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') router.cancelActive('document-hidden');
  };

  canvas.addEventListener('pointerdown', onCanvasDown);
  doc.addEventListener('pointermove', onMove, { passive: false });
  doc.addEventListener('pointerup', onUp, { passive: false });
  doc.addEventListener('pointercancel', onCancel, { passive: false });
  doc.addEventListener('lostpointercapture', onLostCapture, { passive: false });
  view.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    ...router,
    beginCard(event, source, index, element): boolean {
      const began = router.pointerDownCard(fromPointerEvent(event), { source, index, element });
      if (began) {
        const diameter = Math.max(config.minTargetCssPx, browserOptions.getReticleDiameterCss?.(source, index) ?? config.minTargetCssPx);
        if (reticle) {
          reticle.style.width = `${diameter}px`;
          reticle.style.height = `${diameter}px`;
        }
        event.preventDefault();
      }
      return began;
    },
    dispose(): void {
      router.cancelActive('manual');
      canvas.removeEventListener('pointerdown', onCanvasDown);
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onCancel);
      doc.removeEventListener('lostpointercapture', onLostCapture);
      view.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
      hotElement?.classList.remove('hot');
      reticle?.remove();
      hotElement = null;
      reticle = null;
    },
  };
}
