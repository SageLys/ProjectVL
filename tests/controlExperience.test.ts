import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { resolveConsumableTier } from '../src/core/effects/interpreter';
import { ATOMS, type EffectCtx } from '../src/core/effects/registry';
import {
  applyFreeze,
  applyKnockback,
  applyStun,
  controlBudgetDenies,
  isImmobile,
  speedMultiplier,
  tickStatusTimers,
} from '../src/core/effects/statusSystem';
import { findTarget, updateTurret } from '../src/core/systems/combatSystem';
import { applyBuildScalingToTier } from '../src/core/systems/buildModifierSystem';
import { totalRange } from '../src/core/stats';
import type { Enemy, GameState } from '../src/core/types';
import { constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

function ctxFor(state: GameState, over: Partial<EffectCtx> = {}): EffectCtx {
  return {
    state,
    config,
    rng,
    events: [],
    origin: { ...cfg.combat.turret },
    star: 6,
    baseDamage: 10,
    ...over,
  };
}

function distanceFromTurret(e: Enemy): number {
  return Math.hypot(e.x - cfg.combat.turret.x, e.y - cfg.combat.turret.y);
}

function isNeutralizedForTest(e: Enemy): boolean {
  return isImmobile(e) || e.status.kbFatigue !== null;
}

describe('击退射程限位', () => {
  it('把射程内近边缘敌人卡在边缘，不推出射程', () => {
    const state = freshState();
    const range = totalRange(state, config);
    const t = cfg.combat.turret;
    const target = enemy({ x: t.x + range - 5, y: t.y });

    expect(applyKnockback(target, t.x, t.y, 999, range)).toBe(true);
    expect(distanceFromTurret(target)).toBeCloseTo(range, 10);
  });

  it('不把原本在射程外的 AoE 目标吸回射程', () => {
    const state = freshState();
    const range = totalRange(state, config);
    const t = cfg.combat.turret;
    const target = enemy({ x: t.x + range + 30, y: t.y });
    const before = distanceFromTurret(target);

    expect(applyKnockback(target, t.x, t.y, 999, range)).toBe(true);
    expect(distanceFromTurret(target)).toBeGreaterThanOrEqual(before);
    expect(distanceFromTurret(target)).toBeGreaterThan(range);
  });
});

describe('控制潜力封顶', () => {
  it('freeze/stun 先封顶，再叠加类型抗性', () => {
    const normalFreeze = enemy();
    const normalStun = enemy();
    const resistantFreeze = enemy({ ccResistOverride: 0.4 });
    const resistantStun = enemy({ ccResistOverride: 0.4 });

    applyFreeze(normalFreeze, 99);
    applyStun(normalStun, 99);
    applyFreeze(resistantFreeze, 99);
    applyStun(resistantStun, 99);

    expect(normalFreeze.status.frozen).toBe(cfg.combat.controlCeiling.freezeSeconds);
    expect(normalStun.status.stunned).toBe(cfg.combat.controlCeiling.stunSeconds);
    expect(resistantFreeze.status.frozen).toBeCloseTo(cfg.combat.controlCeiling.freezeSeconds * 0.6);
    expect(resistantStun.status.stunned).toBeCloseTo(cfg.combat.controlCeiling.stunSeconds * 0.6);
  });

  it('knockback 先封顶，再叠加类型抗性', () => {
    const t = cfg.combat.turret;
    const normal = enemy({ x: t.x + 10, y: t.y });
    const resistant = enemy({ x: t.x + 10, y: t.y, knockbackResistOverride: 0.25 });

    applyKnockback(normal, t.x, t.y, 999);
    applyKnockback(resistant, t.x, t.y, 999);

    expect(distanceFromTurret(normal)).toBeCloseTo(10 + cfg.combat.controlCeiling.knockbackDistance);
    expect(distanceFromTurret(resistant)).toBeCloseTo(10 + cfg.combat.controlCeiling.knockbackDistance * 0.75);
  });
});

describe('全局控制预算', () => {
  it('混合冻结与击退始终保留配置要求的自由推进者', () => {
    const state = freshState();
    const t = cfg.combat.turret;
    state.enemies = Array.from({ length: 10 }, (_, index) => enemy({ x: t.x + 30 + index, y: t.y }));

    for (const target of state.enemies.slice(0, 3)) {
      ATOMS.freeze(ctxFor(state, { enemy: target }), { duration: 1 });
    }
    for (const target of state.enemies.slice(3)) {
      ATOMS.knockback(ctxFor(state, { enemy: target }), { distance: 20 });
    }

    const minFree = Math.max(
      cfg.combat.controlBudget.minFreeAdvancers,
      Math.ceil(state.enemies.length * (1 - cfg.combat.controlBudget.maxControlledRatio)),
    );
    expect(state.enemies.filter(target => !isNeutralizedForTest(target))).toHaveLength(minFree);
  });

  it('允许刷新已中和敌人，小规模与单 Boss 不受预算限制', () => {
    const large = freshState();
    large.enemies = Array.from({ length: 5 }, () => enemy());
    const controlled = large.enemies[0];
    controlled.status.frozen = 1;
    expect(controlBudgetDenies(large, controlled)).toBe(false);
    ATOMS.freeze(ctxFor(large, { enemy: controlled }), { duration: 2 });
    expect(controlled.status.frozen).toBe(2);

    const small = freshState();
    small.enemies = [enemy({ type: 'boss' }), enemy()];
    for (const target of small.enemies) {
      expect(controlBudgetDenies(small, target)).toBe(false);
      ATOMS.freeze(ctxFor(small, { enemy: target }), { duration: 1 });
    }
    expect(small.enemies.every(isImmobile)).toBe(true);
  });

  it('slow 不进预算且不受硬控时长天花板影响', () => {
    const state = freshState();
    state.enemies = Array.from({ length: 5 }, () => enemy());
    ATOMS.freeze(ctxFor(state), { duration: 99, radius: 1000 });
    ATOMS.slow(ctxFor(state), { ratio: 0.45, duration: 20, radius: 1000 });

    expect(state.enemies.filter(target => !isNeutralizedForTest(target))).toHaveLength(2);
    for (const target of state.enemies) {
      expect(target.status.slow).toEqual({ ratio: 0.45, remaining: 20 });
    }
  });
});

describe('群体高潜力控制回归', () => {
  it('持续保有射程内目标，并让自由推进者向炮台靠近', () => {
    const state = freshState();
    state.relicStacks.ctrl_potency = 5;
    state.buildState.scalingVersion++;
    const frostDef = cfg.skills.cards.find(def => def.id === 'frost')!;
    const impactDef = cfg.skills.cards.find(def => def.id === 'impact')!;
    const frost = applyBuildScalingToTier(state, frostDef, resolveConsumableTier(frostDef, 6));
    const impact = applyBuildScalingToTier(state, impactDef, resolveConsumableTier(impactDef, 6));
    const freezeDuration = frost.effects.find(effect => effect.atom === 'freeze')!.params!.duration as number;
    const knockbackDistance = impact.effects.find(effect => effect.atom === 'knockback')!.params!.distance as number;
    expect(freezeDuration).toBeGreaterThan(cfg.combat.controlCeiling.freezeSeconds);
    expect(knockbackDistance).toBeGreaterThan(cfg.combat.controlCeiling.knockbackDistance);

    const range = totalRange(state, config);
    const t = cfg.combat.turret;
    state.enemies = Array.from({ length: 5 }, (_, index) => enemy({
      x: t.x + range - 5 - index,
      y: t.y,
      speed: 20,
    }));
    const advancing = state.enemies[state.enemies.length - 1];
    const startDistance = distanceFromTurret(advancing);
    const dt = 0.1;

    for (let frame = 0; frame < 30; frame++) {
      ATOMS.knockback(ctxFor(state), { distance: knockbackDistance, radius: 1000 });
      ATOMS.freeze(ctxFor(state), { duration: freezeDuration, radius: 1000 });

      const free = state.enemies.filter(target => !isNeutralizedForTest(target));
      expect(free.length).toBeGreaterThanOrEqual(cfg.combat.controlBudget.minFreeAdvancers);
      for (const target of free) {
        const dx = t.x - target.x;
        const dy = t.y - target.y;
        const len = Math.hypot(dx, dy);
        target.x += (dx / len) * target.speed * speedMultiplier(target) * dt;
        target.y += (dy / len) * target.speed * speedMultiplier(target) * dt;
      }

      expect(findTarget(state, config)).not.toBeNull();
      const bulletsBefore = state.bullets.length;
      state.shotCd = 0;
      updateTurret(state, config, rng, dt);
      expect(state.bullets.length).toBeGreaterThan(bulletsBefore);
      expect(state.enemies.some(target => distanceFromTurret(target) <= range)).toBe(true);
      expect(Math.max(...state.enemies.map(distanceFromTurret))).toBeLessThanOrEqual(range + 1e-9);
      tickStatusTimers(state, dt);
    }

    expect(distanceFromTurret(advancing)).toBeLessThan(startDistance);
  });
});
