import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { RewardDef } from '../src/config/types';
import { tickEffects } from '../src/core/effects/runtime';
import { executeReward } from '../src/core/systems/rewardExecutionSystem';
import { calculateBuildProfile } from '../src/core/systems/buildProfileSystem';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function reward(id: string): RewardDef {
  return structuredClone(cfg.rewardMeter.rewards.find(candidate => candidate.id === id)!);
}

describe('reward execution', () => {
  it('global damage hits every enemy and caps boss damage', () => {
    const state = freshState();
    const config = createDefaultConfig();
    config.damage = 100;
    state.enemies = [
      enemy({ hp: 1000, maxHp: 1000 }),
      enemy({ hp: 1000, maxHp: 1000 }),
      enemy({ type: 'boss', spawnKind: 'waveBoss', hp: 1000, maxHp: 1000 }),
    ];
    executeReward(state, config, constRng(0), reward('heartbreakNova'));
    expect(state.enemies.map(target => target.hp)).toEqual([200, 200, 900]);
  });

  it('reward kills never charge the reward meter', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.enemies = [enemy({ hp: 1, maxHp: 1, xp: 1000 })];
    executeReward(state, config, constRng(0), reward('heartbreakNova'));
    expect(state.kills).toBe(1);
    expect(state.rewardMeter.points).toBe(0);
    expect(state.rewardMeter.currentReceipt).toBeNull();
  });

  it('global control respects the shared control budget', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.enemies = Array.from({ length: 10 }, () => enemy());
    executeReward(state, config, constRng(0), reward('absoluteStillness'));
    const frozen = state.enemies.filter(target => target.status.frozen > 0);
    expect(frozen.length).toBeGreaterThan(0);
    expect(frozen.length).toBeLessThan(state.enemies.length);
  });

  it('healing caps at max HP and grants the configured shield', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.hp = state.maxHp - 1;
    const { result } = executeReward(state, config, constRng(0), reward('clarityReflux'));
    expect(state.hp).toBe(state.maxHp);
    expect(result.healingGranted).toBe(1);
    expect(state.shield?.hits).toBe(1);
  });

  it('wildcards follow the activation schedule and clamp to its final star', () => {
    const config = createDefaultConfig();
    const early = freshState();
    executeReward(early, config, constRng(0), reward('wildHeart'), 2);
    expect(early.wildcards[2]).toBe(1);
    const late = freshState();
    executeReward(late, config, constRng(0), reward('wildHeart'), 999);
    expect(late.wildcards[5]).toBe(1);
  });

  it('build surge follows the live build, expires fully, and never mutates config', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.equipment[0] = card('pierce', 6);
    const definition = reward('buildResonance');
    const before = structuredClone(definition);
    const first = executeReward(state, config, constRng(0), definition, 0);
    const second = executeReward(state, config, constRng(0), definition, 1);
    expect(first.result.surgeTag).toBe('projectile');
    expect(second.result.surgeTag).toBe('projectile');
    expect(definition).toEqual(before);
    expect(state.statModifiers.length).toBe(4);
    expect(new Set(state.statModifiers.map(modifier => modifier.stat))).toEqual(
      new Set(['effectDamageMul', 'quantityAdd']),
    );
    expect(state.statModifiers.some(modifier =>
      ['damageMul', 'fireRateMul', 'rangeMul', 'maxHpMul'].includes(modifier.stat))).toBe(false);
    tickEffects(state, config, constRng(0), 13);
    expect(state.statModifiers).toEqual([]);
  });

  it('includes recipe-only product cards in the live build profile', () => {
    const state = freshState();
    const definition = cfg.skills.cards.find(candidate => candidate.recipeOnly)!;
    state.cards[0] = card(definition.id, 3);
    const profile = calculateBuildProfile(state);
    for (const tag of definition.synergyTags) expect(profile[tag]).toBeGreaterThanOrEqual(3);
  });
});
