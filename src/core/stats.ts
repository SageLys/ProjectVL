import { cfg } from '../config';
import type { Config, GameState } from './types';
import { getModifiers } from './effects/interpreter';

function buffMul(state: GameState, kind: 'fireRateMul' | 'damageMul'): number {
  let mul = 1;
  for (const b of state.buffs) if (b.kind === kind) mul *= b.mul;
  return mul;
}

export function totalDamage(state: GameState, config: Config): number {
  return (config.damage + state.damageBonus) * buffMul(state, 'damageMul');
}

export function totalFireRate(state: GameState, config: Config): number {
  return (config.fireRate + state.fireRateBonus) * buffMul(state, 'fireRateMul');
}

export function totalMulti(state: GameState): number {
  return state.multi;
}

/**
 * Largest circular attack range that still leaves a visible anticipation band
 * between the range boundary and every edge of the arena.
 */
export function maxAttackRange(): number {
  const { width, height } = cfg.combat.canvas;
  const { x, y } = cfg.combat.turret;
  const nearestEdge = Math.min(x, width - x, y, height - y);
  return Math.max(0, nearestEdge - cfg.combat.attackPreviewMargin);
}

export function totalRange(state: GameState, config: Config): number {
  return Math.min(config.range + config.range * state.rangeBonus, maxAttackRange());
}

/** 掉落概率：（基础 + 眷恋加成）× 装备态掉率乘数，封顶 chanceCap。 */
/** @deprecated Legacy fixed-probability ordinary-drop path. */
export function totalDropChance(state: GameState, config: Config): number {
  return Math.min(
    cfg.economy.drops.chanceCap,
    config.dropChance * getModifiers(state).dropRateMul,
  );
}

/** 掉落存活时长：基础 × 装备态时限乘数。 */
export function totalDropLifetime(state: GameState, config: Config): number {
  return config.dropLifetime * getModifiers(state).dropLifetimeMul;
}
