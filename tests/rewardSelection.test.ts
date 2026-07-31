import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { pickReward } from '../src/core/systems/rewardSelectionSystem';
import { resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
describe('reward selection', () => {
  it('is reproducible and prevents immediate repeats', () => {
    const a = freshState(), b = freshState(); const ra = createSeededRng(7), rb = createSeededRng(7);
    expect(pickReward(a, cfg, ra).id).toBe(pickReward(b, cfg, rb).id);
    a.rewardMeter.lastRewardId = 'heartbreakNova'; expect(pickReward(a, cfg, constRng(0)).id).not.toBe('heartbreakNova');
  });
  it('falls back when remaining weights are zero and boosts low-HP healing', () => {
    const state = freshState(); const original = cfg.rewardMeter.rewards.map(r => r.weight);
    cfg.rewardMeter.rewards.forEach(r => { r.weight = r.id === 'heartbreakNova' ? 1 : 0; }); state.rewardMeter.lastRewardId = 'heartbreakNova';
    expect(pickReward(state, cfg, constRng(0))).toBeDefined();
    original.forEach((weight, i) => { cfg.rewardMeter.rewards[i].weight = weight; });
    state.hp = 1; expect(pickReward(state, cfg, constRng(0.3)).id).toBe('clarityReflux');
  });
  it('is not a RunDecision', () => {
    const state = freshState(); state.rewardMeter.currentReceipt = { rewardId: 'x', activationIndex: 0, result: {} };
    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'x')).toEqual([]);
  });
});
