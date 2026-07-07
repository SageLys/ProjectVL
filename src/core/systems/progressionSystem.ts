import { perks as perksData } from '../../data';
import type { Config, GameEvent, GameState } from '../types';
import { totalDamage, totalFireRate } from '../stats';

const PERK_BY_ID = new Map(perksData.perks.map(p => [p.id, p]));

/** 触发升级：扣需求经验、升级、按成长系数抬高下一级需求、暂停并请求三选一。 */
export function levelUp(state: GameState): GameEvent[] {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * perksData.xpGrowth);
  state.paused = true;
  return [{ type: 'levelUp' }];
}

/** 累加经验；达到当前需求则触发一次升级（与原版一致，单次判定不连升）。 */
export function addXp(state: GameState, amount: number): GameEvent[] {
  state.xp += amount;
  if (state.xp >= state.xpNeed) return levelUp(state);
  return [];
}

/**
 * 应用升级三选一：高能弹芯（当前总伤害+20% 记入 damageBonus）、
 * 过载供能（当前总射速+15% 记入 fireRateBonus）、重整心防（回血，不超上限）。
 * 应用后恢复游戏。
 */
export function applyPerk(state: GameState, config: Config, perkId: string): GameEvent[] {
  const perk = PERK_BY_ID.get(perkId);
  if (!perk) return [];
  if (perk.kind === 'damagePct') state.damageBonus += totalDamage(state, config) * perk.value;
  if (perk.kind === 'fireRatePct') state.fireRateBonus += totalFireRate(state, config) * perk.value;
  if (perk.kind === 'heal') state.hp = Math.min(state.maxHp, state.hp + perk.value);
  state.paused = false;
  return [{ type: 'perkApplied', title: perk.title }];
}
