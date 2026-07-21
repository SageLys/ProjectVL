import type { ResolvedWavePlan } from '../runStage';

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
export function budgetWaveQuotaFor(plan: ResolvedWavePlan): number {
  return Math.max(0, Math.trunc(plan.quota));
}

export function budgetAdmission(plan: ResolvedWavePlan, spawnLeft: number, alive: number): BudgetAdmission {
  const regular = plan.regular;
  if (!regular) return { normalTarget: 0, effectiveTarget: 0, inEndSprint: false, capacity: 0, deficit: 0, spawnCount: 0 };
  const normalTarget = Math.max(0, regular.targetOnScreen);
  const batchMax = Math.max(1, regular.batchMax);
  const releaseEstimate = Math.ceil(Math.max(0, spawnLeft) / batchMax) * Math.max(0, regular.checkInterval);
  const inEndSprint = regular.waveEndSprint.window > 0 && releaseEstimate <= regular.waveEndSprint.window;
  const effectiveTarget = Math.ceil(normalTarget * (inEndSprint ? regular.waveEndSprint.multiplier : 1));
  const capacity = Math.max(0, regular.maxAlive - alive);
  const deficit = Math.max(0, effectiveTarget - alive);
  return { normalTarget, effectiveTarget, inEndSprint, capacity, deficit,
    spawnCount: Math.min(Math.max(0, spawnLeft), batchMax, capacity, deficit) };
}
