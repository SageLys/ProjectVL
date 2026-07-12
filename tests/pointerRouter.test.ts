import { describe, expect, it, vi } from 'vitest';
import {
  clientToCanvas,
  cssRadiusToCanvas,
  createPointerRouter,
  type PointerHit,
  type PointerPreview,
  type PointerRouterEnvironment,
  type PointerRouterHooks,
  type PointerSample,
  type PointerTelemetryEvent,
} from '../src/input/pointerRouter';

const config = { tapMaxPx: 8, tapMaxMs: 250, reticleOffsetY: 60, minTargetCssPx: 44 };

function sample(
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp: number,
  extra: Partial<PointerSample> = {},
): PointerSample {
  return { pointerId, clientX, clientY, timeStamp, pointerType: 'touch', button: 0, isPrimary: true, ...extra };
}

function setup(overrides: Partial<PointerRouterEnvironment> = {}, hookOverrides: Partial<PointerRouterHooks> = {}) {
  let hit: PointerHit = { kind: 'arena' };
  const telemetry: PointerTelemetryEvent[] = [];
  const previews: PointerPreview[] = [];
  const environment: PointerRouterEnvironment = {
    getCanvasMetrics: () => ({ left: 100, top: 50, width: 480, height: 300, canvasWidth: 960, canvasHeight: 600 }),
    hitTest: () => hit,
    setDragging: vi.fn(),
    setHotSlot: vi.fn(),
    setPreview: value => previews.push(value),
    capture: vi.fn(),
    release: vi.fn(),
    now: () => 1000,
    ...overrides,
  };
  const hooks: PointerRouterHooks = {
    onArenaTap: vi.fn(() => ({ action: 'drop-pickup', targetKind: 'drop', targetId: 17 })),
    onCardTap: vi.fn(() => ({ action: 'toggle-lock' })),
    onCardDrop: vi.fn(() => ({ action: 'consume-card' })),
    onTelemetry: event => telemetry.push(event),
    ...hookOverrides,
  };
  const router = createPointerRouter({ config, hooks, environment });
  return { router, hooks, environment, telemetry, previews, setHit: (next: PointerHit) => { hit = next; } };
}

describe('pointerRouter · 坐标换算', () => {
  it('按 CSS 缩放换算画布坐标，并把拖卡落点抬到手指上方后钳制边界', () => {
    const metrics = { left: 100, top: 50, width: 480, height: 300, canvasWidth: 960, canvasHeight: 600 };
    expect(clientToCanvas({ x: 340, y: 200 }, metrics)).toEqual({ x: 480, y: 300 });
    expect(clientToCanvas({ x: 340, y: 200 }, metrics, 60)).toEqual({ x: 480, y: 180 });
    expect(clientToCanvas({ x: 90, y: 40 }, metrics, 60)).toEqual({ x: 0, y: 0 });
    expect(cssRadiusToCanvas(metrics, 44 / 2)).toBe(44);
    expect(cssRadiusToCanvas({ ...metrics, canvasHeight: 900 }, 22)).toBe(66);
  });
});

describe('pointerRouter · 点击/拖拽仲裁', () => {
  it('竞技场轻点只在 pointerup 后触发，并把上层仲裁结果写入遥测', () => {
    const s = setup();
    expect(s.router.pointerDownArena(sample(1, 220, 110, 100), 'canvas')).toBe(true);
    expect(s.hooks.onArenaTap).not.toHaveBeenCalled();
    expect(s.router.pointerUp(sample(1, 224, 113, 220))).toBe(true);

    expect(s.hooks.onArenaTap).toHaveBeenCalledWith(expect.objectContaining({ point: { x: 248, y: 126 } }));
    expect(s.telemetry).toEqual([
      expect.objectContaining({
        action: 'arena-tap', resolvedAction: 'drop-pickup', targetKind: 'drop', targetId: 17,
        durationMs: 120, distancePx: 5, cancelled: false,
      }),
    ]);
  });

  it('8px 或 250ms 恰好命中阈值时不算点击', () => {
    const byDistance = setup();
    byDistance.router.pointerDownArena(sample(1, 200, 100, 0));
    byDistance.router.pointerUp(sample(1, 208, 100, 100));
    expect(byDistance.hooks.onArenaTap).not.toHaveBeenCalled();
    expect(byDistance.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'arena-gesture' });

    const byTime = setup();
    byTime.router.pointerDownArena(sample(2, 200, 100, 0));
    byTime.router.pointerUp(sample(2, 200, 100, 250));
    expect(byTime.hooks.onArenaTap).not.toHaveBeenCalled();
    expect(byTime.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'arena-gesture' });
  });

  it('卡牌轻点与拖拽互斥，轻点交给方案 B 锁定动词', () => {
    const s = setup();
    s.router.pointerDownCard(sample(3, 120, 360, 0), { source: 'cards', index: 2, element: 'card' });
    s.router.pointerUp(sample(3, 123, 362, 100));
    expect(s.hooks.onCardTap).toHaveBeenCalledWith(expect.objectContaining({ source: 'cards', index: 2 }));
    expect(s.hooks.onCardDrop).not.toHaveBeenCalled();
    expect(s.telemetry[0]).toMatchObject({ action: 'card-tap', resolvedAction: 'toggle-lock' });
  });

  it('拖卡进竞技场使用偏移准星坐标，移动时同步预览', () => {
    const s = setup();
    s.router.pointerDownCard(sample(4, 120, 360, 0), { source: 'cards', index: 1, element: 'card' });
    s.router.pointerMove(sample(4, 340, 200, 100));
    expect(s.previews).toContainEqual({ visible: true, valid: true, client: { x: 340, y: 140 }, point: { x: 480, y: 180 } });
    s.router.pointerUp(sample(4, 340, 200, 150));

    expect(s.hooks.onCardDrop).toHaveBeenCalledWith(expect.objectContaining({
      source: 'cards', index: 1, target: { kind: 'arena', x: 480, y: 180 },
    }));
    expect(s.telemetry[0]).toMatchObject({ action: 'arena-drop', resolvedAction: 'consume-card', canvasPoint: { x: 480, y: 180 } });
  });

  it('不同槽位完成 drop，同一槽位与 dock 均按取消处理', () => {
    const moved = setup();
    moved.setHit({ kind: 'slot', slotKind: 'cards', index: 5 });
    moved.router.pointerDownCard(sample(5, 100, 300, 0), { source: 'cards', index: 1, element: 'card' });
    moved.router.pointerUp(sample(5, 160, 300, 100));
    expect(moved.hooks.onCardDrop).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'slot', slotKind: 'cards', index: 5 } }));
    expect(moved.telemetry[0]).toMatchObject({ action: 'slot-drop' });

    const same = setup();
    same.setHit({ kind: 'slot', slotKind: 'cards', index: 1 });
    same.router.pointerDownCard(sample(6, 100, 300, 0), { source: 'cards', index: 1 });
    same.router.pointerUp(sample(6, 160, 300, 100));
    expect(same.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'same-slot' });

    const dock = setup();
    dock.setHit({ kind: 'dock' });
    dock.router.pointerDownCard(sample(7, 100, 300, 0), { source: 'cards', index: 1 });
    dock.router.pointerUp(sample(7, 160, 300, 100));
    expect(dock.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'dock-return' });
  });
});

describe('pointerRouter · 中断与多指针', () => {
  it('活动 pointerId 隔离其他手指的 move/up', () => {
    const s = setup();
    s.router.pointerDownArena(sample(11, 200, 100, 0));
    expect(s.router.pointerMove(sample(12, 500, 400, 100))).toBe(false);
    expect(s.router.pointerUp(sample(12, 500, 400, 120))).toBe(false);
    expect(s.router.hasActivePointer()).toBe(true);
    s.router.pointerUp(sample(11, 202, 101, 130));
    expect(s.hooks.onArenaTap).toHaveBeenCalledTimes(1);
    expect(s.telemetry[0]).toMatchObject({ pointerId: 11, distancePx: Math.sqrt(5) });
  });

  it('pointercancel 清理 dragging/hot/preview/capture 并产生结构化取消遥测', () => {
    const onCancel = vi.fn();
    const s = setup({}, { onCancel });
    s.router.pointerDownCard(sample(21, 120, 360, 0), { source: 'cards', index: 0, element: 'card' });
    s.router.pointerMove(sample(21, 300, 200, 90));
    s.router.pointerCancel(sample(21, 310, 190, 100));

    expect(onCancel).toHaveBeenCalledWith('pointercancel', expect.objectContaining({ pointerId: 21 }));
    expect(s.environment.setDragging).toHaveBeenLastCalledWith('card', false);
    expect(s.environment.setHotSlot).toHaveBeenLastCalledWith(null);
    expect(s.previews[s.previews.length - 1]).toEqual({ visible: false, valid: false });
    expect(s.environment.release).toHaveBeenCalledWith(21, 'card');
    expect(s.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'pointercancel', cancelled: true });
    expect(s.router.hasActivePointer()).toBe(false);
  });

  it('拖出屏幕取消，暂停等状态可通过 isEnabled 中止当前手势', () => {
    const outside = setup();
    outside.setHit({ kind: 'outside' });
    outside.router.pointerDownCard(sample(31, 120, 360, 0), { source: 'cards', index: 0 });
    outside.router.pointerUp(sample(31, -20, 200, 100));
    expect(outside.telemetry[0]).toMatchObject({ cancelReason: 'outside-screen' });

    let enabled = true;
    const disabled = setup({}, { isEnabled: () => enabled });
    disabled.router.pointerDownArena(sample(32, 200, 100, 0));
    enabled = false;
    disabled.router.pointerUp(sample(32, 202, 101, 100));
    expect(disabled.hooks.onArenaTap).not.toHaveBeenCalled();
    expect(disabled.telemetry[0]).toMatchObject({ action: 'cancel', cancelReason: 'disabled' });
  });

  it('非主指针、非左键以及已有手势期间的新 pointerdown 均被拒绝', () => {
    const s = setup();
    expect(s.router.pointerDownArena(sample(41, 100, 100, 0, { button: 2 }))).toBe(false);
    expect(s.router.pointerDownArena(sample(42, 100, 100, 0, { isPrimary: false }))).toBe(false);
    expect(s.router.pointerDownArena(sample(43, 100, 100, 0))).toBe(true);
    expect(s.router.pointerDownArena(sample(44, 100, 100, 1))).toBe(false);
  });
});
