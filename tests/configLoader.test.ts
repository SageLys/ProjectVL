import { describe, it, expect, afterEach } from 'vitest';
import { buildConfig, deepMerge, variantsFromSearch, cfg, applyVariants } from '../src/config';
import { resetTestEnv } from './helpers';

afterEach(resetTestEnv);

describe('config · 深合并', () => {
  it('对象递归合并，标量与数组整体替换，不改入参', () => {
    const base = { a: { b: 1, c: [1, 2] }, d: 'x' };
    const out = deepMerge(base, { a: { c: [9] } } as never);
    expect(out).toEqual({ a: { b: 1, c: [9] }, d: 'x' });
    expect(base.a.c).toEqual([1, 2]);
  });
});

describe('config · variant 加载器（A/B 测试基建）', () => {
  it('base：方案B 锁定即装备，共享 10 格锁 3（P4前置换算）', () => {
    const c = buildConfig([]);
    expect(c.economy.equipMode).toBe('lock');
    expect(c.economy.handSlots).toBe(10);
    expect(c.economy.equipSlots).toBe(0);
    expect(c.economy.maxLocked).toBe(3);
    expect(c.economy.equipThreshold).toBe(2);
    expect(c.economy.mergeCopies).toBe(2);
    expect(c.economy.maxStar).toBe(3);
  });

  it('equip-slots variant：方案A 手牌7+装备3，其余域不受影响', () => {
    const c = buildConfig(['equip-slots']);
    expect(c.economy.equipMode).toBe('slots');
    expect(c.economy.handSlots).toBe(7);
    expect(c.economy.equipSlots).toBe(3);
    expect(c.waves.totalWaves).toBe(buildConfig([]).waves.totalWaves);
    expect(c.combat.defaults.damage).toBe(16);
  });

  it('variant 依序叠加：equip-slots + dev-short 同时生效', () => {
    const c = buildConfig(['equip-slots', 'dev-short']);
    expect(c.economy.handSlots).toBe(7);
    expect(c.waves.totalWaves).toBe(3);
    expect(c.waves.bossWave).toBe(3);
  });

  it('未知 variant 忽略不炸', () => {
    expect(buildConfig(['nope']).economy.handSlots).toBe(10);
  });

  it('URL 参数解析：?variant=a,b 与重复参数均支持', () => {
    expect(variantsFromSearch('?variant=equip-slots,dev-short')).toEqual(['equip-slots', 'dev-short']);
    expect(variantsFromSearch('?variant=a&variant=b')).toEqual(['a', 'b']);
    expect(variantsFromSearch('')).toEqual([]);
  });

  it('applyVariants 就地替换单例（引用保持稳定）', () => {
    const ref = cfg;
    applyVariants(['dev-short']);
    expect(ref.waves.totalWaves).toBe(3);
    applyVariants([]);
    expect(ref.waves.totalWaves).toBe(5);
  });
});
