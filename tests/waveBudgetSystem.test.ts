import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { budgetTargetFor, tickSpawns } from '../src/core/systems/waveSystem';
import { constRng, enemy, freshState, resetTestEnv } from './helpers';
import { createDefaultConfig } from '../src/core/createInitialState';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { updateGame } from '../src/core/updateGame';
import { startNextWave } from '../src/core/systems/waveSystem';
import { confirmRewardReceipt } from '../src/core/systems/rewardMeterSystem';
import { computeExperienceMetrics } from '../src/telemetry/metrics';
import type { TelemetryEvent, TelemetrySession } from '../src/telemetry/types';
import { resolveActiveWavePlan } from '../src/core/runStage';

beforeEach(() => {
  resetTestEnv();
  cfg.waves.spawnMode = 'budget';
  cfg.waves.stagePlan.enabled = false;
  cfg.waves.budget.targetOnScreen = { base: 3, perWave: 0 };
  cfg.waves.budget.checkInterval = 1;
  cfg.waves.budget.batchMax = 2;
  cfg.waves.budget.waveEndSprint = { window: 0, multiplier: 2 };
  cfg.waves.budget.maxAlive = 20;
});

describe('waveSystem · budget spawn strategy', () => {
  it('检查时低于目标便补怪，且单批不超过 batchMax', () => {
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 5;
    state.spawnTimer = 0;
    state.enemies = [enemy()];

    tickSpawns(state, constRng(0.5), 0);

    expect(state.enemies).toHaveLength(3);
    expect(state.spawnLeft).toBe(3);
    expect(state.spawnTimer).toBe(1);
  });

  it('默认 budget 配置下 seed=42 波1的 E1 P50 落在 4–8 且贴近目标', () => {
    resetTestEnv();
    cfg.waves.spawnMode = 'budget';
    const state = freshState();
    const runtime = createDefaultConfig();
    const rng = createSeededRng(42);
    const events: TelemetryEvent[] = [{ type: 'waveStart', at: 0, wave: 1 }];
    const samples: TelemetrySession['samples'] = [];
    const knownEnemies = new Set<number>();
    const knownDrops = new Set<number>();
    let knownKills = 0;
    let nextSample = 0;
    startNextWave(state, runtime, rng);

      for (let frame = 0; frame < 60 * 120 && state.wavePhase !== 'between' && state.mode === 'playing'; frame++) {
      const gameEvents = updateGame(state, runtime, rng, 1 / 60);
      for (const enemy of state.enemies) if (!knownEnemies.has(enemy.id)) {
        knownEnemies.add(enemy.id);
        events.push({ type: 'spawn', at: state.time, wave: 1, enemyId: enemy.id });
      }
      while (knownKills < state.kills) {
        knownKills++;
        events.push({ type: 'kill', at: state.time, wave: 1 });
      }
      for (const drop of state.groundDrops) if (!knownDrops.has(drop.id)) {
        knownDrops.add(drop.id);
        events.push({ type: 'dropLanded', at: state.time, wave: 1, dropId: drop.id });
      }
      if (gameEvents.some(event => event.type === 'rewardTriggered')) {
        events.push({ type: 'perkPopup', at: state.time, wave: 1 });
        confirmRewardReceipt(state, runtime, rng);
      }
      if (gameEvents.some(event => event.type === 'waveCleared' || event.type === 'gameEnd')) {
        events.push({ type: 'waveCleared', at: state.time, wave: 1 });
      }
      while (nextSample <= state.time) {
        samples.push({ at: nextSample, wave: 1, enemies: state.enemies.length });
        nextSample += 0.25;
      }
    }

    const session: TelemetrySession = {
      meta: { startedAt: '', exportedAt: '', config: {}, presetName: '', seed: 42, gitCommit: '' },
      events,
      samples,
      inputs: [],
    };
    const wave = computeExperienceMetrics(session).waves[0];
    const target = resolveActiveWavePlan(cfg, 1).regular!.targetOnScreen;
    expect(wave.e1.p50).not.toBeNull();
    expect(Math.abs(wave.e1.p50! - target)).toBeLessThanOrEqual(1);
    expect(Math.max(...samples.map(sample => sample.enemies))).toBeLessThanOrEqual(cfg.waves.budget.maxAlive);
  });

  it('default Budget quota sustains concurrency and differs measurably from interval with the same seed', () => {
    resetTestEnv();
    const runtime = createDefaultConfig();
    const budgetState = freshState();
    cfg.waves.spawnMode = 'budget';
    startNextWave(budgetState, runtime, createSeededRng(42));
    const budgetQuota = budgetState.spawnLeft;
    tickSpawns(budgetState, createSeededRng(42), cfg.waves.firstSpawnDelay);

    const intervalState = freshState();
    cfg.waves.spawnMode = 'interval';
    startNextWave(intervalState, runtime, createSeededRng(42));
    const intervalQuota = intervalState.spawnLeft;
    tickSpawns(intervalState, createSeededRng(42), cfg.waves.firstSpawnDelay);

    expect(budgetQuota).toBe(60);
    expect(intervalQuota).toBe(8);
    expect(budgetState.enemies.length).toBe(6);
    expect(intervalState.enemies.length).toBe(1);
  });

  it('剩余配额进入波末窗口时按 multiplier 提高目标', () => {
    cfg.waves.budget.targetOnScreen = { base: 2, perWave: 0 };
    cfg.waves.budget.waveEndSprint = { window: 1, multiplier: 2 };
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 2;
    state.spawnTimer = 0;
    state.enemies = [enemy(), enemy({ id: 2 })];

    expect(budgetTargetFor(state)).toBe(4);
    tickSpawns(state, constRng(0.5), 0);

    expect(state.enemies).toHaveLength(4);
    expect(state.spawnLeft).toBe(0);
  });

  it('waveEndSprint uses the ceiling of target times multiplier', () => {
    cfg.waves.budget.targetOnScreen = { base: 3, perWave: 0 };
    cfg.waves.budget.batchMax = 5;
    cfg.waves.budget.waveEndSprint = { window: 1, multiplier: 1.5 };
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 1;
    expect(budgetTargetFor(state)).toBe(5);
  });

  it('波末冲刺形成的末 15s 事件密度高于波中（A2 E7 > 1）', () => {
    cfg.waves.budget.targetOnScreen = { base: 1, perWave: 0 };
    cfg.waves.budget.checkInterval = 10;
    cfg.waves.budget.batchMax = 4;
    cfg.waves.budget.waveEndSprint = { window: 10, multiplier: 4 };
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 8;
    state.spawnTimer = 0;
    const events: TelemetryEvent[] = [{ type: 'waveStart', at: 0, wave: 1 }];

    for (const at of [0, 10, 20, 30, 40]) {
      state.enemies.length = 0;
      const before = state.spawnLeft;
      tickSpawns(state, constRng(0.5), at === 0 ? 0 : 10);
      for (let count = state.spawnLeft; count < before; count++) events.push({ type: 'spawn', at, wave: 1 });
    }
    expect(state.spawnLeft).toBe(0);
    events.push({ type: 'waveCleared', at: 50, wave: 1 });
    const session: TelemetrySession = {
      meta: { startedAt: '', exportedAt: '', config: {}, presetName: '', seed: 42, gitCommit: '' },
      events,
      samples: [],
      inputs: [],
    };

    expect(computeExperienceMetrics(session).waves[0].e7).toBeGreaterThan(1);
  });

  it('无论目标和批量多大都不突破 maxAlive 硬上限', () => {
    cfg.waves.budget.targetOnScreen = { base: 30, perWave: 0 };
    cfg.waves.budget.batchMax = 30;
    cfg.waves.budget.maxAlive = 10;
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 30;
    state.spawnTimer = 0;
    state.enemies = Array.from({ length: 9 }, (_, index) => enemy({ id: index + 1 }));

    const samples: number[] = [];
    for (let check = 0; check < 5; check++) {
      tickSpawns(state, constRng(0.5), check === 0 ? 0 : 1);
      samples.push(state.enemies.length);
      state.enemies.splice(0, 2);
    }

    expect(Math.max(...samples)).toBe(10);
    expect(state.spawnLeft).toBe(21);
  });
});
