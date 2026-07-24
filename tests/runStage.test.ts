import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config';
import { validateStagePlanConfig } from '../src/config/stagePlanValidator';
import { resolveWavePlan, stageCurveValue, stageForWave, stageProgress } from '../src/core/runStage';

describe('run stage plan', () => {
  const plan = buildConfig().waves.stagePlan;

  it('resolves the 10-wave boundaries and curves', () => {
    expect([3, 4, 8, 9].map(wave => stageForWave(wave, 10, plan))).toEqual(['selection', 'build', 'build', 'validation']);
    expect([1, 3, 4, 8, 9, 10].map(wave => stageProgress(wave, 10, plan))).toEqual([0, 1, 0, 1, 0, 1]);
    expect(resolveWavePlan(3, 10, plan)).toMatchObject({ stage: 'selection', quota: 75, regular: { targetOnScreen: 10 } });
    expect(resolveWavePlan(4, 10, plan)).toMatchObject({ stage: 'build', quota: 95, regular: { targetOnScreen: 14 } });
    expect(resolveWavePlan(8, 10, plan)).toMatchObject({ stage: 'build', quota: 170, regular: { targetOnScreen: 28 } });
    expect(resolveWavePlan(9, 10, plan)).toMatchObject({ stage: 'validation', quota: 0, validation: plan.validation[0] });
  });

  it('uses 3 recruitment, 5 convergence, and 2 validation waves', () => {
    expect(Array.from({ length: 10 }, (_, index) => stageForWave(index + 1, 10, plan))).toEqual([
      'selection', 'selection', 'selection',
      'build', 'build', 'build', 'build', 'build',
      'validation', 'validation',
    ]);
    expect(stageProgress(4, 10, plan)).toBe(0);
    expect(stageProgress(8, 10, plan)).toBe(1);
    expect(resolveWavePlan(9, 10, plan).validation).toEqual(plan.validation[0]);
    expect(resolveWavePlan(10, 10, plan).validation).toEqual(plan.validation[1]);
  });

  it('uses the end value for a one-wave stage and rejects an empty build stage', () => {
    const oneWavePlan = structuredClone(plan);
    oneWavePlan.selectionWaves = 1;
    expect(stageProgress(1, 10, oneWavePlan)).toBe(1);
    expect(stageCurveValue({ start: 2, end: 8, power: 2 }, 1)).toBe(8);
    expect(() => validateStagePlanConfig(plan, 4)).toThrow(/stage-plan-config/);
  });

  it('rejects unusable validation rewards and invalid Boss schedules', () => {
    const config = buildConfig();
    const invalidWildcard = structuredClone(config.waves.stagePlan);
    invalidWildcard.validation[0].bossReward = { kind: 'wildcard', star: 6, count: 1 };
    expect(() => validateStagePlanConfig(invalidWildcard, 10, 6, config.waves.waveBoss.reward)).toThrow(/between 1 and 5/);

    const invalidCard = structuredClone(config.waves.stagePlan);
    invalidCard.validation[0].enemies[0].reward = { kind: 'card', star: 7, count: 1, typePolicy: 'build' };
    expect(() => validateStagePlanConfig(invalidCard, 10, 6, config.waves.waveBoss.reward)).toThrow(/between 1 and 6/);

    const invalidSchedule = structuredClone(config.waves.waveBoss.reward);
    invalidSchedule.schedule.build = [];
    expect(() => validateStagePlanConfig(config.waves.stagePlan, 10, 6, invalidSchedule)).toThrow(/non-empty array/);
  });
});
