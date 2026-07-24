import type { RegularStageConfig, RunStage, StageCurve, StagePlanConfig, ValidationRewardSpec, WavesConfig } from './types';

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

function reward(value: ValidationRewardSpec | undefined, path: string, maxStar: number): void {
  if (!value || typeof value !== 'object') fail(`${path} is required`);
  if (value.kind !== 'wildcard' && value.kind !== 'card') fail(`${path}.kind must be wildcard or card`);
  positiveInteger(value.count, `${path}.count`);
  if (!Number.isInteger(value.star)) fail(`${path}.star must be an integer`);
  const limit = value.kind === 'wildcard' ? maxStar - 1 : maxStar;
  if (value.star < 1 || value.star > limit) fail(`${path}.star must be between 1 and ${limit}`);
  if (value.kind === 'card' && !['build', 'pivot', 'uniform', 'focusGod'].includes(value.typePolicy)) {
    fail(`${path}.typePolicy must be build, pivot, uniform, or focusGod`);
  }
}

function waveBossReward(value: WavesConfig['waveBoss']['reward'] | undefined, maxStar: number): void {
  if (!value || typeof value !== 'object') fail('waveBoss.reward is required');
  positiveInteger(value.count, 'waveBoss.reward.count');
  for (const stage of ['selection', 'build', 'validation'] as RunStage[]) {
    const schedule = value.schedule?.[stage];
    if (!Array.isArray(schedule) || schedule.length === 0) fail(`waveBoss.reward.schedule.${stage} must be a non-empty array`);
    for (let index = 0; index < schedule.length; index++) {
      const star = schedule[index];
      if (!Number.isInteger(star) || star < 1 || star >= maxStar) {
        fail(`waveBoss.reward.schedule.${stage}[${index}] must be an integer between 1 and ${maxStar - 1}`);
      }
    }
  }
}

function intermission(value: WavesConfig['intermission'] | undefined): void {
  if (!value || typeof value !== 'object') fail('intermission is required');
  for (const key of ['selection', 'buildEarly', 'buildLate', 'validation'] as const) {
    const seconds = value.freeSeconds?.[key];
    if (!Number.isFinite(seconds) || seconds < 0) fail(`intermission.freeSeconds.${key} must be >= 0`);
  }
  if (!Number.isFinite(value.settleSeconds) || value.settleSeconds < 0) fail('intermission.settleSeconds must be >= 0');
  if (typeof value.autoReadyHighlight !== 'boolean') fail('intermission.autoReadyHighlight must be boolean');
}

export function validateStagePlanConfig(
  plan: StagePlanConfig,
  totalWaves: number,
  maxStar = 6,
  bossReward?: WavesConfig['waveBoss']['reward'],
): void {
  if (!plan || typeof plan !== 'object') fail('stagePlan is required');
  positiveInteger(totalWaves, 'totalWaves');
  positiveInteger(plan.selectionWaves, 'selectionWaves');
  positiveInteger(plan.validationWaves, 'validationWaves');
  if (plan.selectionWaves + plan.validationWaves >= totalWaves) fail('selectionWaves + validationWaves must be < totalWaves');
  regular(plan.selection, 'selection');
  regular(plan.build, 'build');
  if (!Array.isArray(plan.validation) || plan.validation.length < plan.validationWaves) fail('validation must contain at least validationWaves entries');
  positiveInteger(maxStar, 'maxStar');
  for (let waveIndex = 0; waveIndex < plan.validation.length; waveIndex++) {
    const wave = plan.validation[waveIndex];
    if (!wave || !Array.isArray(wave.enemies)) fail(`validation[${waveIndex}].enemies must be an array`);
    for (let enemyIndex = 0; enemyIndex < wave.enemies.length; enemyIndex++) {
      reward(wave.enemies[enemyIndex].reward, `validation[${waveIndex}].enemies[${enemyIndex}].reward`, maxStar);
    }
    reward(wave.bossReward, `validation[${waveIndex}].bossReward`, maxStar);
  }
  if (bossReward) waveBossReward(bossReward, maxStar);
}

export function validateIntermissionConfig(value: WavesConfig['intermission']): void {
  intermission(value);
}
