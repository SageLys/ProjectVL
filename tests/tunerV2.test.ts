import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { jumpToWave, tickSpawns } from '../src/core/systems/waveSystem';
import { budgetWaveQuotaFor } from '../src/core/systems/budgetRules';
import { resolveActiveWavePlan } from '../src/core/runStage';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { deriveMetrics } from '../src/ui/derivedMetrics';
import {
  getNumberAt, setNumberAt, tunerLabel, tunerParam, tunerSliders, tunerSlidersInGroup,
} from '../src/ui/tunerSchema';
import { validateTunerConfig } from '../src/config/tunerMeta';
import { freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

/** 迁移前各分组暴露的滑杆数（tunerSchema.ts 五张手写表合并后的分组统计），用于锁死面板可调项不变。 */
const SLIDERS_PER_GROUP = {
  waves: 37, combat: 9, enemies: 29, drops: 34, progression: 2, bounty: 42, p2: 8,
} as const;

describe('调参元数据 · 单一来源', () => {
  it('每个滑杆都有合法范围、可解析标签，并指向配置中的真实数值', () => {
    const sliders = tunerSliders();
    expect(sliders).toHaveLength(161);
    for (const param of sliders) {
      expect(param.min, param.path).toBeLessThan(param.max!);
      expect(param.step, param.path).toBeGreaterThan(0);
      expect(tunerLabel(param), param.path).not.toBe(param.path);
      expect(() => getNumberAt(cfg, param.path)).not.toThrow();
    }
  });

  it('面板每组的可调项数量与迁移前逐组相等', () => {
    for (const [group, count] of Object.entries(SLIDERS_PER_GROUP)) {
      expect(tunerSlidersInGroup(group as keyof typeof SLIDERS_PER_GROUP), group).toHaveLength(count);
    }
  });

  it('专用控件由 type/options 表达，不再靠面板内硬编码', () => {
    expect(tunerParam('waves.spawnMode')).toMatchObject({ type: 'enum', options: ['interval', 'budget'] });
    expect(tunerParam('bounty.enabled')).toMatchObject({ type: 'boolean', applyPolicy: 'immediate' });
    expect(tunerParam('waves.bossWaves')).toMatchObject({ type: 'text' });
  });

  it('保留项已声明范围但不进面板', () => {
    const reserved = cfg.tuner.params.filter(param => param.exposed === false);
    expect(reserved).toHaveLength(13);
    expect(reserved.map(param => param.path)).toContain('enemies.types.boss.ccResist');
    expect(tunerSliders().some(param => param.exposed === false)).toBe(false);
  });

  it('非法元数据在配置加载阶段即报错', () => {
    const broken = structuredClone(cfg);
    broken.tuner.params[3].max = broken.tuner.params[3].min;
    expect(() => validateTunerConfig(broken)).toThrow(/min 必须小于 max/);
    const missingPath = structuredClone(cfg);
    missingPath.tuner.params[3].path = 'waves.notARealField';
    expect(() => validateTunerConfig(missingPath)).toThrow(/未指向配置中的数值/);
  });

  it('Bounty 的全部数值参数都即时生效', () => {
    const bounty = tunerSlidersInGroup('bounty');
    expect(bounty.every(param => param.applyPolicy === 'immediate')).toBe(true);
  });

  it('开局强制发牌次数在下一波延迟生效', () => {
    expect(tunerParam('economy.normalDropTypePolicy.bootstrapForcedDrops')).toMatchObject({
      type: 'number', group: 'drops', min: 0, max: 20, step: 1, applyPolicy: 'waveDeferred',
    });
  });
});

describe('调参面板 v2 · 派生指标', () => {
  it('round-trips all progression controls through numeric path accessors', () => {
    const paths = [
      'progression.killXpMul',
      'progression.relicChoices',
    ];
    for (const [index, path] of paths.entries()) {
      const value = index + 2.25;
      setNumberAt(cfg, path, value);
      expect(getNumberAt(cfg, path)).toBe(value);
    }
  });

  it('TTK、击杀深度与同屏数和手算一致，damage 联动方向正确', () => {
    cfg.waves.stagePlan.enabled = false;
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
    cfg.waves.stagePlan.enabled = false;
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
