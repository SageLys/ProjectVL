import { describe, expect, it } from 'vitest';
import balanceV3 from '../docs/P4.1_数值配置_v3.json';
import { buildConfig } from '../src/config';

describe('P4.1 balance JSON v3 · 当前运行配置与正式证据防漂移', () => {
  it('标准档关键运行配置与 v3 快照一致', () => {
    const config = buildConfig();
    expect(balanceV3.schemaVersion).toBe(3);
    expect(config.input).toEqual(balanceV3.runtimeSnapshot.base.input);
    expect(config.combat).toEqual(balanceV3.runtimeSnapshot.base.combat);
    expect(config.waves).toEqual(balanceV3.runtimeSnapshot.base.waves);
    expect(config.enemies).toEqual(balanceV3.runtimeSnapshot.base.enemies);
    expect(config.progression).toEqual(balanceV3.runtimeSnapshot.base.progression);
    expect(config.economy).toEqual(balanceV3.runtimeSnapshot.base.economy);
    expect(config.skills.mechanisms.bounty).toEqual(balanceV3.runtimeSnapshot.base.bounty);
  });

  it('宽容/挑战覆盖的 Boss 与 Bounty 和 v3 一致', () => {
    const easy = buildConfig(['difficulty-easy']);
    const hard = buildConfig(['difficulty-hard']);
    expect(easy.enemies.types.boss).toEqual(balanceV3.runtimeSnapshot.variants.easy.boss);
    expect(easy.skills.mechanisms.bounty).toEqual(balanceV3.runtimeSnapshot.variants.easy.bounty);
    expect(hard.enemies.types.boss).toEqual(balanceV3.runtimeSnapshot.variants.hard.boss);
    expect(hard.skills.mechanisms.bounty).toEqual(balanceV3.runtimeSnapshot.variants.hard.bounty);
  });

  it('正式九宫格完整，标准目标画像通过 P1/P4 回归与 P4.1 工程门槛', () => {
    expect(balanceV3.calibration.totalRuns).toBe(18_000);
    expect(balanceV3.calibration.runsPerScenario).toBe(2_000);
    expect(balanceV3.results).toHaveLength(9);
    expect(new Set(balanceV3.results.map(result => `${result.difficulty}/${result.profile}`)).size).toBe(9);
    expect(balanceV3.calibration.kpiEvaluation.allPass).toBe(true);
    const target = balanceV3.results.find(result => result.difficulty === 'base' && result.profile === 'target');
    expect(target).toMatchObject({ effectivePickupsP50: 43, rolling3sCountP95: 2, rolling10sCountP95: 5 });
    expect(target!.winRate).toBeGreaterThanOrEqual(0.15);
    expect(target!.winRate).toBeLessThanOrEqual(0.25);
    expect(target!.winningBossFightSecondsP50).toBeLessThanOrEqual(120);
    expect(target!.bountyCompletionRate).toBeGreaterThan(0.75);
    expect(target!.bountyCompletionRate).toBeLessThan(0.95);
  });
});
