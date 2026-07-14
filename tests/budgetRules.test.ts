import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config';
import { budgetAdmission } from '../src/core/systems/budgetRules';

describe('Budget shared admission rule', () => {
  const budget = buildConfig([]).waves.budget;

  it('fills the initial deficit, honours batch and hard caps, then stops at target', () => {
    const tuned = { ...budget, targetOnScreen: { base: 4, perWave: 0 }, checkInterval: .5, batchMax: 4, maxAlive: 4, waveEndSprint: { window: 0, multiplier: 2 } };
    expect(budgetAdmission(1, 20, 0, tuned)).toMatchObject({ normalTarget: 4, effectiveTarget: 4, capacity: 4, deficit: 4, spawnCount: 4 });
    expect(budgetAdmission(1, 16, 4, tuned).spawnCount).toBe(0);
    expect(budgetAdmission(1, 16, 2, tuned).spawnCount).toBe(2);
  });

  it('defines sprint as quota-release estimate and makes window zero a true off switch', () => {
    const tuned = { ...budget, targetOnScreen: { base: 2, perWave: 0 }, checkInterval: 1, batchMax: 3, maxAlive: 10, waveEndSprint: { window: 1, multiplier: 2 } };
    expect(budgetAdmission(1, 4, 0, tuned)).toMatchObject({ inEndSprint: false, effectiveTarget: 2 });
    expect(budgetAdmission(1, 3, 0, tuned)).toMatchObject({ inEndSprint: true, effectiveTarget: 4 });
    expect(budgetAdmission(1, 1, 0, { ...tuned, waveEndSprint: { window: 0, multiplier: 4 } }).inEndSprint).toBe(false);
  });
});
