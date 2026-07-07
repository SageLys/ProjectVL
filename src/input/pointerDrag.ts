import type { SlotKind } from '../core/types';
import type { SlotSource } from '../ui/slotFactory';

type DropHandler = (source: SlotSource, index: number, targetKind: SlotKind, targetIndex: number) => void;

/**
 * Pointer 拖拽实现（唯一的拖拽通路；HTML5 拖拽死代码已移除）。
 * pointerdown 开始 → pointermove 高亮经过的槽位(.hot) → pointerup 落点判定。
 */
export function createPointerDrag(onDrop: DropHandler) {
  let active: { source: SlotSource; index: number; el: HTMLElement } | null = null;
  let hot: Element | null = null;

  function slotFromPoint(x: number, y: number): Element | null {
    return document.elementFromPoint(x, y)?.closest?.('.card-slot, .equip-slot, .temp-slot') ?? null;
  }

  document.addEventListener('pointermove', e => {
    if (!active) return;
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
    const slot = slotFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    drag.el.classList.remove('dragging');
    hot?.classList.remove('hot');
    active = null;
    hot = null;
    if (!slot) return;
    const targetKind: SlotKind = slot.dataset.testid === 'card-slot' ? 'cards' : slot.dataset.testid === 'temp-slot' ? 'temp' : 'equipment';
    onDrop(drag.source, drag.index, targetKind, Number(slot.dataset.index));
  });

  return {
    begin(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void {
      if (e.button != null && e.button !== 0) return;
      active = { source, index, el };
      el.classList.add('dragging');
    },
  };
}
