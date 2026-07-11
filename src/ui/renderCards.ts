import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';

/** 渲染手牌卡槽（格数 = economy.handSlots 配置变量）。 */
export function renderCards(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  refs.cards.style.setProperty('--hand-slots', String(cfg.economy.handSlots));
  refs.cards.innerHTML = '';
  for (let i = 0; i < cfg.economy.handSlots; i++) refs.cards.append(makeSlot('cards', i, state.cards[i], handlers));
}
