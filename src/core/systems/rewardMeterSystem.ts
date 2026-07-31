import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { executeReward } from './rewardExecutionSystem';
import { pickReward } from './rewardSelectionSystem';

export function withRewardPointsSuppressed<T>(state: GameState, fn: () => T): T {
  state.rewardMeter.suppressDepth++;
  try { return fn(); } finally { state.rewardMeter.suppressDepth--; }
}
export function hasPendingReward(state: GameState): boolean { return state.rewardMeter.currentReceipt !== null; }

function trigger(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const meter = state.rewardMeter;
  if (meter.currentReceipt || meter.points < meter.threshold || !Number.isFinite(meter.threshold)) return [];
  meter.points -= meter.threshold;
  const activationIndex = meter.activationCount++;
  meter.thresholdIndex++;
  meter.threshold = cfg.rewardMeter.thresholds[meter.thresholdIndex]
    ?? (cfg.rewardMeter.afterSchedule === 'repeatLast' ? cfg.rewardMeter.thresholds[cfg.rewardMeter.thresholds.length - 1] : Infinity);
  const reward = pickReward(state, cfg, rng);
  meter.lastRewardId = reward.id;
  const executed = executeReward(state, config, rng, reward, activationIndex);
  meter.currentReceipt = { rewardId: reward.id, activationIndex, result: executed.result };
  return [...executed.events, { type: 'rewardTriggered', rewardId: reward.id, activationIndex, result: executed.result }];
}

export function addRewardPoints(state: GameState, config: Config, rng: Rng, amount: number): GameEvent[] {
  if (state.rewardMeter.suppressDepth > 0) return [];
  const gained = amount * cfg.rewardMeter.pointMul * (1 + state.rewardMeter.pointGainBonus);
  state.rewardMeter.points += gained;
  const events: GameEvent[] = [{ type: 'rewardPointsGained', amount: gained, total: state.rewardMeter.points }];
  if (state.rewardMeter.currentReceipt) return events;
  return [...events, ...trigger(state, config, rng)];
}

export function confirmRewardReceipt(state: GameState, config: Config, rng: Rng): GameEvent[] {
  const receipt = state.rewardMeter.currentReceipt;
  if (!receipt) return [];
  state.rewardMeter.currentReceipt = null;
  return [{ type: 'rewardConfirmed', rewardId: receipt.rewardId }, ...trigger(state, config, rng)];
}
