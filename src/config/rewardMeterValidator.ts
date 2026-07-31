import type { RewardMeterConfig } from './types';

function fail(path: string, message: string): never { throw new Error(`[reward-meter-config] ${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}
function finite(value: unknown, path: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) fail(path, `必须是 >= ${min} 的有限数`);
  return value;
}

export function validateRewardMeterConfig(value: unknown): asserts value is RewardMeterConfig {
  const root = object(value, '$.rewardMeter');
  finite(root.pointMul, '$.rewardMeter.pointMul');
  finite(root.expiryConvertPointsPerStar, '$.rewardMeter.expiryConvertPointsPerStar');
  if (!Array.isArray(root.thresholds) || !root.thresholds.length) fail('$.rewardMeter.thresholds', '必须是非空数组');
  root.thresholds.forEach((item, index) => finite(item, `$.rewardMeter.thresholds[${index}]`, Number.MIN_VALUE));
  if (root.afterSchedule !== 'repeatLast' && root.afterSchedule !== 'stop') fail('$.rewardMeter.afterSchedule', '非法值');
  if (typeof root.preventImmediateRepeat !== 'boolean' || typeof root.rewardKillsGrantPoints !== 'boolean') fail('$.rewardMeter', '布尔开关非法');
  if (!Array.isArray(root.rewards) || !root.rewards.length) fail('$.rewardMeter.rewards', '必须是非空数组');
  const ids = new Set<string>();
  let total = 0;
  root.rewards.forEach((raw, index) => {
    const reward = object(raw, `$.rewardMeter.rewards[${index}]`);
    if (typeof reward.id !== 'string' || !reward.id || ids.has(reward.id)) fail(`$.rewardMeter.rewards[${index}].id`, '必须是唯一非空 id');
    ids.add(reward.id);
    if (reward.textKey !== `rewards.${reward.id}`) fail(`$.rewardMeter.rewards[${index}].textKey`, `必须等于 rewards.${reward.id}`);
    total += finite(reward.weight, `$.rewardMeter.rewards[${index}].weight`);
    const action = object(reward.action, `$.rewardMeter.rewards[${index}].action`);
    switch (action.kind) {
      case 'globalDamage': finite(action.damageMul, 'damageMul', Number.MIN_VALUE); finite(action.bossMaxHpRatioCap, 'bossMaxHpRatioCap', Number.MIN_VALUE); break;
      case 'globalControl': finite(action.freezeSeconds, 'freezeSeconds', Number.MIN_VALUE); finite(action.vulnerableRatio, 'vulnerableRatio'); finite(action.vulnerableSeconds, 'vulnerableSeconds', Number.MIN_VALUE); break;
      case 'restoreAndShield': finite(action.healRatio, 'healRatio'); finite(action.shieldHits, 'shieldHits'); break;
      case 'grantWildcards': finite(action.count, 'count', Number.MIN_VALUE); if (!Array.isArray(action.starSchedule) || !action.starSchedule.length) fail('starSchedule', '必须非空'); break;
      case 'buildSurge': finite(action.duration, 'duration', Number.MIN_VALUE); finite(action.value, 'value'); break;
      default: fail('action.kind', '非法奖励动作');
    }
  });
  if (total <= 0) fail('$.rewardMeter.rewards', '总权重必须大于 0');
  const boost = object(root.lowHpWeightBoost, '$.rewardMeter.lowHpWeightBoost');
  finite(boost.hpRatioBelow, 'hpRatioBelow'); finite(boost.weightMul, 'weightMul');
  if (typeof boost.rewardId !== 'string' || !ids.has(boost.rewardId)) fail('rewardId', '必须引用奖励 id');
}
