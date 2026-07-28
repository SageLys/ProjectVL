import type { RegularStageConfig, RunStage, StageCurve, StagePlanConfig, ValidationWaveConfig } from '../config/types';
import type { GameConfig } from '../config/types';

export function stageForWave(wave: number, totalWaves: number, plan: StagePlanConfig): RunStage {
  if (wave <= plan.selectionWaves) return 'selection';
  if (wave > totalWaves - plan.validationWaves) return 'validation';
  return 'build';
}

export function stageProgress(wave: number, totalWaves: number, plan: StagePlanConfig): number {
  const stage = stageForWave(wave, totalWaves, plan);
  const start = stage === 'selection' ? 1 : stage === 'build' ? plan.selectionWaves + 1 : totalWaves - plan.validationWaves + 1;
  const end = stage === 'selection' ? plan.selectionWaves : stage === 'build' ? totalWaves - plan.validationWaves : totalWaves;
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (wave - start) / (end - start)));
}

export function stageCurveValue(curve: StageCurve, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return curve.start + (curve.end - curve.start) * t ** curve.power;
}

export interface ResolvedRegularStageConfig {
  targetOnScreen: number;
  checkInterval: RegularStageConfig['checkInterval'];
  batchMax: RegularStageConfig['batchMax'];
  maxAlive: RegularStageConfig['maxAlive'];
  waveEndSprint: RegularStageConfig['waveEndSprint'];
}

export interface ResolvedWavePlan {
  stage: RunStage;
  quota: number;
  regular?: ResolvedRegularStageConfig;
  validation?: ValidationWaveConfig;
}

export function resolveWavePlan(wave: number, totalWaves: number, plan: StagePlanConfig): ResolvedWavePlan {
  const stage = stageForWave(wave, totalWaves, plan);
  if (stage === 'validation') {
    const validationIndex = wave - (totalWaves - plan.validationWaves + 1);
    return { stage, quota: 0, validation: plan.validation[validationIndex] };
  }
  const config = stage === 'selection' ? plan.selection : plan.build;
  const progress = stageProgress(wave, totalWaves, plan);
  return {
    stage,
    quota: Math.max(0, Math.trunc(stageCurveValue(config.waveQuota, progress))),
    regular: {
      targetOnScreen: stageCurveValue(config.targetOnScreen, progress),
      checkInterval: config.checkInterval,
      batchMax: config.batchMax,
      maxAlive: config.maxAlive,
      waveEndSprint: { ...config.waveEndSprint },
    },
  };
}

/** Resolves the stage director, or the untouched legacy linear Budget when the rollback switch is off. */
export function resolveActiveWavePlan(game: GameConfig, wave: number): ResolvedWavePlan {
  if (game.waves.stagePlan.enabled) return resolveWavePlan(wave, game.waves.totalWaves, game.waves.stagePlan);
  const legacy = game.waves.budget;
  return {
    stage: stageForWave(wave, game.waves.totalWaves, game.waves.stagePlan),
    quota: Math.max(0, Math.trunc(legacy.waveQuota.base + wave * legacy.waveQuota.perWave)),
    regular: {
      targetOnScreen: Math.max(0, legacy.targetOnScreen.base + wave * legacy.targetOnScreen.perWave),
      checkInterval: legacy.checkInterval,
      batchMax: legacy.batchMax,
      maxAlive: legacy.maxAlive,
      waveEndSprint: { ...legacy.waveEndSprint },
    },
  };
}
