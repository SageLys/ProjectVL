import { beforeEach, describe, expect, it } from 'vitest';
import { addRewardPoints, confirmRewardReceipt } from '../src/core/systems/rewardMeterSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
describe('reward meter', () => {
  it('does not trigger below the threshold and triggers exactly once at it', () => {
    const state = freshState(); const config = createDefaultConfig();
    addRewardPoints(state, config, constRng(0), 9);
    expect(state.rewardMeter.currentReceipt).toBeNull();
    addRewardPoints(state, config, constRng(0), 1);
    expect(state.rewardMeter.activationCount).toBe(1);
    expect(state.rewardMeter.points).toBe(0);
  });
  it('triggers only at threshold and retains overflow', () => {
    const state = freshState(); const config = createDefaultConfig();
    addRewardPoints(state, config, constRng(0), 9); expect(state.rewardMeter.currentReceipt).toBeNull();
    addRewardPoints(state, config, constRng(0), 5); expect(state.rewardMeter.currentReceipt).not.toBeNull();
    expect(state.rewardMeter.points).toBe(4); expect(state.rewardMeter.activationCount).toBe(1);
  });
  it('creates one receipt for huge gains and waits for confirmation', () => {
    const state = freshState(); const config = createDefaultConfig();
    addRewardPoints(state, config, constRng(0), 100000);
    const first = state.rewardMeter.currentReceipt;
    addRewardPoints(state, config, constRng(0), 5);
    expect(state.rewardMeter.currentReceipt).toBe(first); expect(state.rewardMeter.activationCount).toBe(1);
    confirmRewardReceipt(state, config, constRng(0)); expect(state.rewardMeter.activationCount).toBe(2);
  });
  it('keeps accumulating behind a receipt without creating another one', () => {
    const state = freshState(); const config = createDefaultConfig();
    addRewardPoints(state, config, constRng(0), 10);
    const receipt = state.rewardMeter.currentReceipt;
    addRewardPoints(state, config, constRng(0), 12);
    expect(state.rewardMeter.currentReceipt).toBe(receipt);
    expect(state.rewardMeter.activationCount).toBe(1);
    expect(state.rewardMeter.points).toBe(12);
    confirmRewardReceipt(state, config, constRng(0));
    expect(state.rewardMeter.activationCount).toBe(2);
  });
  it('repeats the final threshold', () => {
    const state = freshState(); const config = createDefaultConfig();
    for (let i = 0; i < 10; i++) { addRewardPoints(state, config, constRng(0), 1000); confirmRewardReceipt(state, config, constRng(0)); }
    expect(state.rewardMeter.threshold).toBe(80);
  });
});
