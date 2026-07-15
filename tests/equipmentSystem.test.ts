import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);
beforeEach(resetTestEnv);
afterEach(resetTestEnv);

describe('equipmentSystem · separate equipment slots', () => {
  it('rejects 1-star and 2-star cards without side effects', () => {
    for (const star of [1, 2]) {
      const s = freshState();
      s.cards[0] = card('pierce', star);
      expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0)).toEqual([{ type: 'equipRejected', reason: 'star' }]);
      expect(s.cards[0]?.star).toBe(star);
    }
  });

  it('equips 3-star and 6-star cards', () => {
    for (const star of [3, 6]) {
      const s = freshState();
      s.cards[0] = card('pierce', star);
      expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0)).toContainEqual({ type: 'equipped', cardType: 'pierce', star, slotIndex: 0 });
      expect(s.cards[0]).toBeNull();
      expect(s.equipment[0]?.star).toBe(star);
    }
  });

  it('rejects a duplicate equipped skill', () => {
    const s = freshState();
    s.equipment[0] = card('pierce', 3);
    s.cards[0] = card('pierce', 4);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 1)).toEqual([{ type: 'equipRejected', reason: 'duplicate' }]);
  });

  it('feeds matching equipped cards to raise their star', () => {
    const s = freshState();
    s.equipment[0] = card('pierce', 3);
    s.cards[0] = card('pierce', 3);
    const events = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    expect(events).toContainEqual({ type: 'fed', cardType: 'pierce', resultStar: 4 });
    expect(s.cards[0]).toBeNull();
    expect(s.equipment[0]?.star).toBe(4);
  });

  it('does not move equipment back to the hand', () => {
    const s = freshState();
    const equipped = card('pierce', 3);
    s.equipment[0] = equipped;
    expect(moveOrSwap(s, config, rng, 'equipment', 0, 'cards', 0)).toEqual([]);
    expect(s.equipment[0]).toBe(equipped);
  });

  it('consumes equipped cards into an active skill release', () => {
    const s = freshState();
    s.equipment[1] = card('sanctum', 5);
    expect(consumeCard(s, config, rng, 1, 120, 240, 'equipment')).toContainEqual({ type: 'skillConsumed', cardType: 'sanctum', star: 5, x: 120, y: 240 });
    expect(s.equipment[1]).toBeNull();
  });

  it('only increments consume telemetry when releasing a hand card', () => {
    const s = freshState();
    s.cards[0] = card('frost', 2);
    consumeCard(s, config, rng, 0, 1, 2);
    expect(s.consumes).toBe(1);
    expect(s.equipOps).toBe(0);
  });
});
