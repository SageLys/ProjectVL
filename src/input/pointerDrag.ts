import type { SlotKind } from '../core/types';
import type { SlotSource } from '../ui/slotFactory';

/** 拖拽落点：槽位 或 主画面（消耗释放，坐标已换算为画布坐标系）。 */
export type DropTarget =
  | { kind: 'slot'; slotKind: SlotKind; index: number }
  | { kind: 'arena'; x: number; y: number };

type DropHandler = (source: SlotSource, index: number, target: DropTarget) => void;

/**
 * Pointer 拖拽（P0-6：拖入主画面 = 消耗释放，落点 = 技能空间锚点）。
 * pointerdown 开始 → pointermove 高亮经过的槽位(.hot) → pointerup 落点判定（槽位/画布）。
 * 注：本实现为 P3 最小适配；点击/拖拽阈值、落点预览环等 pointerRouter 改造待 T1 校准后实施。
 */
export function createPointerDrag(canvas: HTMLCanvasElement, onDrop: DropHandler) {
  let active: { source: SlotSource; index: number; el: HTMLElement } | null = null;
  let hot: Element | null = null;
  let moved = false;

  function slotFromPoint(x: number, y: number): Element | null {
    return document.elementFromPoint(x, y)?.closest?.('.card-slot, .equip-slot') ?? null;
  }

  document.addEventListener('pointermove', e => {
    if (!active) return;
    moved = true;
    const slot = slotFromPoint(e.clientX, e.clientY);
    if (hot !== slot) {
      hot?.classList.remove('hot');
      hot = slot;
      hot?.classList.add('hot');
    }
  });

  document.addEventListener('pointerup', e => {
    if (!active) return;
    const drag = active;
    const wasMoved = moved;
    const slot = slotFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    drag.el.classList.remove('dragging');
    hot?.classList.remove('hot');
    active = null;
    hot = null;
    moved = false;
    if (slot) {
      const slotKind: SlotKind = slot.dataset.testid === 'card-slot' ? 'cards' : 'equipment';
      onDrop(drag.source, drag.index, { kind: 'slot', slotKind, index: Number(slot.dataset.index) });
      return;
    }
    // 主画面落点：手牌卡拖到 canvas 上抬指 = 消耗释放。
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (wasMoved && drag.source === 'cards' && el && (el === canvas || canvas.contains(el))) {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * canvas.width;
      const y = ((e.clientY - r.top) / r.height) * canvas.height;
      onDrop(drag.source, drag.index, { kind: 'arena', x, y });
    }
  });

  return {
    begin(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void {
      if (e.button != null && e.button !== 0) return;
      active = { source, index, el };
      moved = false;
      el.classList.add('dragging');
    },
  };
}
