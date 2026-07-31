import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { DomRefs } from './domRefs';
import { makeSlot, type SlotHandlers } from './slotFactory';
import { getModifiers } from '../core/effects/interpreter';

/** 渲染方案 A 独立装备栏。 */
export function renderEquipment(refs: DomRefs, state: GameState, handlers: SlotHandlers): void {
  const count = cfg.economy.equipSlots;
  const forms = getModifiers(state).weaponForms;
  const fusedIds = forms.some(form => form.kind === 'beam') && forms.some(form => form.kind === 'mortar')
    ? new Set(forms.map(form => form.sourceCardId)) : new Set<number>();
  refs.equipmentSlots.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const slot = makeSlot('equipment', i, state.equipment[i], handlers);
    const card = state.equipment[i];
    if (card && fusedIds.has(card.id)) {
      const note = document.createElement('span');
      note.className = 'card-fusion-badge';
      note.textContent = '⌁';
      note.setAttribute('aria-label', '已参与武器形态融合');
      const cardElement = slot.querySelector('.card');
      cardElement?.classList.add('has-fusion-badge');
      cardElement?.append(note);
    }
    refs.equipmentSlots.append(slot);
  }
}
