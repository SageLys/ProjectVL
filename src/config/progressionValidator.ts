import type { ProgressionConfig } from './types';

const RARITIES = new Set(['common', 'rare', 'epic']);

function fail(path: string, message: string): never {
  throw new Error(`[progression-config] ${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(path, '必须是有限非负数');
  }
  return value;
}

/** XP only schedules relic decisions; no stat-perk schema is accepted here. */
export function validateProgressionConfig(value: unknown): asserts value is ProgressionConfig {
  const root = object(value, '$.progression');
  nonNegativeNumber(root.killXpMul, '$.progression.killXpMul');
  if (!Number.isInteger(root.relicChoices) || Number(root.relicChoices) < 1) {
    fail('$.progression.relicChoices', '必须是正整数');
  }

  const target = object(root.targetRelics, '$.progression.targetRelics');
  if (!Number.isInteger(target.min) || !Number.isInteger(target.max)
    || Number(target.min) < 0 || Number(target.max) < Number(target.min)) {
    fail('$.progression.targetRelics', '必须满足 0 <= min <= max');
  }

  if (!Array.isArray(root.xpThresholds) || root.xpThresholds.length < 1) {
    fail('$.progression.xpThresholds', '必须是非空数组');
  }
  let previous = 0;
  root.xpThresholds.forEach((threshold, index) => {
    if (typeof threshold !== 'number' || !Number.isFinite(threshold)
      || threshold <= previous || threshold <= 0) {
      fail(`$.progression.xpThresholds[${index}]`, '必须是严格递增的正数');
    }
    previous = threshold;
  });
  if (root.xpThresholds.length !== Number(target.max)) {
    fail('$.progression.xpThresholds', '长度必须等于 targetRelics.max');
  }

  if (!Array.isArray(root.rarityByRelicIndex) || root.rarityByRelicIndex.length < 1) {
    fail('$.progression.rarityByRelicIndex', '必须是非空数组');
  }
  root.rarityByRelicIndex.forEach((raw, index) => {
    const weights = object(raw, `$.progression.rarityByRelicIndex[${index}]`);
    let total = 0;
    for (const [rarity, weight] of Object.entries(weights)) {
      if (!RARITIES.has(rarity)) fail(`$.progression.rarityByRelicIndex[${index}].${rarity}`, '非法品质');
      total += nonNegativeNumber(weight, `$.progression.rarityByRelicIndex[${index}].${rarity}`);
    }
    if (total <= 0) fail(`$.progression.rarityByRelicIndex[${index}]`, '至少一个品质权重必须大于 0');
  });

  const settlement = object(root.settlement, '$.progression.settlement');
  for (const key of ['winBonus', 'perWaveCleared', 'perKill', 'hpRatioBonusMax', 'perEquippedStarSquared']) {
    nonNegativeNumber(settlement[key], `$.progression.settlement.${key}`);
  }
  const wildcardValues = object(settlement.wildcardStarValue, '$.progression.settlement.wildcardStarValue');
  for (let star = 1; star <= 5; star++) {
    nonNegativeNumber(wildcardValues[String(star)], `$.progression.settlement.wildcardStarValue.${star}`);
  }
}
