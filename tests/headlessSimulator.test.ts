import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { isParticleSimulationEnabled } from '../src/core/systems/particleSystem';
import {
  classifyBossResolution,
  createSeededRng,
  deriveRunSeeds,
  headlessBatchToCsv,
  headlessRunsToCsv,
  runHeadlessBatch,
} from '../src/sim/headlessSimulator';
import { resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

const quickOptions = {
  runs: 2,
  seed: 424242,
  variantNames: ['dev-short'],
  metaPowerMultiplier: 10,
  maxActiveSeconds: 600,
  bot: {
    permanentMissChance: 0,
    pickupReactionSeconds: 0,
    pickupReactionJitterSeconds: 0,
    perkDecisionSeconds: 4,
    actionErrorChance: 0,
  },
};

describe('headlessSimulator · RNG 与批次隔离', () => {
  it('同 seed 产生相同序列，gameplay/bot 使用不同派生流', () => {
    const a = createSeededRng(7);
    const b = createSeededRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const seeds = deriveRunSeeds(7, 0);
    expect(seeds.gameplaySeed).not.toBe(seeds.botSeed);
    expect(deriveRunSeeds(7, 0)).toEqual(seeds);
  });

  it('Boss 从数组消失时以 kills 增量区分击杀与突破', () => {
    expect(classifyBossResolution(true, false, 10, 11)).toBe('killed');
    expect(classifyBossResolution(true, false, 10, 10)).toBe('breached');
    expect(classifyBossResolution(true, true, 10, 10)).toBe('none');
  });

  it('相同选项逐字段可复现，并在结束后恢复 cfg 与粒子开关', () => {
    const before = structuredClone(cfg);
    const particlesBefore = isParticleSimulationEnabled();
    const first = runHeadlessBatch(quickOptions);
    const second = runHeadlessBatch(quickOptions);

    expect(second).toEqual(first);
    expect(cfg).toEqual(before);
    expect(isParticleSimulationEnabled()).toBe(particlesBefore);
    expect(first.runs.every(run => run.gameplaySeed !== run.botSeed)).toBe(true);
    expect(first.runs.every(run => run.peak.particles === 0)).toBe(true);
  });
});

describe('headlessSimulator · 真实 core、bot 与指标', () => {
  it('支持 variant/meta 层、30Hz 整局、逐波与 Boss/结算快照', () => {
    const result = runHeadlessBatch(quickOptions);
    const run = result.runs[0];

    expect(result.config.totalWaves).toBe(3);
    expect(result.config.bossWave).toBe(3);
    expect(result.config.simulatedDamage).toBe(result.config.baseDamage * 10);
    expect(run.win || !run.timedOut).toBe(true);
    expect(run.timedOut).toBe(false);
    const minimumWallSeconds = run.activeDurationSeconds + run.perkDecisions * 4;
    expect(run.estimatedWallDurationSeconds).toBeGreaterThanOrEqual(minimumWallSeconds);
    expect(run.estimatedWallDurationSeconds - minimumWallSeconds).toBeLessThan(2);
    expect(run.waveStats).toHaveLength(3);
    expect(run.waveStats.every(wave => wave.startActiveSeconds !== null)).toBe(true);
    expect(run.waveStats.reduce((sum, wave) => sum + wave.merges, 0)).toBe(run.merges);
    expect(run.waveStats.reduce((sum, wave) => sum + wave.dropsGenerated, 0)).toBe(run.dropsGenerated);
    expect(run.waveStats.reduce((sum, wave) => sum + wave.collected, 0)).toBe(run.collected);
    expect(run.waveStats.reduce((sum, wave) => sum + wave.expired, 0)).toBe(run.expired);
    expect(run.bossEntryEconomy).not.toBeNull();
    expect(run.bossSpawnEconomy).not.toBeNull();
    if (run.preBossKillEconomy) {
      expect(run.preBossKillEconomy.collected).toBeLessThanOrEqual(run.settlementEconomy.collected);
      expect(run.bossFightDurationSeconds).toBeGreaterThan(0);
    }
    expect(run.breatherSeconds).toBeGreaterThan(0);
    expect(run.dropsGenerated).toBe(run.collected + run.expired + run.unresolvedDrops);
    expect(run.attention.profile).toBe('target');
    expect(run.attention.actions).toBeGreaterThan(0);
    expect(run.attention.perkActions).toBe(run.perkDecisions);
    expect(run.attention.actionsPerMinute).toBeGreaterThan(0);
    expect(run.attention.queueDelayP95Seconds).toBeGreaterThanOrEqual(0);
  });

  it('永久漏点只抽一次；Boss 尾奖自然过期后仍能结算', () => {
    const result = runHeadlessBatch({
      ...quickOptions,
      runs: 1,
      metaPowerMultiplier: 100,
      bot: {
        ...quickOptions.bot,
        permanentMissChance: 1,
      },
    });
    const run = result.runs[0];
    expect(run.win).toBe(true);
    expect(run.dropsGenerated).toBeGreaterThan(0);
    expect(run.collected).toBe(0);
    expect(run.expired).toBe(run.dropsGenerated);
    expect(run.permanentlyMissedDrops).toBe(run.dropsGenerated);
    expect(run.expiredRate).toBe(1);
  });

  it('base 即使提前超时也保留完整 9 段逐波结构', () => {
    const result = runHeadlessBatch({ runs: 1, seed: 9, maxActiveSeconds: 1 });
    const run = result.runs[0];
    expect(result.config.totalWaves).toBe(9);
    expect(run.timedOut).toBe(true);
    expect(run.waveStats).toHaveLength(9);
    expect(run.waveStats[0].startActiveSeconds).toBe(0);
    expect(run.waveStats[0].endActiveSeconds).toBeCloseTo(run.activeDurationSeconds);
    expect(run.waveStats[1].startActiveSeconds).toBeNull();
  });

  it('批量 summary 提供 P4 KPI 派生率，CSV 为一局一行', () => {
    const result = runHeadlessBatch(quickOptions);
    expect(result.summary.winRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.expiredRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.collectedRate).toBeLessThanOrEqual(1);
    expect(result.summary.metrics.mergesPerRegularWave).toBeDefined();
    expect(result.summary.metrics.breatherShare).toBeDefined();
    expect(result.summary.metrics.bossShare).toBeDefined();
    expect(result.summary.winningBossFightDurationSeconds.mean).toBeGreaterThanOrEqual(0);
    expect(result.summary.winningBossShare.mean).toBeGreaterThanOrEqual(0);
    expect(result.summary.attention.profile).toBe('target');
    expect(result.summary.attention.actionsPerMinute.mean).toBeGreaterThan(0);
    expect(result.summary.metrics.attentionRolling3sP95).toBeDefined();
    expect(result.summary.metrics.bountyAcceptedRunDeaths).toBeDefined();

    const csv = headlessRunsToCsv(result.runs).trim().split('\n');
    expect(csv).toHaveLength(result.runs.length + 1);
    expect(csv[0]).toContain('gameplaySeed');
    expect(csv[0]).toContain('preBossKillCollected');
    expect(csv[0]).toContain('expiredRate');
    expect(csv[0]).toContain('attentionActionsPerMinute');
    expect(headlessBatchToCsv(result).split('\n')[0]).toContain('metaPowerMultiplier');
    expect(headlessBatchToCsv(result).split('\n')[0]).toContain('attentionProfile');
  });
});

describe('headlessSimulator · P4.1 共享注意力', () => {
  it('默认 target，并提供 fast/target/stressed 三组可审计参数', () => {
    const profileOptions = {
      runs: 1,
      seed: 424242,
      variantNames: ['dev-short'],
      metaPowerMultiplier: 10,
      maxActiveSeconds: 300,
    };
    const target = runHeadlessBatch(profileOptions);
    const fast = runHeadlessBatch({ ...profileOptions, attentionProfile: 'fast' as const });
    const stressed = runHeadlessBatch({ ...profileOptions, attentionProfile: 'stressed' as const });

    expect(target.options.attentionProfile).toBe('target');
    expect(fast.options.bot.verbSwitchSeconds).toBeLessThan(target.options.bot.verbSwitchSeconds);
    expect(stressed.options.bot.verbSwitchSeconds).toBeGreaterThan(target.options.bot.verbSwitchSeconds);
    expect(fast.options.bot.actionErrorChance).toBeLessThan(stressed.options.bot.actionErrorChance);
    expect(stressed.runs[0].attention.profile).toBe('stressed');
  });

  it('长动作会让已看见的掉落在共享队列中额外过期', () => {
    const result = runHeadlessBatch({
      runs: 1,
      seed: 77,
      variantNames: ['dev-short'],
      metaPowerMultiplier: 10,
      maxActiveSeconds: 300,
      attentionProfile: 'target',
      bot: {
        permanentMissChance: 0,
        pickupReactionSeconds: 0,
        pickupReactionJitterSeconds: 0,
        pickupActionIntervalSeconds: 20,
        equipmentActionSeconds: 20,
        consumeActionSeconds: 20,
        bountyActionSeconds: 20,
        verbSwitchSeconds: 0,
        spatialTravelSecondsPer100Px: 0,
        actionErrorChance: 0,
      },
    });
    const attention = result.runs[0].attention;
    expect(attention.attentionExtraExpired).toBeGreaterThan(0);
    expect(attention.abandoned.expiredInQueue).toBe(attention.attentionExtraExpired);
  });

  it('Bounty 接单、击杀和奖励拾取进入同一批次统计', () => {
    const result = runHeadlessBatch({
      runs: 12,
      seed: 20260712,
      variantNames: ['dev-short'],
      metaPowerMultiplier: 2,
      maxActiveSeconds: 300,
      attentionProfile: 'fast',
      bot: {
        permanentMissChance: 0,
        pickupReactionSeconds: 0,
        pickupReactionJitterSeconds: 0,
        bountyActionSeconds: 1 / 30,
        verbSwitchSeconds: 0,
        spatialTravelSecondsPer100Px: 0,
        actionErrorChance: 0,
        bountyAcceptChance: 1,
        rescueDistance: 0,
      },
    });
    const attention = result.summary.attention;
    expect(attention.bountyOffered).toBeGreaterThan(0);
    expect(attention.bountyAccepted).toBeGreaterThan(0);
    expect(attention.bountyCompleted + attention.bountyFailed)
      .toBeLessThanOrEqual(attention.bountyAccepted);
    expect(attention.bountyRewardCollected).toBeLessThanOrEqual(attention.bountyRewardDrops);
  });
});
