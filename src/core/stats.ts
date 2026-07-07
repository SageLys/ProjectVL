import { gameConfig } from '../data';
import type { Config, GameState } from './types';
import { addBonus, bonusFromCards } from './systems/cardSystem';

/** 装备栏 + 临时栏的合并加成（两者叠加计入总数值）。 */
export function equipmentBonus(state: GameState) {
  return addBonus(bonusFromCards(state.equipment), bonusFromCards(state.tempCards));
}

export function totalDamage(state: GameState, config: Config): number {
  return config.damage + state.damageBonus + equipmentBonus(state).damage;
}

export function totalFireRate(state: GameState, config: Config): number {
  return config.fireRate + state.fireRateBonus + equipmentBonus(state).rate;
}

export function totalMulti(state: GameState): number {
  return state.multi + equipmentBonus(state).multi;
}

export function totalRange(state: GameState, config: Config): number {
  return config.range + equipmentBonus(state).range;
}

/** 掉落概率：基础 + 眷恋加成，封顶 gameConfig.drops.chanceCap（0.95）。 */
export function totalDropChance(state: GameState, config: Config): number {
  return Math.min(gameConfig.drops.chanceCap, config.dropChance + equipmentBonus(state).drop);
}
