import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { updateBullets, updateTurret } from '../src/core/systems/combatSystem';
import type { Enemy } from '../src/core/types';
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
  if (beam) state.equipment[0] = card('pierce', 6);

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
