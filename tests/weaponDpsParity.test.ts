import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import type { CardDef } from '../src/core/effects/defs';
import { shoot, updateBullets, updateTurret } from '../src/core/systems/combatSystem';
import type { CardType, Enemy, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const rng = constRng(0.5);
const bossHp = 1_000_000_000;

beforeEach(resetTestEnv);

interface SimulationOptions {
  beam?: boolean;
  fireRate?: number;
  multi?: number;
  dt?: number;
  seconds?: number;
  targetXs?: number[];
}

function simulate({
  beam = false,
  fireRate = 5,
  multi = 1,
  dt = 1 / 120,
  seconds = 90,
  targetXs = [390],
}: SimulationOptions = {}): number[] {
  registerSkillDefs(cfg.skills.cards);
  const config = createDefaultConfig();
  config.fireRate = fireRate;
  const state = freshState();
  state.multi = multi;
  if (beam) {
    const terminal = card('pierce', 6);
    terminal.evolutionPath = ['6:terminal'];
    state.equipment[0] = terminal;
  }

  const targets: Enemy[] = targetXs.map(x => enemy({
    x,
    y: cfg.combat.turret.y,
    type: 'boss',
    hp: bossHp,
    maxHp: bossHp,
    speed: 0,
    r: 32,
  }));
  state.enemies = targets;

  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    updateTurret(state, config, rng, dt);
    updateBullets(state, config, rng, dt);
    // 粒子与本契约无关，逐帧清空以保持长时间模拟轻量。
    state.particles.length = 0;
    state.vfx.length = 0;
  }

  return targets.map(target => bossHp - target.hp);
}

function ratio(beamDamage: number, projectileDamage: number): number {
  return beamDamage / projectileDamage;
}

type FusionBuild = 'solarLance' | 'splitBlast' | 'mixed';
type FusionScenario = 'S1' | 'S2';

interface FusionSimulationOptions {
  build: FusionBuild;
  scenario?: FusionScenario;
  fireRate?: number;
  multi?: number;
  dt?: number;
  seconds?: number;
}

interface FusionSimulationResult {
  totalDamage: number;
  impactDamage: number;
}

/** 只保留本任务范围内的 passive 换形，排除正式卡上无关的触发式 riders。 */
function shapeOnlyDef(id: CardType): CardDef {
  const source = cfg.skills.cards.find(def => def.id === id)!;
  const star6 = structuredClone(source.stars['6']!);
  star6.equip = star6.equip.filter(binding => binding.trigger === 'passive');
  return {
    ...structuredClone(source),
    recipeOnly: true,
    evolutionTree: undefined,
    stars: { '6': star6 },
  };
}

function equipFusionBuild(state: GameState, build: FusionBuild): number | undefined {
  const types: CardType[] = build === 'mixed' ? ['solarLance', 'splitBlast'] : [build];
  let splitBlastId: number | undefined;
  types.forEach((type, index) => {
    const equipped = card(type, 6);
    state.equipment[index] = equipped;
    if (type === 'splitBlast') splitBlastId = equipped.id;
  });
  return splitBlastId;
}

function fusionTargetPoints(scenario: FusionScenario): Array<{ x: number; y: number }> {
  const t = cfg.combat.turret;
  if (scenario === 'S1') {
    return [40, 65, 90, 115, 140].map(distance => ({ x: t.x, y: t.y - distance }));
  }
  return [
    ...[40, 85, 130].map(distance => ({ x: t.x, y: t.y - distance })),
    { x: t.x - 70, y: t.y - 85 },
    { x: t.x + 70, y: t.y - 85 },
  ];
}

function simulateFusion({
  build,
  scenario = 'S1',
  fireRate = 5,
  multi = 1,
  dt = 1 / 120,
  seconds = 30,
}: FusionSimulationOptions): FusionSimulationResult {
  registerSkillDefs([shapeOnlyDef('solarLance'), shapeOnlyDef('splitBlast')]);
  const config = createDefaultConfig();
  config.fireRate = fireRate;
  const state = freshState();
  state.multi = multi;
  const splitBlastId = equipFusionBuild(state, build);
  const targets = fusionTargetPoints(scenario).map(point => enemy({
    ...point,
    type: 'boss',
    hp: bossHp,
    maxHp: bossHp,
    speed: 0,
    r: 12,
  }));
  state.enemies = targets;

  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    updateTurret(state, config, rng, dt);
    updateBullets(state, config, rng, dt);
    state.particles.length = 0;
    state.vfx.length = 0;
  }

  return {
    totalDamage: targets.reduce((sum, target) => sum + bossHp - target.hp, 0),
    impactDamage: splitBlastId == null
      ? 0
      : state.combatTelemetry.perCard[splitBlastId]?.damage ?? 0,
  };
}

describe('6★ 直球拒绝 · 光束 DPS 契约', () => {
  it('单体 Boss DPS 与普通主炮基本持平', () => {
    const projectileDamage = simulate()[0];
    const beamDamage = simulate({ beam: true })[0];

    expect(ratio(beamDamage, projectileDamage)).toBeGreaterThanOrEqual(0.98);
    expect(ratio(beamDamage, projectileDamage)).toBeLessThanOrEqual(1.02);
  });

  it.each([5, 5.6, 7, 10])('继承 fireRate=%s 的输出预算', fireRate => {
    const projectileDamage = simulate({ fireRate, dt: 1 / 600 })[0];
    const beamDamage = simulate({ beam: true, fireRate, dt: 1 / 600 })[0];

    expect(ratio(beamDamage, projectileDamage)).toBeGreaterThanOrEqual(0.98);
    expect(ratio(beamDamage, projectileDamage)).toBeLessThanOrEqual(1.02);
  });

  it.each([1, 2, 3])('继承 multi=%s 的输出预算', multi => {
    const projectileDamage = simulate({ multi, dt: 1 / 600 })[0];
    const beamDamage = simulate({ beam: true, multi, dt: 1 / 600 })[0];

    expect(ratio(beamDamage, projectileDamage)).toBeGreaterThanOrEqual(0.98);
    expect(ratio(beamDamage, projectileDamage)).toBeLessThanOrEqual(1.02);
  });

  it('贯穿同一直线的 3 个目标，并对每个目标结算近似相同伤害', () => {
    const projectileDamage = simulate()[0];
    const beamDamages = simulate({ beam: true, targetXs: [330, 375, 420] });
    const totalBeamDamage = beamDamages.reduce((sum, damage) => sum + damage, 0);

    expect(Math.max(...beamDamages) - Math.min(...beamDamages)).toBeLessThan(0.001);
    expect(totalBeamDamage).toBeGreaterThan(projectileDamage * 2.5);
  });

  it('在 30/60/120 FPS 下结算误差小于 1%', () => {
    const damages = [1 / 30, 1 / 60, 1 / 120]
      .map(dt => simulate({ beam: true, dt })[0]);
    const relativeSpread = (Math.max(...damages) - Math.min(...damages)) / Math.max(...damages);

    expect(relativeSpread).toBeLessThan(0.01);
  });
});

describe('榴弹与融合爆炸的成长预算', () => {
  it('lob 单装完整继承 multi，且总伤害近似等比增长', () => {
    const damages = [1, 2, 3].map(multi =>
      simulateFusion({ build: 'splitBlast', multi }).totalDamage);

    expect(damages[1] / damages[0]).toBeCloseTo(2, 7);
    expect(damages[2] / damages[0]).toBeCloseTo(3, 7);
  });

  it('lob 单装 multi=1 时爆炸中心伤害维持 23.4', () => {
    registerSkillDefs([shapeOnlyDef('solarLance'), shapeOnlyDef('splitBlast')]);
    const config = createDefaultConfig();
    const state = freshState();
    equipFusionBuild(state, 'splitBlast');
    const target = enemy({
      x: cfg.combat.turret.x,
      y: cfg.combat.turret.y - 40,
      hp: 100,
      maxHp: 100,
      speed: 0,
      r: 12,
    });
    state.enemies = [target];

    shoot(state, config, rng, target);
    updateBullets(state, config, rng, 1);

    expect(target.hp).toBe(100 - 23.4);
  });

  it('融合爆炸完整继承 fireRate', () => {
    const base = simulateFusion({ build: 'mixed', fireRate: 5 }).impactDamage;
    const doubled = simulateFusion({ build: 'mixed', fireRate: 10 }).impactDamage;

    expect(doubled / base).toBeCloseTo(2, 7);
  });

  it('S1 混装收益比在三档成长下恒定且落在 1.33~1.37', () => {
    const ratios = [
      { fireRate: 5, multi: 1 },
      { fireRate: 10, multi: 1 },
      { fireRate: 5, multi: 2 },
    ].map(growth => {
      const a = simulateFusion({ build: 'solarLance', ...growth }).totalDamage;
      const c = simulateFusion({ build: 'mixed', ...growth }).totalDamage;
      return c / a;
    });
    const relativeSpread = (Math.max(...ratios) - Math.min(...ratios)) / Math.max(...ratios);

    expect(relativeSpread).toBeLessThan(0.02);
    for (const value of ratios) {
      expect(value).toBeGreaterThanOrEqual(1.33);
      expect(value).toBeLessThanOrEqual(1.37);
    }
  });

});
