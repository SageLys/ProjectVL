import { describe, it, expect, afterEach } from 'vitest';
import { buildConfig, deepMerge, variantsFromSearch, cfg, applyVariants, VARIANTS } from '../src/config';
import { normalizeValidationStage } from '../src/config/loader';
import { resetTestEnv } from './helpers';
import { validateRewardMeterConfig } from '../src/config/rewardMeterValidator';
import { computeWaveBossReward } from '../src/core/systems/waveBossSystem';
afterEach(resetTestEnv);

describe('10-wave base configuration', () => {
  it('uses 3 recruitment, 5 convergence, and 2 validation waves', () => {
    const c = buildConfig();
    expect(c.waves.totalWaves).toBe(10);
    expect(c.waves.bossWaves).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(c.waves.stagePlan.validation).toHaveLength(2);
    expect(Array.from({ length: 10 }, (_, index) => computeWaveBossReward(index + 1, c)[0].star)).toEqual(
      [1, 1, 1, 2, 2, 3, 4, 4, 5, 5],
    );
  });
});

describe('击退配置', () => {
  it('加载类型抗性与连续击退递减参数', () => {
    const c = buildConfig([]);
    expect(c.enemies.types.normal.knockbackResist).toBe(0);
    expect(c.enemies.types.fast.knockbackResist).toBe(0);
    expect(c.enemies.types.tank.knockbackResist).toBe(0.4);
    expect(c.enemies.types.boss.knockbackResist).toBe(0.85);
    expect(c.combat.knockbackFatigue).toEqual({ decayFactor: 0.5, windowSeconds: 2, minMultiplier: 0.125 });
    expect(c.enemies.types.normal.ccResist).toBe(0);
    expect(c.enemies.types.fast.ccResist).toBe(0);
    expect(c.enemies.types.tank.ccResist).toBe(0.25);
    expect(c.enemies.types.boss.ccResist).toBe(0.5);
    expect(c.combat.ccImmunity).toEqual({ afterFreezeSeconds: 1.2, afterStunSeconds: 0.8 });
    expect(c.combat.controlCeiling).toEqual({ freezeSeconds: 2.5, stunSeconds: 1.5, knockbackDistance: 120 });
    expect(c.combat.controlBudget).toEqual({ maxControlledRatio: 0.6, minFreeAdvancers: 2 });
  });
});

describe('config · 深合并', () => {
  it('对象递归合并，标量与数组整体替换，不改入参', () => { const base={a:{b:1,c:[1,2]},d:'x'}; const out=deepMerge(base,{a:{c:[9]}} as never); expect(out).toEqual({a:{b:1,c:[9]},d:'x'}); expect(base.a.c).toEqual([1,2]); });
});
describe('config · 验证波兼容层', () => {
  it('把旧 enemies 格式迁移为互不重复的里程碑精英和零配额敌潮', () => {
    const legacy = buildConfig();
    const oldEnemies = legacy.waves.stagePlan.validation[0].elites
      .map(({ spawnAtProgress: _progress, ...enemy }) => enemy);
    (legacy.waves.stagePlan.validation[0] as unknown as Record<string, unknown>).enemies = oldEnemies;
    delete (legacy.waves.stagePlan.validation[0] as unknown as { elites?: unknown }).elites;
    delete (legacy.waves.stagePlan.validation[0] as unknown as { swarm?: unknown }).swarm;
    normalizeValidationStage(legacy);
    const migrated = legacy.waves.stagePlan.validation[0];
    expect(migrated.swarm.quota).toBe(0);
    expect(migrated.elites).toHaveLength(oldEnemies.length);
    expect(new Set(migrated.elites.map(elite => elite.spawnAtProgress)).size).toBe(oldEnemies.length);
    expect(migrated.elites.every(elite => elite.spawnAtProgress >= 0 && elite.spawnAtProgress < 1)).toBe(true);
  });
});
describe('config · 方案A base', () => {
  it('可消耗释放的独立装备格，手牌7+装备3', () => { const c=buildConfig([]); expect(c.economy).toMatchObject({maxStar:6,mergeCopies:2,equipThreshold:3,handSlots:7,equipSlots:3,equipIrreversible:false,unequipPolicy:'consume',equipSwappable:true}); });
  it('dev-short 只覆盖波次', () => { const c=buildConfig(['dev-short']); expect(c.economy.handSlots).toBe(7); expect(c.waves.totalWaves).toBe(3); expect(c.waves.bossWaves).toEqual([1, 2, 3]); });
  it('未知 variant 忽略不炸', () => { expect(buildConfig(['nope']).economy.handSlots).toBe(7); });
  it('URL 参数解析', () => { expect(variantsFromSearch('?variant=dev-short')).toEqual(['dev-short']); expect(variantsFromSearch('?variant=a&variant=b')).toEqual(['a','b']); expect(variantsFromSearch('')).toEqual([]); });
  it('applyVariants 就地替换单例', () => { const ref=cfg; applyVariants(['dev-short']); expect(ref.waves.totalWaves).toBe(3); applyVariants([]); expect(ref.waves.totalWaves).toBe(10); });
  it('旧 variant 缺少导演新字段时由兼容层回填', () => {
    const name = 'legacy-director-fields';
    VARIANTS[name] = {
      waves: { stagePlan: { enabled: undefined } },
      economy: { normalDropTypePolicy: { bootstrapForcedDrops: undefined } },
    } as never;
    try {
      const legacy = buildConfig([name]);
      expect(legacy.waves.stagePlan.enabled).toBe(true);
      expect(legacy.economy.normalDropTypePolicy.bootstrapForcedDrops).toBe(9);
    } finally {
      delete VARIANTS[name];
    }
  });
});

describe('config · reward meter', () => {
  it('accepts segment thresholds and rejects zero total reward weight', () => {
    const meter = structuredClone(buildConfig().rewardMeter);
    meter.thresholds = [10, 5];
    expect(() => validateRewardMeterConfig(meter)).not.toThrow();
    meter.rewards.forEach(reward => { reward.weight = 0; });
    expect(() => validateRewardMeterConfig(meter)).toThrow(/reward-meter-config/);
  });
});
