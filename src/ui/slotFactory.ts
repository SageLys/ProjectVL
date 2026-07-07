import { cards as cardsData } from '../data';
import type { Card } from '../core/types';

export type SlotSource = 'cards' | 'equipment';

export interface SlotHandlers {
  /** 双击：卡槽卡 → 快速装备；装备卡 → 快速卸回。 */
  quickAction(source: SlotSource, index: number): void;
  /** 指针按下：开始拖拽。 */
  dragStart(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void;
}

/** 构造一张卡牌按钮。仅保留 pointer 拖拽 + 双击（HTML5 拖拽死代码已在平移阶段移除）。 */
export function createCardElement(card: Card, source: SlotSource, index: number, handlers: SlotHandlers): HTMLButtonElement {
  const meta = cardsData.types[card.type];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card';
  el.draggable = false;
  el.dataset.id = String(card.id);
  el.dataset.testid = source === 'cards' ? 'upgrade-card' : 'equipped-card';
  el.setAttribute('aria-label', `${source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}卡`);
  el.style.setProperty('--card', meta.color);
  el.innerHTML = `<b>${meta.icon} ${meta.name}</b><em>${'★'.repeat(card.star)}</em><small>${meta.desc}强化</small>`;
  el.addEventListener('dblclick', e => { e.preventDefault(); handlers.quickAction(source, index); });
  el.addEventListener('pointerdown', e => handlers.dragStart(e, source, index, el));
  return el;
}

/** 构造一个卡槽/装备槽（含 data-testid/index，供拖拽落点与浏览器测试定位）。 */
export function makeSlot(kind: SlotSource, index: number, card: Card | null, handlers: SlotHandlers): HTMLDivElement {
  const slot = document.createElement('div');
  slot.className = kind === 'cards' ? 'card-slot' : 'equip-slot';
  slot.dataset.testid = kind === 'cards' ? 'card-slot' : 'equipment-slot';
  slot.dataset.index = String(index);
  if (card) slot.append(createCardElement(card, kind, index, handlers));
  else slot.textContent = kind === 'cards' ? '+' : `装备 ${index + 1}`;
  return slot;
}
