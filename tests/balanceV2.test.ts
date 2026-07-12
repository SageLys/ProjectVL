import { describe, expect, it } from 'vitest';
import balanceV2 from '../docs/P4_数值配置_v2.json';
import { buildConfig } from '../src/config';

describe('P4 balance JSON v2 · 历史基线与未改域防漂移', () => {
  it('v2 已由 v3 接续；P4.1 未改的战斗/经济骨架仍一致', () => {
    const config = buildConfig([]);
    expect(balanceV2.schemaVersion).toBe(2);
    expect(balanceV2.supersededBy).toBe('docs/P4.1_数值配置_v3.json');
    expect(config.combat).toMatchObject(balanceV2.base.combat);
    expect(config.waves).toEqual(balanceV2.base.waves);
    expect(config.enemies.defaults).toEqual(balanceV2.base.enemies.defaults);
    for (const type of ['normal', 'fast', 'tank'] as const) {
      expect(config.enemies.types[type]).toMatchObject(balanceV2.base.enemies.types[type]);
    }
    expect(config.progression).toMatchObject(balanceV2.base.progression);
    const { defaults: currentDefaults, ...currentEconomy } = config.economy;
    const { defaults: v2Defaults, ...v2Economy } = balanceV2.base.economy;
    expect(currentEconomy).toEqual(v2Economy);
    expect(currentDefaults.dropLifetime).toBe(v2Defaults.dropLifetime);
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
