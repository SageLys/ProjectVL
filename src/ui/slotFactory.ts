import type { Card } from '../core/types';
import { texts } from '../data';
import { glyphToSvg } from '../presentation/skillGeometry';
import { evolutionChoiceCopy, formatAffixRoll, resolveCardMeta, type CardCopyContext } from './cardMeta';

export type SlotSource = 'cards' | 'equipment' | 'wildcard';

export interface SlotHandlers {
  /** 指针按下：开始拖拽。 */
  dragStart(e: PointerEvent, source: SlotSource, index: number, el: HTMLElement): void;
  /** 短按卡牌：打开详情。wildcard 没有可检查的卡牌实例。 */
  inspect?(source: Exclude<SlotSource, 'wildcard'>, index: number, el: HTMLElement): void;
}

/** 构造一张卡牌按钮；手牌和装备卡都可拖到战场消耗释放。 */
export function createCardElement(card: Card, source: SlotSource, index: number, handlers: SlotHandlers): HTMLButtonElement {
  const context: CardCopyContext = source === 'cards' ? 'hand' : 'equipment';
  const meta = resolveCardMeta(card.type, card.star, context);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `${source === 'equipment' ? 'card equipped' : 'card'}${card.provisional ? ' provisional' : ''}`;
  el.draggable = false;
  el.dataset.id = String(card.id);
  el.dataset.testid = source === 'cards' ? 'upgrade-card' : 'equipped-card';
  if (card.provisional) el.dataset.provisional = 'true';
  const routeBadges = (card.evolutionPath ?? []).map(entry => {
    const separator = entry.indexOf(':');
    const star = entry.slice(0, separator);
    const optionId = entry.slice(separator + 1);
    return `${star}★ ${evolutionChoiceCopy(card.type, optionId)?.name ?? optionId}`;
  });
  const pendingCopy = card.provisional ? texts.evolution.pending : '';
  const affixLabels = (card.affixes ?? []).map(formatAffixRoll);
  el.setAttribute(
    'aria-label',
    `${source === 'equipment' ? '已装备' : ''}${card.star}星${meta.name}。${pendingCopy} ${routeBadges.join(' / ')} ${meta.desc}。${affixLabels.join('，')}`,
  );
  el.style.setProperty('--card', meta.accent);
  const compactAffixes = affixLabels.length
    ? affixLabels.slice(0, 2).map(label => `<span class="card-affix"><i aria-hidden="true">◆</i>${label}</span>`).join('')
    : '<span class="card-affix empty">—</span>';
  el.innerHTML =
    `<span class="card-head">` +
      `<svg class="card-icon" viewBox="0 0 16 16" aria-hidden="true">${glyphToSvg(meta.shape, meta.glyph)}</svg>` +
      `<strong class="card-name">${meta.name}</strong>` +
    `</span>` +
    `<span class="card-stars" aria-hidden="true">${'★'.repeat(card.star)}</span>` +
    `<span class="card-affix-compact">${compactAffixes}</span>` +
    (card.provisional ? '<span class="card-status-badge" aria-hidden="true">!</span>' : '');
  el.addEventListener('pointerdown', e => handlers.dragStart(e, source, index, el));
  el.addEventListener('click', () => {
    if (source !== 'wildcard') handlers.inspect?.(source, index, el);
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
  else slot.textContent = kind === 'cards' ? '+' : '3★+';
  return slot;
}
