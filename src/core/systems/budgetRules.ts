import type { WavesConfig } from '../../config/types';

/**
 * Pure Budget admission rule shared by the game and the tuner projection.
 * `waveEndSprint.window` is a *quota-release estimate*: sprint starts when the
 * remaining quota can be admitted in at most this many seconds if every future
 * check admits a full batch.  It deliberately is not a prediction of wall-clock
 * wave time (kills and a full screen can delay admissions).  A zero window
 * disables sprint.
 */
export interface BudgetAdmission {
  normalTarget: number;
  effectiveTarget: number;
  inEndSprint: boolean;
  capacity: number;
  deficit: number;
  spawnCount: number;
}

/** Budget has its own wave quota so interval's tuned enemy counts remain untouched. */
export function budgetWaveQuotaFor(wave: number, budget: WavesConfig['budget']): number {
  return Math.max(0, Math.trunc(budget.waveQuota.base + wave * budget.waveQuota.perWave));
}

export function budgetAdmission(wave: number, spawnLeft: number, alive: number, budget: WavesConfig['budget']): BudgetAdmission {
  const normalTarget = Math.max(0, budget.targetOnScreen.base + wave * budget.targetOnScreen.perWave);
  const batchMax = Math.max(1, budget.batchMax);
  const releaseEstimate = Math.ceil(Math.max(0, spawnLeft) / batchMax) * Math.max(0, budget.checkInterval);
  const inEndSprint = budget.waveEndSprint.window > 0 && releaseEstimate <= budget.waveEndSprint.window;
  const effectiveTarget = Math.ceil(normalTarget * (inEndSprint ? budget.waveEndSprint.multiplier : 1));
  const capacity = Math.max(0, budget.maxAlive - alive);
  const deficit = Math.max(0, effectiveTarget - alive);
  return { normalTarget, effectiveTarget, inEndSprint, capacity, deficit,
    spawnCount: Math.min(Math.max(0, spawnLeft), batchMax, capacity, deficit) };
}
