import { describe, expect, it } from 'vitest';
import balanceV2 from '../docs/P4_数值配置_v2.json';
import { buildConfig } from '../src/config';

describe('P4 balance JSON v2 · 运行配置防漂移', () => {
  it('标准档快照与 base 运行配置一致', () => {
    const config = buildConfig([]);
    expect(balanceV2.schemaVersion).toBe(2);
    expect(config.combat).toMatchObject(balanceV2.base.combat);
    expect(config.waves).toEqual(balanceV2.base.waves);
    expect(config.enemies).toMatchObject(balanceV2.base.enemies);
    expect(config.progression).toMatchObject(balanceV2.base.progression);
    expect(config.economy).toEqual(balanceV2.base.economy);
    expect(config.skills.legacy.effects.luckPerScale).toBe(balanceV2.base.skillsLegacyOverride.luckPerScale);
  });

  it('宽容/挑战结果引用的 runtime id 可加载且难度有序', () => {
    const easy = buildConfig([balanceV2.difficultyVariants.easy.runtimeId]);
    const base = buildConfig([]);
    const hard = buildConfig([balanceV2.difficultyVariants.hard.runtimeId]);
    expect(easy.enemies.types.boss.hpBase).toBeLessThan(base.enemies.types.boss.hpBase);
    expect(base.enemies.types.boss.hpBase).toBeLessThan(hard.enemies.types.boss.hpBase);
    expect(easy.economy.defaults.dropChance).toBeGreaterThan(base.economy.defaults.dropChance);
    expect(base.economy.defaults.dropChance).toBeGreaterThan(hard.economy.defaults.dropChance);
  });
});
