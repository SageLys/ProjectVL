// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { renderEquipment } from '../src/ui/renderEquipment';
import { SLOT_CHANGING } from '../src/ui/eventText';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);
beforeEach(resetTestEnv);
afterEach(resetTestEnv);

describe('DOM: equipment bar refresh after consuming an equipped skill', () => {
  it('replicates game.ts dispatch: consume equipped -> slot DOM should clear', () => {
    document.body.innerHTML = '<div id="equipmentSlots"></div>';
    const container = document.getElementById('equipmentSlots')!;
    const refs: any = { equipmentSlots: container };
    const handlers: any = { dragStart() {} };

    const s = freshState();
    s.equipment[0] = card('pierce', 5);
    renderEquipment(refs, s, handlers);
    console.log('BEFORE consume, slot0 html:', container.children[0].innerHTML.slice(0,60));
    console.log('BEFORE occupied?', !!container.querySelector('[data-testid="equipped-card"]'));

    // replicate dispatch()
    const events = consumeCard(s, config, rng, 0, 100, 100, 'equipment');
    const slotsChanged = events.some(e => SLOT_CHANGING.has(e.type));
    console.log('events:', events.map(e=>e.type), 'slotsChanged:', slotsChanged);
    if (slotsChanged) renderEquipment(refs, s, handlers);

    const stillOccupied = !!container.querySelector('[data-testid="equipped-card"]');
    console.log('AFTER occupied?', stillOccupied, '| state.equipment[0]=', s.equipment[0]);
    console.log('AFTER slot0 text:', container.children[0].textContent);
    expect(stillOccupied).toBe(false);
  });
});
