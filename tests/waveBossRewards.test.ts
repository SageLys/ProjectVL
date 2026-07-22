import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { dealDamage } from '../src/core/systems/damageSystem';
import { canCreateOffer } from '../src/core/systems/bountySystem';
import { computeWaveBossReward } from '../src/core/systems/waveBossSystem';
import { collectDrop } from '../src/core/systems/dropSystem';
import { advanceWavePhase } from '../src/core/systems/waveSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

describe('wave Boss rewards', () => {
  it('follows the configured stage schedule with one reward per wave', () => {
    expect(Array.from({ length: 8 }, (_, index) => computeWaveBossReward(index + 1)[0])).toEqual(
      [1, 1, 2, 2, 3, 4, 5, 5].map(star => ({ star, count: 1 })),
    );
  });

  it('drops a manually collected wildcard reward despite a full hand, and cannot be claimed twice', () => {
    const state = freshState();
    state.wave = 3; state.spawnLeft = 0;
    state.cards.fill(card('pierce', 1));
    advanceWavePhase(state, config, rng);
    const boss = state.enemies[0];
    const events = dealDamage(state, config, rng, boss, boss.hp + 1);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'bossRewardGranted' }));
    expect(state.wildcards[2]).toBe(0);
    expect(state.groundDrops).toEqual([expect.objectContaining({ kind: 'wildcard', star: 2, count: 1, bossRewardWave: 3 })]);
    expect(state.bossRewardClaimedWave).toBe(3);
    expect(dealDamage(state, config, rng, boss, 1)).toEqual([]);
    const pickupEvents = collectDrop(state, config, rng, state.groundDrops[0]);
    expect(pickupEvents).toContainEqual({ type: 'bossRewardGranted', wave: 3, grants: [{ star: 2, count: 1 }] });
    expect(state.wildcards[2]).toBe(1);
  });

  it('finishes the final wave after reward so settlement includes its wildcard value', () => {
    const state = freshState();
    state.wave = cfg.waves.totalWaves; state.spawnLeft = 0;
    const spawned = advanceWavePhase(state, config, rng);
    expect(spawned).toEqual([{ type: 'waveBossSpawned', wave: 8 }]);
    const boss = state.enemies[0];
    const killed = dealDamage(state, config, rng, boss, boss.hp + 1);
    expect(advanceWavePhase(state, config, rng)).toEqual([]);
    const pickedUp = collectDrop(state, config, rng, state.groundDrops[0]);
    const finished = advanceWavePhase(state, config, rng);
    const events = [...killed, ...pickedUp, ...finished];
    const rewardIndex = events.findIndex(event => event.type === 'bossRewardGranted');
    const endIndex = events.findIndex(event => event.type === 'gameEnd');
    expect(rewardIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(rewardIndex);
    expect(state.runSummary?.score.wildcards).toBe(600);
    expect(state.runSummary?.win).toBe(true);
  });

  it('closes the Bounty offer gate outside regular phase', () => {
    const state = freshState();
    state.wave = Math.max(1, cfg.bounty.offer.enabledFromWave);
    state.wavePhase = 'boss';
    expect(canCreateOffer(state)).toBe(false);
    state.wavePhase = 'between';
    expect(canCreateOffer(state)).toBe(false);
  });
});
