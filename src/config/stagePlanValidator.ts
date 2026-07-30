import type {
  RegularStageConfig, RunStage, StageCurve, StagePlanConfig, ValidationCompositionConfig,
  ValidationEnemySpec, ValidationRewardSpec, WavesConfig,
} from './types';

function fail(message: string): never { throw new Error(`[stage-plan-config] ${message}`); }
function positiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 1) fail(`${path} must be a positive integer`);
}
function curve(value: StageCurve | undefined, path: string): void {
  if (!value || ![value.start, value.end, value.power].every(Number.isFinite)) fail(`${path} must contain finite values`);
  if (value.start < 0 || value.end < 0 || value.power <= 0) fail(`${path} start/end must be >= 0 and power must be > 0`);
}
function sprint(value: { window: number; multiplier: number } | undefined, path: string): void {
  if (!value || !Number.isFinite(value.window) || value.window < 0) fail(`${path}.window must be >= 0`);
  if (!Number.isFinite(value.multiplier) || value.multiplier < 1) fail(`${path}.multiplier must be >= 1`);
}
function regular(value: RegularStageConfig | undefined, path: string): void {
  if (!value) fail(`${path} is required`);
  curve(value.waveQuota, `${path}.waveQuota`);
  curve(value.targetOnScreen, `${path}.targetOnScreen`);
  if (!Number.isFinite(value.checkInterval) || value.checkInterval <= 0) fail(`${path}.checkInterval must be > 0`);
  positiveInteger(value.batchMax, `${path}.batchMax`);
  positiveInteger(value.maxAlive, `${path}.maxAlive`);
  sprint(value.waveEndSprint, `${path}.waveEndSprint`);
}
function positiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) fail(`${path} must be > 0`);
}
function composition(value: ValidationCompositionConfig | undefined, path: string): void {
  if (!value || ![value.normal, value.fast, value.tank].every(Number.isFinite)) fail(`${path} must contain finite values`);
  if (value.normal < 0 || value.fast < 0 || value.tank < 0) fail(`${path} weights must be >= 0`);
  if (value.normal + value.fast + value.tank <= 0) fail(`${path} total weight must be > 0`);
}
function enemy(value: ValidationEnemySpec | undefined, path: string): void {
  if (!value || !['normal', 'fast', 'tank'].includes(value.type)) fail(`${path}.type must be normal, fast, or tank`);
  positiveFinite(value.hpMul, `${path}.hpMul`);
  positiveFinite(value.damageMul, `${path}.damageMul`);
  positiveFinite(value.speedMul, `${path}.speedMul`);
  for (const key of ['ccResistOverride', 'knockbackResistOverride'] as const) {
    const override = value[key];
    if (override !== undefined && (!Number.isFinite(override) || override < 0 || override > 1)) {
      fail(`${path}.${key} must be between 0 and 1`);
    }
  }
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
  if (typeof plan.enabled !== 'boolean') fail('enabled must be boolean');
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
    const path = `validation[${waveIndex}]`;
    if (!wave?.swarm) fail(`${path}.swarm is required`);
    const swarm = wave.swarm;
    if (!Number.isInteger(swarm.quota) || swarm.quota < 0) fail(`${path}.swarm.quota must be an integer >= 0`);
    if (!Number.isFinite(swarm.targetOnScreen) || swarm.targetOnScreen < 0) fail(`${path}.swarm.targetOnScreen must be >= 0`);
    positiveInteger(swarm.batchMax, `${path}.swarm.batchMax`);
    positiveInteger(swarm.maxAlive, `${path}.swarm.maxAlive`);
    if (swarm.targetOnScreen > swarm.maxAlive) fail(`${path}.swarm.targetOnScreen must be <= maxAlive`);
    positiveFinite(swarm.checkInterval, `${path}.swarm.checkInterval`);
    sprint(swarm.waveEndSprint, `${path}.swarm.waveEndSprint`);
    for (const key of ['hpMul', 'damageMul', 'speedMul'] as const) {
      positiveFinite(swarm[key], `${path}.swarm.${key}`);
      if (swarm[key] < 1) fail(`${path}.swarm.${key}: 验证波杂兵倍率不得低于 1，压力应来自数量而非削弱`);
    }
    composition(swarm.composition, `${path}.swarm.composition`);
    if (!Array.isArray(wave.elites)) fail(`${path}.elites must be an array`);
    const progress = new Set<number>();
    for (let eliteIndex = 0; eliteIndex < wave.elites.length; eliteIndex++) {
      const elite = wave.elites[eliteIndex];
      const elitePath = `${path}.elites[${eliteIndex}]`;
      enemy(elite, elitePath);
      if (!Number.isFinite(elite.spawnAtProgress) || elite.spawnAtProgress < 0 || elite.spawnAtProgress >= 1) {
        fail(`${elitePath}.spawnAtProgress must be in [0, 1)`);
      }
      if (progress.has(elite.spawnAtProgress)) fail(`${elitePath}.spawnAtProgress must be unique within the wave`);
      progress.add(elite.spawnAtProgress);
      if (elite.reward !== undefined) reward(elite.reward, `${elitePath}.reward`, maxStar);
    }
    if (wave.bossEscort !== undefined) {
      const escort = wave.bossEscort;
      positiveFinite(escort.intervalSeconds, `${path}.bossEscort.intervalSeconds`);
      positiveInteger(escort.count, `${path}.bossEscort.count`);
      positiveInteger(escort.maxAlive, `${path}.bossEscort.maxAlive`);
      positiveFinite(escort.hpMul, `${path}.bossEscort.hpMul`);
      positiveFinite(escort.damageMul, `${path}.bossEscort.damageMul`);
      positiveFinite(escort.speedMul, `${path}.bossEscort.speedMul`);
      composition(escort.composition, `${path}.bossEscort.composition`);
    }
    reward(wave.bossReward, `${path}.bossReward`, maxStar);
  }
  if (bossReward) waveBossReward(bossReward, maxStar);
}

export function validateIntermissionConfig(value: WavesConfig['intermission']): void {
  intermission(value);
}
