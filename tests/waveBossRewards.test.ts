import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { dealDamage } from '../src/core/systems/damageSystem';
import { canCreateOffer } from '../src/core/systems/bountySystem';
import { computeWaveBossReward } from '../src/core/systems/waveBossSystem';
import { advanceWavePhase } from '../src/core/systems/waveSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

describe('wave Boss rewards', () => {
  it('follows the configured W1/W3/W4/W6/W8 curve', () => {
    expect(computeWaveBossReward(1)).toEqual([{ star: 1, count: 1 }]);
    expect(computeWaveBossReward(3)).toEqual([{ star: 1, count: 2 }]);
    expect(computeWaveBossReward(4)).toEqual([{ star: 2, count: 1 }]);
    expect(computeWaveBossReward(6)).toEqual([{ star: 2, count: 2 }]);
    expect(computeWaveBossReward(8)).toEqual([{ star: 3, count: 2 }]);
  });

  it('grants directly despite a full hand, creates no drop, and cannot be claimed twice', () => {
    const state = freshState();
    state.wave = 3; state.spawnLeft = 0;
    state.cards.fill(card('pierce', 1));
    advanceWavePhase(state, config, rng);
    const boss = state.enemies[0];
    const events = dealDamage(state, config, rng, boss, boss.hp + 1);
    expect(events).toContainEqual({ type: 'bossRewardGranted', wave: 3, grants: [{ star: 1, count: 2 }] });
    expect(state.wildcards[1]).toBe(2);
    expect(state.groundDrops).toEqual([]);
    expect(state.bossRewardClaimedWave).toBe(3);
    expect(dealDamage(state, config, rng, boss, 1)).toEqual([]);
    expect(state.wildcards[1]).toBe(2);
  });

  it('finishes the final wave after reward so settlement includes its wildcard value', () => {
    const state = freshState();
    state.wave = cfg.waves.totalWaves; state.spawnLeft = 0;
    const spawned = advanceWavePhase(state, config, rng);
    expect(spawned).toEqual([{ type: 'waveBossSpawned', wave: 8 }]);
    const boss = state.enemies[0];
    const killed = dealDamage(state, config, rng, boss, boss.hp + 1);
    const finished = advanceWavePhase(state, config, rng);
    const events = [...killed, ...finished];
    const rewardIndex = events.findIndex(event => event.type === 'bossRewardGranted');
    const endIndex = events.findIndex(event => event.type === 'gameEnd');
    expect(rewardIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(rewardIndex);
    expect(state.runSummary?.score.wildcards).toBe(200);
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
