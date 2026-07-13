import { cfg } from '../config';
import type { Config, GameState } from './types';
import { bonusFromCards } from './systems/cardSystem';
import { effectiveEquipment, getModifiers } from './effects/interpreter';

/** 生效装备（锁定卡或独立装备栏）的旧数值卡加成。 */
export function equipmentBonus(state: GameState) {
  return bonusFromCards(effectiveEquipment(state));
}

function buffMul(state: GameState, kind: 'fireRateMul' | 'damageMul'): number {
  let mul = 1;
  for (const b of state.buffs) if (b.kind === kind) mul *= b.mul;
  return mul;
}

export function totalDamage(state: GameState, config: Config): number {
  return (config.damage + state.damageBonus + equipmentBonus(state).damage) * buffMul(state, 'damageMul');
}

export function totalFireRate(state: GameState, config: Config): number {
  return (config.fireRate + state.fireRateBonus + equipmentBonus(state).rate) * buffMul(state, 'fireRateMul');
}

export function totalMulti(state: GameState): number {
  return state.multi + equipmentBonus(state).multi;
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
  return Math.min(config.range + equipmentBonus(state).range, maxAttackRange());
}

/** 掉落概率：（基础 + 眷恋加成）× 装备态掉率乘数，封顶 chanceCap。 */
export function totalDropChance(state: GameState, config: Config): number {
  return Math.min(
    cfg.economy.drops.chanceCap,
    (config.dropChance + equipmentBonus(state).drop) * getModifiers(state).dropRateMul,
  );
}

/** 掉落存活时长：基础 × 装备态时限乘数。 */
export function totalDropLifetime(state: GameState, config: Config): number {
  return config.dropLifetime * getModifiers(state).dropLifetimeMul;
}
