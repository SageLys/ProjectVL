import { cfg } from '../config';
import type { WildcardInventory } from '../core/types';
import { texts } from '../data';
import type { SlotHandlers } from './slotFactory';

export function makeWildcardSlot(inventory: WildcardInventory, handlers: SlotHandlers): HTMLDivElement {
  const slot = document.createElement('div');
  slot.className = 'card-slot wildcard-slot';
  slot.dataset.testid = 'wildcard-slot';

  const total = Object.values(inventory).reduce((sum, count) => sum + count, 0);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'wildcard-card';
  el.draggable = false;
  el.setAttribute('aria-label', `${texts.wildcard.name}：${texts.wildcard.hint}`);
  el.setAttribute('aria-disabled', String(total <= 0));

  const counts: string[] = [];
  for (let star = 1; star < cfg.economy.maxStar; star++) {
    const count = inventory[star] ?? 0;
    counts.push(`<span class="wildcard-count${count > 0 ? ' available' : ''}"><b>${star}★</b><i>×${count}</i></span>`);
  }
  el.innerHTML = `<span class="wildcard-head"><strong>${texts.wildcard.name}</strong><small>${texts.wildcard.hint}</small></span><span class="wildcard-counts">${counts.join('')}</span>`;
  el.addEventListener('pointerdown', event => {
    if (total <= 0) return;
    handlers.dragStart(event, 'wildcard', 0, el);
  });
  slot.append(el);
  return slot;
}
