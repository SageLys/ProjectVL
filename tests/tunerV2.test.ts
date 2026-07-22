import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { jumpToWave, tickSpawns } from '../src/core/systems/waveSystem';
import { budgetWaveQuotaFor } from '../src/core/systems/budgetRules';
import { resolveActiveWavePlan } from '../src/core/runStage';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { deriveMetrics } from '../src/ui/derivedMetrics';
import {
  BOUNTY_TUNER_PARAMS, BUDGET_TUNER_PARAMS, DROP_DIRECTOR_TUNER_PARAMS, STAGE_DIRECTOR_TUNER_PARAMS, TUNER_PARAMS,
  getNumberAt, setNumberAt,
} from '../src/ui/tunerSchema';
import { freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('stage director tuner controls', () => {
  it('exposes valid numeric ranges', () => {
    expect(STAGE_DIRECTOR_TUNER_PARAMS).toHaveLength(16);
    for (const param of STAGE_DIRECTOR_TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
      expect(() => getNumberAt(cfg, param.path)).not.toThrow();
    }
  });
});

describe('调参面板 v2 · 参数与派生指标', () => {
  it('§2 A/B/C/D 每个暴露参数都在 tuner.json 有 min/max/step', () => {
    expect(TUNER_PARAMS.length).toBe(64);
    for (const param of TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
    }
  });

  it('exposes every numeric drop-director control with a valid tuner range', () => {
    expect(DROP_DIRECTOR_TUNER_PARAMS).toHaveLength(27);
    expect(DROP_DIRECTOR_TUNER_PARAMS.every(param => param.group === 'drops')).toBe(true);
    for (const param of DROP_DIRECTOR_TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
      expect(() => getNumberAt(cfg, param.path)).not.toThrow();
    }
  });

  it('round-trips all progression controls through numeric path accessors', () => {
    const paths = [
      'progression.xpNeedBase',
      'progression.xpGrowth',
      'progression.killXpMul',
      'progression.perkChoices',
    ];
    for (const [index, path] of paths.entries()) {
      const value = index + 2.25;
      setNumberAt(cfg, path, value);
      expect(getNumberAt(cfg, path)).toBe(value);
    }
  });

  it('Bounty 的全部数值参数都有合法范围且即时生效', () => {
    expect(BOUNTY_TUNER_PARAMS).toHaveLength(42);
    expect(BOUNTY_TUNER_PARAMS.every(param => param.group === 'bounty' && !param.waveDeferred)).toBe(true);
    for (const param of BOUNTY_TUNER_PARAMS) {
      const range = cfg.tuner[param.path];
      expect(range, param.path).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.step).toBeGreaterThan(0);
      expect(() => getNumberAt(cfg, param.path)).not.toThrow();
    }
  });

  it('TTK、击杀深度与同屏数和手算一致，damage 联动方向正确', () => {
    cfg.economy.ordinaryDropRate.enabled = false;
    expect(BUDGET_TUNER_PARAMS).toHaveLength(9);
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
    // budget 模式下 onScreen 是供给目标（同屏配额），不再是 interval 模式的 (entry+ttk)/间隔 手算式。
    const expectedOnScreen = cfg.waves.spawnMode === 'budget'
      ? Math.min(cfg.waves.budget.maxAlive, cfg.waves.budget.targetOnScreen.base + cfg.waves.budget.targetOnScreen.perWave)
      : (entry + ttk) / interval;
    expect(metrics.cells.normal[0].onScreen).toBeCloseTo(expectedOnScreen, 10);

    const doubled = deriveMetrics(cfg, { ...runtime, damage: runtime.damage * 2 });
    expect(doubled.cells.normal[0].ttk).toBeCloseTo(ttk / 2, 10);
    expect(doubled.cells.normal[0].killDepth).toBeGreaterThan(metrics.cells.normal[0].killDepth);
    if (cfg.waves.spawnMode === 'budget') {
      // budget 模式的同屏数是配置驱动的供给目标，不随伤害变化。
      expect(doubled.cells.normal[0].onScreen).toBe(metrics.cells.normal[0].onScreen);
    } else {
      expect(doubled.cells.normal[0].onScreen).toBeLessThan(metrics.cells.normal[0].onScreen);
    }
  });

  it('projects every Budget control into a visible derived value', () => {
    cfg.economy.ordinaryDropRate.enabled = false;
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
    // budget 模式按同屏目标节流生成、且单次 check 可能一批生成多个（batchMax>1）：
    // 不模拟击杀会导致 spawnLeft 永远卡在同屏上限，故每次 tick 后立即清空本批（等价"秒杀"），
    // 并把本批新增的每一个敌人都计入序列（不能只记最后一个），只为采样出怪时序/类型。
    while (state.spawnLeft > 0) {
      tickSpawns(state, rng, 0.01);
      elapsed += 0.01;
      if (state.enemies.length > count) {
        for (let i = count; i < state.enemies.length; i++) {
          sequence.push({ at: Number(elapsed.toFixed(2)), type: state.enemies[i].type });
        }
        state.enemies.length = 0;
        count = 0;
      }
    }
    return sequence;
  }

  it('seed=42 跳到第 3 波，两次出怪时序与类型序列完全一致', () => {
    const first = wave3Sequence(42);
    const second = wave3Sequence(42);
    expect(first).toEqual(second);
    // 总出怪数 = 第 3 波配额（budget/interval 两种模式配额公式不同，动态取当前生效值）。
    const expectedCount = cfg.waves.spawnMode === 'budget'
      ? budgetWaveQuotaFor(resolveActiveWavePlan(cfg, 3))
      : cfg.waves.enemyCountBase + 3 * cfg.waves.enemyCountPerWave;
    expect(first).toHaveLength(expectedCount);
  });
});
