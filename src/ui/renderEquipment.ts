import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';

/** 渲染方案 A 独立装备栏。 */
export function renderEquipment(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  const count = cfg.economy.equipSlots;
  refs.equipmentSlots.innerHTML = '';
  for (let i = 0; i < count; i++) refs.equipmentSlots.append(makeSlot('equipment', i, state.equipment[i], handlers));
}
