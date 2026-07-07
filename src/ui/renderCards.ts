import { gameConfig } from '../data';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';

/** 渲染 7 格升级卡槽。 */
export function renderCards(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  refs.cards.innerHTML = '';
  for (let i = 0; i < gameConfig.slots.cards; i++) refs.cards.append(makeSlot('cards', i, state.cards[i], handlers));
}
