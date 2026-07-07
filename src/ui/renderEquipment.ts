import { gameConfig } from '../data';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';

/** 渲染 3 格装备栏（仅 3 星卡可入）。 */
export function renderEquipment(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  refs.equipmentSlots.innerHTML = '';
  for (let i = 0; i < gameConfig.slots.equipment; i++) refs.equipmentSlots.append(makeSlot('equipment', i, state.equipment[i], handlers));
}
