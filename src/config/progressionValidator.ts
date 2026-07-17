import type { ProgressionConfig } from './types';

const LANES = new Set(['projectile', 'control', 'domain', 'defense', 'utility']);
const ROLES = new Set(['route', 'bridge', 'utility']);
const EFFECT_KINDS = new Set(['stat', 'buildScaling']);
const STATS = new Set(['damagePct', 'fireRatePct', 'heal', 'maxHp', 'xpGainPct', 'rangePct']);
const AXES = new Set([
  'effectDamageMul', 'quantityAdd', 'controlPotencyMul', 'controlledDamageTakenMul',
  'areaScaleMul', 'dotDamageMul', 'defenseDurabilityMul', 'retaliationMul',
]);

function fail(path: string, message: string): never { throw new Error(`[progression-config] ${path}: ${message}`); }
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, '必须是对象');
  return value as Record<string, unknown>;
}

/** Perk 配置保持严格失败：非法结构在启动/构建时直接抛错。 */
export function validateProgressionConfig(value: unknown): asserts value is ProgressionConfig {
  const root = object(value, '$.progression');
  const settlement = object(root.settlement, '$.progression.settlement');
  for (const key of ['winBonus', 'perWaveCleared', 'perKill', 'hpRatioBonusMax', 'perEquippedStarSquared']) {
    if (typeof settlement[key] !== 'number' || !Number.isFinite(settlement[key]) || Number(settlement[key]) < 0) {
      fail(`$.progression.settlement.${key}`, 'must be a finite non-negative number');
    }
  }
  const wildcardValues = object(settlement.wildcardStarValue, '$.progression.settlement.wildcardStarValue');
  for (let star = 1; star <= 5; star++) {
    if (typeof wildcardValues[String(star)] !== 'number' || Number(wildcardValues[String(star)]) < 0) {
      fail(`$.progression.settlement.wildcardStarValue.${star}`, 'must be a non-negative number');
    }
  }
  if (!Array.isArray(root.perks)) fail('$.progression.perks', '必须是数组');
  const ids = new Set<string>();
  root.perks.forEach((raw, index) => {
    const path = `$.progression.perks[${index}]`;
    const perk = object(raw, path);
    if (typeof perk.id !== 'string' || !perk.id) fail(`${path}.id`, '必须是非空字符串');
    if (ids.has(perk.id)) fail(`${path}.id`, 'id 不得重复');
    ids.add(perk.id);
    if (!LANES.has(String(perk.lane))) fail(`${path}.lane`, '非法流派');
    if (!ROLES.has(String(perk.offerRole))) fail(`${path}.offerRole`, '非法三选一角色');
    if (typeof perk.affinityGain !== 'number' || perk.affinityGain < 0) fail(`${path}.affinityGain`, '必须为非负数');
    if (typeof perk.weight !== 'number' || perk.weight < 0) fail(`${path}.weight`, '必须为非负数');
    if (!Number.isInteger(perk.maxStacks) || Number(perk.maxStacks) < 1) fail(`${path}.maxStacks`, '必须为正整数');
    if (!Array.isArray(perk.effects) || perk.effects.length < 1) fail(`${path}.effects`, '必须是非空数组');
    perk.effects.forEach((rawEffect, effectIndex) => {
      const effectPath = `${path}.effects[${effectIndex}]`;
      const effect = object(rawEffect, effectPath);
      if (!EFFECT_KINDS.has(String(effect.kind))) fail(`${effectPath}.kind`, '非法效果类型');
      if (typeof effect.value !== 'number' || !Number.isFinite(effect.value)) fail(`${effectPath}.value`, '必须为有限数值');
      if (effect.kind === 'stat' && !STATS.has(String(effect.stat))) fail(`${effectPath}.stat`, '非法数值属性');
      if (effect.kind === 'buildScaling') {
        if (!AXES.has(String(effect.axis))) fail(`${effectPath}.axis`, '非法流派缩放轴');
        if (!Array.isArray(effect.targetTags) || effect.targetTags.length < 1 || effect.targetTags.some(tag => !LANES.has(String(tag)))) {
          fail(`${effectPath}.targetTags`, '必须是非空合法流派数组');
        }
      }
    });
  });
}
