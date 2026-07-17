import type { GameConfig } from '../config';
import { budgetAdmission, budgetWaveQuotaFor } from '../core/systems/budgetRules';
import type { Config, EnemyType } from '../core/types';
import type { DifficultyId } from '../config/types';
import { difficultyMultipliersFor } from '../core/difficulty';

const TYPES: EnemyType[] = ['normal', 'fast', 'tank', 'boss'];
export interface DerivedCell { hitRate: number; ttk: number; entryWalk: number; insideWalk: number; killDepth: number; onScreen: number; }
export interface BudgetProjection { normalTarget: number; sprintTarget: number; averageOnScreen: number; peakOnScreen: number; sprintTriggered: boolean; }
export interface DerivedMetrics {
  cells: Record<EnemyType, DerivedCell[]>;
  waveDurations: number[];
  totalDuration: number;
  dropsPerMinute: number;
  expectedDrops: number;
  budget?: {
    waveDurations: number[];
    totalDuration: number;
    normalOnScreen: number[];
    sprintOnScreen: number[];
    sprintQuotaThreshold: number[];
    projections: BudgetProjection[];
  };
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
export function simulateBudgetWave(game: GameConfig, runtime: Config, wave: number, distance: number, difficultyId: DifficultyId = 'hell'): { duration: number; projection: BudgetProjection } {
  let now = game.waves.firstSpawnDelay; let left = budgetWaveQuotaFor(wave, game.waves.budget);
  const leaveAt: number[] = []; let area = 0; let peak = 0; let sprintTriggered = false;
  const lifetime = (type: EnemyType) => { const c = cell(game, runtime, type, wave, distance, difficultyId); return c.entryWalk + c.ttk; };
  const checkInterval = Math.max(.0001, game.waves.budget.checkInterval);
  // Checks are discrete, exactly like runtime; deaths between checks only create a deficit at the next check.
  while (left > 0) {
    leaveAt.sort((a, b) => a - b);
    while (leaveAt.length && leaveAt[0] <= now + 1e-9) leaveAt.shift();
    const admission = budgetAdmission(wave, left, leaveAt.length, game.waves.budget);
    sprintTriggered ||= admission.inEndSprint;
    for (let i = 0; i < admission.spawnCount; i++) {
      leaveAt.push(now + lifetime('normal')); left--;
    }
    peak = Math.max(peak, leaveAt.length);
    area += leaveAt.length * checkInterval;
    now += checkInterval;
  }
  const duration = Math.max(now - checkInterval, ...leaveAt);
  const normal = budgetAdmission(wave, budgetWaveQuotaFor(wave, game.waves.budget), 0, game.waves.budget).normalTarget;
  const sprint = Math.ceil(normal * game.waves.budget.waveEndSprint.multiplier);
  return { duration, projection: { normalTarget: Math.min(game.waves.budget.maxAlive, normal), sprintTarget: Math.min(game.waves.budget.maxAlive, sprint), averageOnScreen: duration ? area / duration : 0, peakOnScreen: peak, sprintTriggered } };
}

export function deriveMetrics(game: GameConfig, runtime: Config, difficultyId: DifficultyId = 'hell'): DerivedMetrics {
  const distance = spawnDistance(game); const cells = {} as Record<EnemyType, DerivedCell[]>;
  for (const type of TYPES) cells[type] = [1, 2, 3].map(wave => {
    const result = cell(game, runtime, type, wave, distance, difficultyId);
    const interval = Math.max(game.waves.spawnInterval.min, game.waves.spawnInterval.base - wave * game.waves.spawnInterval.perWave);
    result.onScreen = game.waves.spawnMode === 'budget' ? Math.min(game.waves.budget.maxAlive, game.waves.budget.targetOnScreen.base + wave * game.waves.budget.targetOnScreen.perWave) : (result.entryWalk + result.ttk) / Math.max(.0001, interval);
    return result;
  });
  // Always compute both models. The active mode still selects the legacy top-level
  // metrics, while the tuner can show a live Budget projection before switching.
  const projections = Array.from({ length: game.waves.totalWaves }, (_, i) => simulateBudgetWave(game, runtime, i + 1, distance, difficultyId));
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
  const totalDuration = waveDurations.reduce((sum, seconds) => sum + seconds, 0) + Math.max(0, game.waves.totalWaves - 1) * game.waves.betweenWaves;
  const budgetTotalDuration = budgetWaveDurations.reduce((sum, seconds) => sum + seconds, 0) + Math.max(0, game.waves.totalWaves - 1) * game.waves.betweenWaves;
  const totalEnemies = waveDurations.reduce((sum, _, i) => sum + (game.waves.spawnMode === 'budget'
    ? budgetWaveQuotaFor(i + 1, game.waves.budget)
    : game.waves.enemyCountBase + (i + 1) * game.waves.enemyCountPerWave), 0);
  const expectedDrops = totalEnemies * runtime.dropChance;
  const budget = projections.map(item => item.projection);
  return { cells, waveDurations, totalDuration, expectedDrops, dropsPerMinute: totalDuration ? expectedDrops / totalDuration * 60 : 0,
    budget: {
      waveDurations: budgetWaveDurations,
      totalDuration: budgetTotalDuration,
      normalOnScreen: budget.slice(0, 3).map(item => item.normalTarget),
      sprintOnScreen: budget.slice(0, 3).map(item => item.sprintTarget),
      sprintQuotaThreshold: [1, 2, 3].map(wave => Math.min(budgetWaveQuotaFor(wave, game.waves.budget), Math.floor(game.waves.budget.waveEndSprint.window / Math.max(.0001, game.waves.budget.checkInterval)) * Math.max(1, game.waves.budget.batchMax))),
      projections: budget,
    } };
}
