import type { GameConfig } from '../config';
import { budgetAdmission, budgetWaveQuotaFor } from '../core/systems/budgetRules';
import type { Config, EnemyType } from '../core/types';
import type { DifficultyId, RunStage } from '../config/types';
import { difficultyMultipliersFor } from '../core/difficulty';
import { resolveActiveWavePlan, stageForWave } from '../core/runStage';
import type { ResolvedWavePlan } from '../core/runStage';

const TYPES: EnemyType[] = ['normal', 'fast', 'tank', 'boss'];

function intermissionSecondsFor(game: GameConfig, afterWave: number): number {
  const stage = stageForWave(afterWave, game.waves.totalWaves, game.waves.stagePlan);
  const free = stage === 'selection'
    ? game.waves.intermission.freeSeconds.selection
    : stage === 'validation'
      ? game.waves.intermission.freeSeconds.validation
      : afterWave <= game.waves.stagePlan.selectionWaves + 3
        ? game.waves.intermission.freeSeconds.buildEarly
        : game.waves.intermission.freeSeconds.buildLate;
  return game.waves.intermission.settleSeconds + free;
}
export interface DerivedCell { hitRate: number; ttk: number; entryWalk: number; insideWalk: number; killDepth: number; onScreen: number; }
export interface BudgetProjection {
  normalTarget: number;
  sprintTarget: number;
  averageOnScreen: number;
  peakOnScreen: number;
  sprintTriggered: boolean;
  validationEncounter?: { enemyCount: number; estimatedTtk: number };
}
export interface DerivedWaveProjection {
  wave: number;
  stage: RunStage;
  ordinaryDropsTargetPerMinute: number;
  projectedOnScreenP50: number;
  projectedOnScreenP95: number;
  validationEncounter?: { enemyCount: number; estimatedTtk: number };
}
export interface DerivedMetrics {
  cells: Record<EnemyType, DerivedCell[]>;
  waveDurations: number[];
  totalDuration: number;
  dropsPerMinute: number;
  expectedDrops: number;
  waves: DerivedWaveProjection[];
  budget?: {
    waveDurations: number[];
    totalDuration: number;
    normalOnScreen: number[];
    sprintOnScreen: number[];
    sprintQuotaThreshold: number[];
    projections: BudgetProjection[];
  };
}

/**
 * Static projection intentionally ignores carryCap (short-term burst smoothing) and
 * dropRateMul (a dynamic in-run modifier that cannot be known by the tuner).
 */
function expectedTimeBasedDrops(game: GameConfig, waveDurations: readonly number[]): number {
  const rate = game.economy.ordinaryDropRate;
  let buildStageSeconds = 0;
  let expected = 0;
  for (let index = 0; index < waveDurations.length; index++) {
    const duration = waveDurations[index];
    const stage = stageForWave(index + 1, game.waves.totalWaves, game.waves.stagePlan);
    if (stage === 'validation') continue;
    if (stage === 'selection') {
      expected += rate.selectionPerMinute / 60 * duration;
      continue;
    }
    if (rate.buildTransitionSeconds <= 0) {
      expected += rate.buildPerMinute / 60 * duration;
    } else {
      const transitionStart = Math.min(rate.buildTransitionSeconds, buildStageSeconds);
      const transitionEnd = Math.min(rate.buildTransitionSeconds, buildStageSeconds + duration);
      const transitionDuration = Math.max(0, transitionEnd - transitionStart);
      const transitionArea = rate.selectionPerMinute * transitionDuration
        + (rate.buildPerMinute - rate.selectionPerMinute)
          * (transitionEnd ** 2 - transitionStart ** 2)
          / (2 * rate.buildTransitionSeconds);
      expected += (transitionArea + rate.buildPerMinute * (duration - transitionDuration)) / 60;
    }
    buildStageSeconds += duration;
  }
  return expected;
}

function spawnDistance(game: GameConfig): number {
  const { width, height } = game.combat.canvas; const { x, y } = game.combat.turret; const m = game.waves.spawnMargin;
  return [[width / 2, -m], [width + m, height / 2], [width / 2, height + m], [-m, height / 2]]
    .reduce((sum, [px, py]) => sum + Math.hypot(px - x, py - y), 0) / 4;
}

function cell(game: GameConfig, runtime: Config, type: EnemyType, wave: number, distance: number, difficultyId: DifficultyId): DerivedCell {
  const def = game.enemies.types[type]; const dm = difficultyMultipliersFor(difficultyId, type, wave);
  const hp = (def.hpBase + wave * def.hpPerWave) * dm.hp;
  const speed = (def.speedBase + wave * def.speedPerWave) * dm.speed * runtime.enemySpeed;
  const spreadWidth = runtime.range * Math.tan(game.combat.bullet.spread);
  const hitRate = spreadWidth <= 0 ? 1 : Math.min(1, def.r / spreadWidth);
  const ttk = hp / Math.max(.0001, runtime.damage * runtime.fireRate * hitRate);
  const entryWalk = Math.max(0, distance - runtime.range) / Math.max(.0001, speed);
  const breachWalk = Math.max(0, runtime.range - game.combat.breakthroughDist) / Math.max(.0001, speed);
  return { hitRate, ttk, entryWalk, insideWalk: Math.min(ttk, breachWalk), killDepth: runtime.range - speed * ttk, onScreen: 0 };
}

/** Deterministic, side-effect-free event estimate.  Enemies leave after entry walk + expected DPS TTK; this intentionally excludes skills, drops and player input. */
export function simulateBudgetWave(game: GameConfig, runtime: Config, wave: number, plan: ResolvedWavePlan, distance: number, difficultyId: DifficultyId = 'hell'): { duration: number; projection: BudgetProjection } {
  if (!plan.regular) {
    const enemies = plan.validation?.enemies ?? [];
    const estimatedTtk = enemies.reduce((sum, enemy) => sum + cell(game, runtime, enemy.type, wave, distance, difficultyId).ttk * enemy.hpMul, 0);
    return {
      duration: estimatedTtk,
      projection: {
        normalTarget: 0, sprintTarget: 0, averageOnScreen: enemies.length, peakOnScreen: enemies.length,
        sprintTriggered: false, validationEncounter: { enemyCount: enemies.length, estimatedTtk },
      },
    };
  }
  let now = game.waves.firstSpawnDelay; let left = budgetWaveQuotaFor(plan);
  const leaveAt: number[] = []; let area = 0; let peak = 0; let sprintTriggered = false;
  const lifetime = (type: EnemyType) => { const c = cell(game, runtime, type, wave, distance, difficultyId); return c.entryWalk + c.ttk; };
  const checkInterval = Math.max(.0001, plan.regular.checkInterval);
  // Checks are discrete, exactly like runtime; deaths between checks only create a deficit at the next check.
  while (left > 0) {
    leaveAt.sort((a, b) => a - b);
    while (leaveAt.length && leaveAt[0] <= now + 1e-9) leaveAt.shift();
    const admission = budgetAdmission(plan, left, leaveAt.length);
    sprintTriggered ||= admission.inEndSprint;
    for (let i = 0; i < admission.spawnCount; i++) {
      leaveAt.push(now + lifetime('normal')); left--;
    }
    peak = Math.max(peak, leaveAt.length);
    area += leaveAt.length * checkInterval;
    now += checkInterval;
  }
  const duration = Math.max(now - checkInterval, ...leaveAt);
  const normal = budgetAdmission(plan, budgetWaveQuotaFor(plan), 0).normalTarget;
  const sprint = Math.ceil(normal * plan.regular.waveEndSprint.multiplier);
  return { duration, projection: { normalTarget: Math.min(plan.regular.maxAlive, normal), sprintTarget: Math.min(plan.regular.maxAlive, sprint), averageOnScreen: duration ? area / duration : 0, peakOnScreen: peak, sprintTriggered } };
}

export function deriveMetrics(game: GameConfig, runtime: Config, difficultyId: DifficultyId = 'hell'): DerivedMetrics {
  const distance = spawnDistance(game); const cells = {} as Record<EnemyType, DerivedCell[]>;
  for (const type of TYPES) cells[type] = [1, 2, 3].map(wave => {
    const result = cell(game, runtime, type, wave, distance, difficultyId);
    const interval = Math.max(game.waves.spawnInterval.min, game.waves.spawnInterval.base - wave * game.waves.spawnInterval.perWave);
    const plan = resolveActiveWavePlan(game, wave);
    result.onScreen = game.waves.spawnMode === 'budget' ? Math.min(plan.regular?.maxAlive ?? 0, plan.regular?.targetOnScreen ?? 0) : (result.entryWalk + result.ttk) / Math.max(.0001, interval);
    return result;
  });
  // Always compute both models. The active mode still selects the legacy top-level
  // metrics, while the tuner can show a live Budget projection before switching.
  const plans = Array.from({ length: game.waves.totalWaves }, (_, i) => resolveActiveWavePlan(game, i + 1));
  const projections = plans.map((plan, i) => simulateBudgetWave(game, runtime, i + 1, plan, distance, difficultyId));
  const intervalWaveDurations = Array.from({ length: game.waves.totalWaves }, (_, i) => {
    const wave = i + 1; const count = game.waves.enemyCountBase + wave * game.waves.enemyCountPerWave;
    const interval = Math.max(game.waves.spawnInterval.min, game.waves.spawnInterval.base - wave * game.waves.spawnInterval.perWave);
    const regularTypes = TYPES.filter(type => type !== 'boss');
    const regularDuration = game.waves.firstSpawnDelay + Math.max(0, count - 1) * interval + Math.max(...regularTypes.map(type => { const c = cell(game, runtime, type, wave, distance, difficultyId); return c.entryWalk + c.ttk; }));
    const bossDuration = game.waves.bossWaves.includes(wave) ? (() => { const c = cell(game, runtime, 'boss', wave, distance, difficultyId); return c.entryWalk + c.ttk; })() : 0;
    return regularDuration + bossDuration;
  });
  const budgetWaveDurations = projections.map((item, index) => {
    const wave = index + 1;
    if (!game.waves.bossWaves.includes(wave)) return item.duration;
    const boss = cell(game, runtime, 'boss', wave, distance, difficultyId);
    return item.duration + boss.entryWalk + boss.ttk;
  });
  const waveDurations = game.waves.spawnMode === 'budget' ? budgetWaveDurations : intervalWaveDurations;
  const intermissionDuration = Array.from(
    { length: Math.max(0, game.waves.totalWaves - 1) },
    (_, index) => intermissionSecondsFor(game, index + 1),
  ).reduce((sum, seconds) => sum + seconds, 0);
  const totalDuration = waveDurations.reduce((sum, seconds) => sum + seconds, 0) + intermissionDuration;
  const budgetTotalDuration = budgetWaveDurations.reduce((sum, seconds) => sum + seconds, 0) + intermissionDuration;
  const totalEnemies = waveDurations.reduce((sum, _, i) => sum + (game.waves.spawnMode === 'budget'
    ? budgetWaveQuotaFor(plans[i])
    : game.waves.enemyCountBase + (i + 1) * game.waves.enemyCountPerWave), 0);
  const expectedDrops = game.economy.ordinaryDropRate.enabled
    ? expectedTimeBasedDrops(game, waveDurations)
    : totalEnemies * runtime.dropChance;
  const budget = projections.map(item => item.projection);
  const waveProjections: DerivedWaveProjection[] = plans.map((plan, index) => ({
    wave: index + 1,
    stage: plan.stage,
    ordinaryDropsTargetPerMinute: plan.stage === 'selection'
      ? game.economy.ordinaryDropRate.selectionPerMinute
      : plan.stage === 'build' ? game.economy.ordinaryDropRate.buildPerMinute : 0,
    projectedOnScreenP50: budget[index].averageOnScreen,
    projectedOnScreenP95: budget[index].peakOnScreen,
    ...(budget[index].validationEncounter ? { validationEncounter: budget[index].validationEncounter } : {}),
  }));
  return { cells, waveDurations, totalDuration, expectedDrops, dropsPerMinute: totalDuration ? expectedDrops / totalDuration * 60 : 0, waves: waveProjections,
    budget: {
      waveDurations: budgetWaveDurations,
      totalDuration: budgetTotalDuration,
      normalOnScreen: budget.slice(0, 3).map(item => item.normalTarget),
      sprintOnScreen: budget.slice(0, 3).map(item => item.sprintTarget),
      sprintQuotaThreshold: plans.slice(0, 3).map(plan => Math.min(budgetWaveQuotaFor(plan), Math.floor((plan.regular?.waveEndSprint.window ?? 0) / Math.max(.0001, plan.regular?.checkInterval ?? 1)) * Math.max(1, plan.regular?.batchMax ?? 1))),
      projections: budget,
    } };
}
