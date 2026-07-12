import { cfg } from '../../config';
import type { Config, GameEvent, GameState } from '../types';

/** 触发升级：扣需求经验、升级、按成长系数抬高下一级需求、暂停并请求三选一。 */
export function levelUp(state: GameState): GameEvent[] {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * cfg.progression.xpGrowth);
  state.paused = true;
  return [{ type: 'levelUp' }];
}

/** 累加经验；达到当前需求则触发一次升级（单次判定不连升）。 */
export function addXp(state: GameState, amount: number): GameEvent[] {
  state.xp += amount;
  if (state.xp >= state.xpNeed) return levelUp(state);
  return [];
}

/**
 * 应用升级三选一：伤害/射速进入独立乘数层，回血不超上限。应用后恢复游戏。
 */
export function applyPerk(state: GameState, _config: Config, perkId: string): GameEvent[] {
  const perk = cfg.progression.perks.find(p => p.id === perkId);
  if (!perk) return [];
  if (perk.kind === 'damagePct') state.damagePerkMultiplier *= 1 + perk.value;
  if (perk.kind === 'fireRatePct') state.fireRatePerkMultiplier *= 1 + perk.value;
  if (perk.kind === 'heal') state.hp = Math.min(state.maxHp, state.hp + perk.value);
  state.paused = false;
  return [{ type: 'perkApplied', title: perk.title }];
}
