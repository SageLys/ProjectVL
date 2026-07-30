import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BindingDef, CardDef } from '../src/core/effects/defs';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { grantWildcards, useWildcardOnSlot } from '../src/core/systems/wildcardSystem';
import type { CardType, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, fixtureEvolutionTree, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);

beforeEach(resetTestEnv);
afterEach(resetTestEnv);

function def(id: CardType, equip: BindingDef[]): CardDef {
  const tier = { radius: 100, effects: [{ atom: 'burstDamage' as const, params: { damageMul: 1, radius: 100 } }] };
  return {
    id, identityContract: 'test fixture', category: 'projectile', synergyTags: ['projectile'], textKey: `t.${id}`, teaching: false,
    stars: { '3': { tier: 'core', equip }, '5': { tier: 'dual', equip }, '6': { tier: 'transform', equip } },
    amplifyAxis: { params: {} },
    evolutionTree: fixtureEvolutionTree(id, equip),
    consumable: { placement: 'point', anchors: { '1': tier, '3': tier, '6': tier } },
  };
}

function grant(state: GameState, star: number, count = 1): void {
  grantWildcards(state, [{ star, count }]);
}

describe('wildcardSystem', () => {
  it('grants independent inventory without occupying the hand', () => {
    const state = freshState();
    grant(state, 1);
    expect(state.cards).toHaveLength(7);
    expect(state.cards.every(value => value === null)).toBe(true);
    expect(state.wildcards[1]).toBe(1);
  });

  it('upgrades a hand card and counts one merge', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 2);
    grant(state, 2);
    useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(state.cards[0]?.star).toBe(3);
    expect(state.wildcards[2]).toBe(0);
    expect(state.merges).toBe(1);
  });

  it('upgrades equipment in place and records an equipment operation', () => {
    const state = freshState();
    state.equipment[0] = card('pierce', 3);
    const id = state.equipment[0]!.id;
    grant(state, 3);
    useWildcardOnSlot(state, config, rng, 'equipment', 0);
    expect(state.equipment[0]).toMatchObject({ id, star: 4 });
    expect(state.equipOps).toBe(1);
  });

  it('rejects when the matching-star inventory is missing without mutation', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 2);
    grant(state, 1);
    const events = useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(events).toEqual([{ type: 'wildcardMergeRejected', reason: 'missingWildcard', requiredStar: 2 }]);
    expect(state.wildcards[1]).toBe(1);
    expect(state.cards[0]?.star).toBe(2);
    expect(state.merges).toBe(0);
  });

  it('rejects empty hand and equipment slots without consumption', () => {
    for (const kind of ['cards', 'equipment'] as const) {
      const state = freshState();
      grant(state, 1);
      expect(useWildcardOnSlot(state, config, rng, kind, 0)).toEqual([{ type: 'wildcardMergeRejected', reason: 'emptyTarget', requiredStar: undefined }]);
      expect(state.wildcards[1]).toBe(1);
      expect(state.merges).toBe(0);
    }
  });

  it('rejects max-star targets without consumption or onMerge effects', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 6);
    grant(state, 5);
    const events = useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(events).toEqual([{ type: 'wildcardMergeRejected', reason: 'maxStar', requiredStar: 6 }]);
    expect(state.wildcards[5]).toBe(1);
    expect(state.merges).toBe(0);
  });

  it('settles the wildcard merge before continuing ordinary hand chain merges', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 1);
    state.cards[1] = card('pierce', 2);
    grant(state, 1);
    const events = useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(state.cards.filter(Boolean)).toHaveLength(1);
    expect(state.cards.find(Boolean)?.star).toBe(3);
    expect(state.merges).toBe(2);
    expect(events.filter(event => event.type === 'wildcardMerged' || event.type === 'merged').map(event => event.type)).toEqual(['wildcardMerged', 'merged']);
  });

  it('does not merge upgraded equipment across into the hand', () => {
    const state = freshState();
    state.equipment[0] = card('pierce', 2);
    state.cards[0] = card('pierce', 3);
    grant(state, 2);
    useWildcardOnSlot(state, config, rng, 'equipment', 0);
    expect(state.equipment[0]?.star).toBe(3);
    expect(state.cards[0]?.star).toBe(3);
    expect(state.merges).toBe(1);
  });

  it('fires equipped onMerge effects and returns their effect events', () => {
    registerSkillDefs([def('aegis', [{ trigger: 'onMerge', effects: [{ atom: 'mergePulse', params: { damagePerMergeCount: 10, radius: 'all' } }] }])]);
    const state = freshState();
    state.equipment[0] = card('aegis', 3);
    state.cards[0] = card('pierce', 1);
    state.enemies = [enemy({ hp: 1, maxHp: 1, xp: 100 })];
    grant(state, 1);
    const events = useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(state.enemies).toHaveLength(0);
    expect(events.some(event => event.type === 'rewardTriggered')).toBe(true);
  });

  it('ordinary auto merge never reads wildcard inventory', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 1);
    grant(state, 1, 100);
    expect(autoMergeCards(state, config, rng).merged).toBe(0);
    expect(state.cards[0]?.star).toBe(1);
    expect(state.wildcards[1]).toBe(100);
  });
});
