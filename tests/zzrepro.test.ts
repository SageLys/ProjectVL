import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);
beforeEach(resetTestEnv);
afterEach(resetTestEnv);

describe('repro: consume equipped then re-equip', () => {
  it('slot freed after consume, accepts new equip', () => {
    const s = freshState();
    s.equipment[0] = card('pierce', 3);
    // consume the equipped skill (drag to arena)
    const ev = consumeCard(s, config, rng, 0, 100, 100, 'equipment');
    console.log('consume events:', JSON.stringify(ev.map(e=>e.type)));
    console.log('equipment[0] after consume:', s.equipment[0]);
    // now try to equip a NEW different-type card into same slot
    s.cards[0] = card('frost', 3);
    const ev2 = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    console.log('re-equip events:', JSON.stringify(ev2));
    console.log('equipment[0] after re-equip:', s.equipment[0]?.type, s.equipment[0]?.star);
    expect(s.equipment[0]?.type).toBe('frost');
  });

  it('re-equip SAME type after consume', () => {
    const s = freshState();
    s.equipment[0] = card('pierce', 3);
    consumeCard(s, config, rng, 0, 100, 100, 'equipment');
    s.cards[0] = card('pierce', 3);
    const ev2 = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    console.log('same-type re-equip events:', JSON.stringify(ev2));
    console.log('equipment[0]:', s.equipment[0]?.type, s.equipment[0]?.star);
  });
});
