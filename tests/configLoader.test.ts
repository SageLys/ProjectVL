import { describe, it, expect, afterEach } from 'vitest';
import { buildConfig, deepMerge, variantsFromSearch, cfg, applyVariants } from '../src/config';
import { resetTestEnv } from './helpers';
import { validateProgressionConfig } from '../src/config/progressionValidator';
afterEach(resetTestEnv);

describe('validation-10 variant', () => {
  it('keeps the encounter table and expands only the build stage', () => {
    const c = buildConfig(['validation-10']);
    expect(c.waves.totalWaves).toBe(10);
    expect(c.waves.bossWaves).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(c.waves.stagePlan.validation).toHaveLength(2);
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
  });
});

describe('config · 深合并', () => {
  it('对象递归合并，标量与数组整体替换，不改入参', () => { const base={a:{b:1,c:[1,2]},d:'x'}; const out=deepMerge(base,{a:{c:[9]}} as never); expect(out).toEqual({a:{b:1,c:[9]},d:'x'}); expect(base.a.c).toEqual([1,2]); });
});
describe('config · 方案A base', () => {
  it('可消耗释放的独立装备格，手牌7+装备3', () => { const c=buildConfig([]); expect(c.economy).toMatchObject({maxStar:6,mergeCopies:2,equipThreshold:3,handSlots:7,equipSlots:3,equipIrreversible:false,unequipPolicy:'consume'}); });
  it('dev-short 只覆盖波次', () => { const c=buildConfig(['dev-short']); expect(c.economy.handSlots).toBe(7); expect(c.waves.totalWaves).toBe(3); expect(c.waves.bossWaves).toEqual([1, 2, 3]); });
  it('未知 variant 忽略不炸', () => { expect(buildConfig(['nope']).economy.handSlots).toBe(7); });
  it('URL 参数解析', () => { expect(variantsFromSearch('?variant=dev-short')).toEqual(['dev-short']); expect(variantsFromSearch('?variant=a&variant=b')).toEqual(['a','b']); expect(variantsFromSearch('')).toEqual([]); });
  it('applyVariants 就地替换单例', () => { const ref=cfg; applyVariants(['dev-short']); expect(ref.waves.totalWaves).toBe(3); applyVariants([]); expect(ref.waves.totalWaves).toBe(8); });
});

describe('config · data-driven perks', () => {
  it('rejects duplicate ids and illegal lanes, roles, effect kinds, and scaling axes', () => {
    const cases: Array<(value: ReturnType<typeof buildConfig>['progression']) => void> = [
      value => { value.perks[1].id = value.perks[0].id; },
      value => { value.perks[0].lane = 'bad' as never; },
      value => { value.perks[0].offerRole = 'bad' as never; },
      value => { value.perks[0].effects[0].kind = 'bad' as never; },
      value => { const effect = value.perks[0].effects[0]; if (effect.kind === 'buildScaling') effect.axis = 'bad' as never; },
    ];
    for (const mutate of cases) {
      const progression = structuredClone(buildConfig().progression);
      mutate(progression);
      expect(() => validateProgressionConfig(progression)).toThrow(/progression-config/);
    }
  });
});
