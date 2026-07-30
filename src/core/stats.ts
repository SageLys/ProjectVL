import { cfg } from '../config';
import type { CardBaseStatMulKind, RunBaseStatKind } from '../config/types';
import type { Config, GameState } from './types';
import { getModifiers } from './effects/interpreter';
import { modifierTotal } from './systems/runtimeStatModifierSystem';
export { modifierTotal } from './systems/runtimeStatModifierSystem';

function combinedTotal(
  state: GameState,
  baseStat: 'damage' | 'fireRate',
  addStat: RunBaseStatKind,
  mulStat: CardBaseStatMulKind,
) {
  const base = modifierTotal(state, baseStat);
  const add = modifierTotal(state, addStat);
  const mul = modifierTotal(state, mulStat);
  return { add: base.add + add.add, mul: base.mul * add.mul * mul.mul };
}

export function totalDamage(state: GameState, config: Config): number {
  const modifier = combinedTotal(state, 'damage', 'damageAdd', 'damageMul');
  return (
    config.damage
    + state.damageBonus
    + state.runBaseStats.damageAdd
    + modifier.add
  ) * getModifiers(state).equipmentAffixMul.damageMul * modifier.mul;
}

export function totalFireRate(state: GameState, config: Config): number {
  const modifier = combinedTotal(state, 'fireRate', 'fireRateAdd', 'fireRateMul');
  return (
    config.fireRate
    + state.fireRateBonus
    + state.runBaseStats.fireRateAdd
    + modifier.add
  ) * getModifiers(state).equipmentAffixMul.fireRateMul * modifier.mul;
}

export function totalMulti(state: GameState): number {
  const modifier = modifierTotal(state, 'multiAdd');
  return (
    state.multi
    + state.runBaseStats.multiAdd
    + modifier.add
  ) * modifier.mul;
}

/** 普通主炮完整继承 damage、fireRate 与 multi 后的每秒输出预算。 */
export function baselineDps(state: GameState, config: Config): number {
  return totalDamage(state, config) * totalFireRate(state, config) * totalMulti(state);
}

/** Permanent base multiplied by equipment and timed affixes, plus timed flat HP. */
export function totalMaxHp(state: GameState): number {
  const runtimeMul = modifierTotal(state, 'maxHpMul');
  const total = Math.max(
    0,
    state.baseMaxHp
      * getModifiers(state).equipmentAffixMul.maxHpMul
      * runtimeMul.mul
      + modifierTotal(state, 'maxHpAdd').add,
  );
  return Number(total.toFixed(9));
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

export function permanentRange(state: GameState, config: Config): number {
  return config.range
    + config.range * state.rangeBonus
    + state.runBaseStats.rangeAdd;
}

export function totalRange(state: GameState, config: Config): number {
  const addModifier = modifierTotal(state, 'rangeAdd');
  const mulModifier = modifierTotal(state, 'rangeMul');
  return Math.min(
    (
      permanentRange(state, config)
      + addModifier.add
    )
      * getModifiers(state).equipmentAffixMul.rangeMul
      * addModifier.mul
      * mulModifier.mul,
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
