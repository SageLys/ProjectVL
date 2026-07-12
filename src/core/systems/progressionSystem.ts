import { cfg } from '../../config';
import type { Config, GameEvent, GameState } from '../types';

/** 触发升级：扣需求经验、升级、按成长系数抬高下一级需求、暂停并请求三选一。 */
export function levelUp(state: GameState): GameEvent[] {
  state.xp -= state.xpNeed;
  state.level++;
  state.xpNeed = Math.round(state.xpNeed * cfg.progression.xpGrowth);
  state.paused = true;
  state.pauseReason = 'perk';
  return [{ type: 'levelUp' }];
}

/** 累加经验；达到当前需求则触发一次升级（单次判定不连升）。 */
export function addXp(state: GameState, amount: number): GameEvent[] {
  state.xp += amount;
  // 同一帧可能有多次击杀；已有 perk 待选时只累计经验，禁止叠开多个弹窗。
  if (state.pauseReason === 'perk') return [];
  if (state.xp >= state.xpNeed) return levelUp(state);
  return [];
}

/**
 * 应用升级三选一：伤害/射速进入独立乘数层，回血不超上限。应用后恢复游戏。
 */
export function applyPerk(state: GameState, _config: Config, perkId: string): GameEvent[] {
  if (state.mode !== 'playing' || !state.paused || state.pauseReason !== 'perk') return [];
  const perk = cfg.progression.perks.find(p => p.id === perkId);
  if (!perk) return [];
  if (perk.kind === 'damagePct') state.damagePerkMultiplier *= 1 + perk.value;
  if (perk.kind === 'fireRatePct') state.fireRatePerkMultiplier *= 1 + perk.value;
  if (perk.kind === 'heal') state.hp = Math.min(state.maxHp, state.hp + perk.value);
  state.paused = false;
  state.pauseReason = null;
  const events: GameEvent[] = [{ type: 'perkApplied', title: perk.title }];
  // 同一帧积累出的溢出经验在选择后立刻排下一次选择，避免永久卡在阈值之上。
  if (state.xp >= state.xpNeed) events.push(...levelUp(state));
  return events;
}
