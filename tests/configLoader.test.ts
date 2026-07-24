import { describe, it, expect, afterEach } from 'vitest';
import { buildConfig, deepMerge, variantsFromSearch, cfg, applyVariants } from '../src/config';
import { resetTestEnv } from './helpers';
import { validateProgressionConfig } from '../src/config/progressionValidator';
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
describe('config · 方案A base', () => {
  it('可消耗释放的独立装备格，手牌7+装备3', () => { const c=buildConfig([]); expect(c.economy).toMatchObject({maxStar:6,mergeCopies:2,equipThreshold:3,handSlots:7,equipSlots:3,equipIrreversible:false,unequipPolicy:'consume',equipSwappable:true}); });
  it('dev-short 只覆盖波次', () => { const c=buildConfig(['dev-short']); expect(c.economy.handSlots).toBe(7); expect(c.waves.totalWaves).toBe(3); expect(c.waves.bossWaves).toEqual([1, 2, 3]); });
  it('未知 variant 忽略不炸', () => { expect(buildConfig(['nope']).economy.handSlots).toBe(7); });
  it('URL 参数解析', () => { expect(variantsFromSearch('?variant=dev-short')).toEqual(['dev-short']); expect(variantsFromSearch('?variant=a&variant=b')).toEqual(['a','b']); expect(variantsFromSearch('')).toEqual([]); });
  it('applyVariants 就地替换单例', () => { const ref=cfg; applyVariants(['dev-short']); expect(ref.waves.totalWaves).toBe(3); applyVariants([]); expect(ref.waves.totalWaves).toBe(10); });
});

describe('config · relic progression', () => {
  it('rejects non-increasing thresholds, invalid rarity weights, and mismatched cap', () => {
    const cases: Array<(value: ReturnType<typeof buildConfig>['progression']) => void> = [
      value => { value.xpThresholds[1] = value.xpThresholds[0]; },
      value => { value.rarityByRelicIndex[0] = { common: 0 }; },
      value => { value.targetRelics.max = 7; },
    ];
    for (const mutate of cases) {
      const progression = structuredClone(buildConfig().progression);
      mutate(progression);
      expect(() => validateProgressionConfig(progression)).toThrow(/progression-config/);
    }
  });
});
