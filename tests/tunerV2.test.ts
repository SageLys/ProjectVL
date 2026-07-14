import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { jumpToWave, tickSpawns } from '../src/core/systems/waveSystem';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { deriveMetrics } from '../src/ui/derivedMetrics';
import { BUDGET_TUNER_PARAMS, TUNER_PARAMS } from '../src/ui/tunerSchema';
import { freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('调参面板 v2 · 参数与派生指标', () => {
  it('§2 A/B/C/D 每个暴露参数都在 tuner.json 有 min/max/step', () => {
    expect(TUNER_PARAMS.length).toBe(60);
    for (const param of TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
    }
  });

  it('TTK、击杀深度与同屏数和手算一致，damage 联动方向正确', () => {
    expect(BUDGET_TUNER_PARAMS).toHaveLength(7);
    for (const param of BUDGET_TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
    }

    const runtime = createDefaultConfig();
    const metrics = deriveMetrics(cfg, runtime);
    const hp = cfg.enemies.types.normal.hpBase + cfg.enemies.types.normal.hpPerWave;
    const speed = (cfg.enemies.types.normal.speedBase + cfg.enemies.types.normal.speedPerWave) * runtime.enemySpeed;
    const hitRate = Math.min(1, cfg.enemies.types.normal.r / (runtime.range * Math.tan(cfg.combat.bullet.spread)));
    const ttk = hp / (runtime.damage * runtime.fireRate * hitRate);
    const interval = Math.max(cfg.waves.spawnInterval.min, cfg.waves.spawnInterval.base - cfg.waves.spawnInterval.perWave);
    const spawnDistance = ((cfg.combat.canvas.width / 2 + cfg.waves.spawnMargin) * 2
      + (cfg.combat.canvas.height / 2 + cfg.waves.spawnMargin) * 2) / 4;
    const entry = Math.max(0, spawnDistance - runtime.range) / speed;

    expect(metrics.cells.normal[0].ttk).toBeCloseTo(ttk, 10);
    expect(metrics.cells.normal[0].killDepth).toBeCloseTo(runtime.range - speed * ttk, 10);
    expect(metrics.cells.normal[0].onScreen).toBeCloseTo((entry + ttk) / interval, 10);

    const doubled = deriveMetrics(cfg, { ...runtime, damage: runtime.damage * 2 });
    expect(doubled.cells.normal[0].ttk).toBeCloseTo(ttk / 2, 10);
    expect(doubled.cells.normal[0].killDepth).toBeGreaterThan(metrics.cells.normal[0].killDepth);
    expect(doubled.cells.normal[0].onScreen).toBeLessThan(metrics.cells.normal[0].onScreen);
  });

  it('projects every Budget control into a visible derived value', () => {
    const runtime = createDefaultConfig();
    cfg.waves.spawnMode = 'budget';
    cfg.waves.enemyCountBase = 20;
    cfg.waves.enemyCountPerWave = 0;
    cfg.waves.budget.targetOnScreen = { base: 4, perWave: 1 };
    cfg.waves.budget.checkInterval = 2;
    cfg.waves.budget.batchMax = 3;
    cfg.waves.budget.waveEndSprint = { window: 4, multiplier: 1.5 };
    cfg.waves.budget.maxAlive = 20;
    const baseline = deriveMetrics(cfg, runtime);

    cfg.waves.budget.targetOnScreen.base = 6;
    expect(deriveMetrics(cfg, runtime).budget!.normalOnScreen).not.toEqual(baseline.budget!.normalOnScreen);
    cfg.waves.budget.targetOnScreen.base = 4;
    cfg.waves.budget.targetOnScreen.perWave = 2;
    expect(deriveMetrics(cfg, runtime).budget!.normalOnScreen).not.toEqual(baseline.budget!.normalOnScreen);
    cfg.waves.budget.targetOnScreen.perWave = 1;
    cfg.waves.budget.maxAlive = 4;
    expect(deriveMetrics(cfg, runtime).budget!.sprintOnScreen).not.toEqual(baseline.budget!.sprintOnScreen);
    cfg.waves.budget.maxAlive = 20;
    cfg.waves.budget.waveEndSprint.multiplier = 2;
    expect(deriveMetrics(cfg, runtime).budget!.sprintOnScreen).not.toEqual(baseline.budget!.sprintOnScreen);
    cfg.waves.budget.waveEndSprint.multiplier = 1.5;
    cfg.waves.budget.waveEndSprint.window = 2;
    expect(deriveMetrics(cfg, runtime).budget!.sprintQuotaThreshold).not.toEqual(baseline.budget!.sprintQuotaThreshold);
    cfg.waves.budget.waveEndSprint.window = 4;
    cfg.waves.budget.checkInterval = 1;
    expect(deriveMetrics(cfg, runtime).budget!.sprintQuotaThreshold).not.toEqual(baseline.budget!.sprintQuotaThreshold);
    cfg.waves.budget.checkInterval = 2;
    cfg.waves.budget.batchMax = 4;
    expect(deriveMetrics(cfg, runtime).waveDurations).not.toEqual(baseline.waveDurations);
  });
});

describe('调试模式 · seed 与跳波', () => {
  function wave3Sequence(seed: number): { at: number; type: string }[] {
    const state = freshState();
    const runtime = createDefaultConfig();
    const rng = createSeededRng(seed);
    jumpToWave(state, runtime, rng, 3);
    const sequence: { at: number; type: string }[] = [];
    let elapsed = 0;
    let count = 0;
    while (state.spawnLeft > 0) {
      tickSpawns(state, rng, 0.01);
      elapsed += 0.01;
      if (state.enemies.length > count) {
        sequence.push({ at: Number(elapsed.toFixed(2)), type: state.enemies[state.enemies.length - 1].type });
        count = state.enemies.length;
      }
    }
    return sequence;
  }

  it('seed=42 跳到第 3 波，两次出怪时序与类型序列完全一致', () => {
    const first = wave3Sequence(42);
    const second = wave3Sequence(42);
    expect(first).toEqual(second);
    expect(first).toHaveLength(14);
  });
});
