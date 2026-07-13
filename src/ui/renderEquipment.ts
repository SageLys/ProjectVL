import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';

/** 渲染独立装备栏（slots 模式；lock 模式 equipSlots=0，整块隐藏）。 */
export function renderEquipment(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  const count = cfg.economy.equipSlots;
  refs.equipmentSlots.innerHTML = '';
  if (count === 0) {
    for (let i = 0; i < 3; i++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'equip-slot placeholder';
      placeholder.textContent = `装备 ${i + 1}`;
      refs.equipmentSlots.append(placeholder);
    }
    return;
  }
  for (let i = 0; i < count; i++) refs.equipmentSlots.append(makeSlot('equipment', i, state.equipment[i], handlers));
}
