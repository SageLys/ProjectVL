import type { RegularStageConfig, StageCurve, StagePlanConfig } from './types';

function fail(message: string): never { throw new Error(`[stage-plan-config] ${message}`); }
function positiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 1) fail(`${path} must be a positive integer`);
}
function curve(value: StageCurve | undefined, path: string): void {
  if (!value || ![value.start, value.end, value.power].every(Number.isFinite)) fail(`${path} must contain finite values`);
  if (value.start < 0 || value.end < 0 || value.power <= 0) fail(`${path} start/end must be >= 0 and power must be > 0`);
}
function regular(value: RegularStageConfig | undefined, path: string): void {
  if (!value) fail(`${path} is required`);
  curve(value.waveQuota, `${path}.waveQuota`);
  curve(value.targetOnScreen, `${path}.targetOnScreen`);
  if (!Number.isFinite(value.checkInterval) || value.checkInterval <= 0) fail(`${path}.checkInterval must be > 0`);
  positiveInteger(value.batchMax, `${path}.batchMax`);
  positiveInteger(value.maxAlive, `${path}.maxAlive`);
  if (!Number.isFinite(value.waveEndSprint.window) || value.waveEndSprint.window < 0) fail(`${path}.waveEndSprint.window must be >= 0`);
  if (!Number.isFinite(value.waveEndSprint.multiplier) || value.waveEndSprint.multiplier < 1) fail(`${path}.waveEndSprint.multiplier must be >= 1`);
}

export function validateStagePlanConfig(plan: StagePlanConfig, totalWaves: number): void {
  if (!plan || typeof plan !== 'object') fail('stagePlan is required');
  positiveInteger(totalWaves, 'totalWaves');
  positiveInteger(plan.selectionWaves, 'selectionWaves');
  positiveInteger(plan.validationWaves, 'validationWaves');
  if (plan.selectionWaves + plan.validationWaves >= totalWaves) fail('selectionWaves + validationWaves must be < totalWaves');
  regular(plan.selection, 'selection');
  regular(plan.build, 'build');
  if (!Array.isArray(plan.validation) || plan.validation.length < plan.validationWaves) fail('validation must contain at least validationWaves entries');
}
