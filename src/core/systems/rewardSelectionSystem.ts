import type { GameConfig, RewardDef } from '../../config/types';
import type { GameState, Rng } from '../types';

export function pickReward(state: GameState, config: GameConfig, rng: Rng): RewardDef {
  const all = config.rewardMeter.rewards;
  let candidates = config.rewardMeter.preventImmediateRepeat
    ? all.filter(reward => reward.id !== state.rewardMeter.lastRewardId)
    : all;
  const weight = (reward: RewardDef) => {
    const boost = config.rewardMeter.lowHpWeightBoost;
    return Math.max(0, reward.weight * (state.hp / Math.max(1, state.maxHp) < boost.hpRatioBelow && reward.id === boost.rewardId ? boost.weightMul : 1));
  };
  if (!candidates.length || candidates.reduce((sum, reward) => sum + weight(reward), 0) <= 0) candidates = all;
  const total = candidates.reduce((sum, reward) => sum + weight(reward), 0);
  let roll = rng() * total;
  for (const reward of candidates) {
    roll -= weight(reward);
    if (roll < 0) return reward;
  }
  return candidates[candidates.length - 1];
}
