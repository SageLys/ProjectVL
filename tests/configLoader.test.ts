import { describe, it, expect, afterEach } from 'vitest';
import { buildConfig, deepMerge, variantsFromSearch, cfg, applyVariants } from '../src/config';
import { resetTestEnv } from './helpers';
afterEach(resetTestEnv);

describe('config · 深合并', () => {
  it('对象递归合并，标量与数组整体替换，不改入参', () => { const base={a:{b:1,c:[1,2]},d:'x'}; const out=deepMerge(base,{a:{c:[9]}} as never); expect(out).toEqual({a:{b:1,c:[9]},d:'x'}); expect(base.a.c).toEqual([1,2]); });
});
describe('config · 方案A base', () => {
  it('永久独立装备格，手牌7+装备3', () => { const c=buildConfig([]); expect(c.economy).toMatchObject({maxStar:6,mergeCopies:2,equipThreshold:3,handSlots:7,equipSlots:3,equipIrreversible:true,unequipPolicy:'destroy'}); });
  it('dev-short 只覆盖波次', () => { const c=buildConfig(['dev-short']); expect(c.economy.handSlots).toBe(7); expect(c.waves.totalWaves).toBe(3); expect(c.waves.bossWave).toBe(3); });
  it('未知 variant 忽略不炸', () => { expect(buildConfig(['nope']).economy.handSlots).toBe(7); });
  it('URL 参数解析', () => { expect(variantsFromSearch('?variant=dev-short')).toEqual(['dev-short']); expect(variantsFromSearch('?variant=a&variant=b')).toEqual(['a','b']); expect(variantsFromSearch('')).toEqual([]); });
  it('applyVariants 就地替换单例', () => { const ref=cfg; applyVariants(['dev-short']); expect(ref.waves.totalWaves).toBe(3); applyVariants([]); expect(ref.waves.totalWaves).toBe(5); });
});
