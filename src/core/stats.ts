import { cfg } from '../config';
import type { CardStatKind } from '../config/types';
import type { Config, GameState } from './types';
import { getModifiers } from './effects/interpreter';
import { modifierTotal } from './systems/runtimeStatModifierSystem';
export { modifierTotal } from './systems/runtimeStatModifierSystem';

function combinedTotal(state: GameState, baseStat: 'damage' | 'fireRate', addStat: CardStatKind) {
  const base = modifierTotal(state, baseStat);
  const add = modifierTotal(state, addStat);
  return { add: base.add + add.add, mul: base.mul * add.mul };
}

export function totalDamage(state: GameState, config: Config): number {
  const modifier = combinedTotal(state, 'damage', 'damageAdd');
  return (
    config.damage
    + state.damageBonus
    + state.runBaseStats.damageAdd
    + getModifiers(state).equipmentAffixAdd.damageAdd
    + modifier.add
  ) * modifier.mul;
}

export function totalFireRate(state: GameState, config: Config): number {
  const modifier = combinedTotal(state, 'fireRate', 'fireRateAdd');
  return (
    config.fireRate
    + state.fireRateBonus
    + state.runBaseStats.fireRateAdd
    + getModifiers(state).equipmentAffixAdd.fireRateAdd
    + modifier.add
  ) * modifier.mul;
}

export function totalMulti(state: GameState): number {
  const modifier = modifierTotal(state, 'multiAdd');
  return (
    state.multi
    + state.runBaseStats.multiAdd
    + getModifiers(state).equipmentAffixAdd.multiAdd
    + modifier.add
  ) * modifier.mul;
}

/** Permanent base plus equipped and time-limited maximum-HP affixes. */
export function totalMaxHp(state: GameState): number {
  return Math.max(
    0,
    state.baseMaxHp
      + getModifiers(state).equipmentAffixAdd.maxHpAdd
      + modifierTotal(state, 'maxHpAdd').add,
  );
}

/**
 * Rebuilds the derived maximum while preserving damage already taken.
 * Playing runs retain at least one HP so equipment changes cannot kill the player.
 */
export function reconcileMaxHp(state: GameState): void {
  const prevMax = state.maxHp;
  const missing = Math.max(0, prevMax - state.hp);
  const next = totalMaxHp(state);
  state.maxHp = next;
  const floor = state.mode === 'playing' ? Math.min(1, next) : 0;
  state.hp = Math.min(next, Math.max(floor, next - missing));
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
  const modifier = modifierTotal(state, 'rangeAdd');
  return Math.min(
    (
      config.range
      + config.range * state.rangeBonus
      + state.runBaseStats.rangeAdd
      + getModifiers(state).equipmentAffixAdd.rangeAdd
      + modifier.add
    ) * modifier.mul,
    maxAttackRange(),
  );
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
