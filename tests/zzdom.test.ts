// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { renderEquipment } from '../src/ui/renderEquipment';
import { SLOT_CHANGING } from '../src/ui/eventText';
import { createModals } from '../src/ui/modals';
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

describe('DOM: wave base reward decision', () => {
  it('renders all five options and disables the capped range option', () => {
    document.body.innerHTML = '<button id="restartBtn"></button>';
    const modals = createModals({
      restartBtn: document.querySelector('#restartBtn'),
    } as never, {
      onDecision() {},
      onRestart() {},
    });
    const state = freshState();

    modals.showDecision({
      kind: 'waveBaseReward',
      wave: 1,
      candidates: ['optDamage', 'optFireRate', 'optMaxHp', 'optXpGain'],
      capped: ['optRange'],
    }, state);

    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-decision-choice]');
    const range = document.querySelector<HTMLButtonElement>('[data-decision-choice="optRange"]')!;
    expect(buttons).toHaveLength(5);
    expect(range.disabled).toBe(true);
    expect(range.textContent).toContain('已达到上限');
  });
});
