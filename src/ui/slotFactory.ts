import { cfg } from '../config';
import type { Card } from '../core/types';

export type SlotSource = 'cards' | 'equipment';

export interface SlotHandlers {
  /** 所有卡牌轻点/拖拽统一交给 pointerRouter 仲裁。 */
  pointerDown(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void;
  /** 键盘 Enter/Space 产生 detail=0 的 click，复用同一轻点语义。 */
  activate?(source: SlotSource, index: number): void;
}

/** 构造一张卡牌按钮。锁定卡三重视觉冗余（金框/🔒角标/底色）由 .locked class 承担。 */
export function createCardElement(card: Card, source: SlotSource, index: number, handlers: SlotHandlers): HTMLButtonElement {
  const meta = cfg.skills.legacy.types[card.type];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = card.locked ? 'card locked' : 'card';
  el.draggable = false;
  el.dataset.id = String(card.id);
  el.dataset.testid = source === 'cards' ? 'upgrade-card' : 'equipped-card';
  el.dataset.locked = card.locked ? 'true' : 'false';
  el.setAttribute('aria-label', `${card.locked ? '已锁定' : source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}卡`);
  el.style.setProperty('--card', meta.color);
  el.innerHTML = `<b>${card.locked ? '🔒 ' : ''}${meta.icon} ${meta.name}</b><em>${'★'.repeat(card.star)}</em><small>${meta.desc}强化</small>`;
  el.addEventListener('pointerdown', e => handlers.pointerDown(e, source, index, el));
  el.addEventListener('click', e => {
    if (e.detail === 0) handlers.activate?.(source, index);
  });
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
