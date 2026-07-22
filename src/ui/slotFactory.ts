import type { Card } from '../core/types';
import { glyphToSvg } from '../presentation/skillGeometry';
import { resolveCardMeta, type CardCopyContext } from './cardMeta';

export type SlotSource = 'cards' | 'equipment' | 'wildcard';

export interface SlotHandlers {
  /** 指针按下：开始拖拽。 */
  dragStart(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void;
}

/** 构造一张卡牌按钮；手牌和装备卡都可拖到战场消耗释放。 */
export function createCardElement(card: Card, source: SlotSource, index: number, handlers: SlotHandlers): HTMLButtonElement {
  const context: CardCopyContext = source === 'cards' ? 'hand' : 'equipment';
  const meta = resolveCardMeta(card.type, card.star, context);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = source === 'equipment' ? 'card equipped' : 'card';
  el.draggable = false;
  el.dataset.id = String(card.id);
  el.dataset.testid = source === 'cards' ? 'upgrade-card' : 'equipped-card';
  el.setAttribute('aria-label', `${source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}。${source === 'equipment' ? '常驻效果' : '手牌效果'}：${meta.desc}`);
  el.style.setProperty('--card', meta.accent);
  el.innerHTML =
    `<span class="card-head">` +
      `<svg class="card-icon" viewBox="0 0 16 16" aria-hidden="true">${glyphToSvg(meta.shape, meta.glyph)}</svg>` +
      `<strong class="card-name">${meta.name}</strong>` +
    `</span>` +
    `<span class="card-stars" aria-hidden="true">${'★'.repeat(card.star)}</span>` +
    `<span class="card-desc">${meta.desc}</span>`;
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
  else slot.textContent = kind === 'cards' ? '+' : '3★+';
  return slot;
}
