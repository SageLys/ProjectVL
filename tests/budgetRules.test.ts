import { describe, expect, it } from 'vitest';
import { budgetAdmission } from '../src/core/systems/budgetRules';
import type { ResolvedWavePlan } from '../src/core/runStage';

describe('Budget shared admission rule', () => {
  function plan(overrides: Partial<NonNullable<ResolvedWavePlan['regular']>> = {}): ResolvedWavePlan {
    return { stage: 'selection', quota: 20, regular: { targetOnScreen: 4, checkInterval: .5, batchMax: 4, maxAlive: 4, waveEndSprint: { window: 0, multiplier: 2 }, ...overrides } };
  }

  it('fills the initial deficit, honours batch and hard caps, then stops at target', () => {
    const tuned = plan();
    expect(budgetAdmission(tuned, 20, 0)).toMatchObject({ normalTarget: 4, effectiveTarget: 4, capacity: 4, deficit: 4, spawnCount: 4 });
    expect(budgetAdmission(tuned, 16, 4).spawnCount).toBe(0);
    expect(budgetAdmission(tuned, 16, 2).spawnCount).toBe(2);
  });

  it('defines sprint as quota-release estimate and makes window zero a true off switch', () => {
    const tuned = plan({ targetOnScreen: 2, checkInterval: 1, batchMax: 3, maxAlive: 10, waveEndSprint: { window: 1, multiplier: 2 } });
    expect(budgetAdmission(tuned, 4, 0)).toMatchObject({ inEndSprint: false, effectiveTarget: 2 });
    expect(budgetAdmission(tuned, 3, 0)).toMatchObject({ inEndSprint: true, effectiveTarget: 4 });
    expect(budgetAdmission(plan({ ...tuned.regular!, waveEndSprint: { window: 0, multiplier: 4 } }), 1, 0).inEndSprint).toBe(false);
  });
});
