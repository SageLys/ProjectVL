import { cfg } from '../../config';
import type { Config, Enemy, GameEvent, GameState, Rng } from '../types';
import { spawnBountyRewards } from './dropSystem';
import { canIssueGameplayCommand } from '../gameplayCommand';

export type BountyRemovalReason = 'breach' | 'summon';

/**
 * 在每波开始时只做一次概率判定。命中后由下一只生成的普通敌人承载 offer，
 * 因而每波至多出现一个 bounty，且关闭机制/低于启用波次时不消费 RNG。
 */
export function rollBountyForWave(state: GameState, rng: Rng): void {
  const bounty = cfg.skills.mechanisms.bounty;
  state.bountyWavePending = bounty.enabled
    && state.wave >= bounty.enabledFromWave
    && rng() < bounty.spawnChancePerWave;
}

/** 把本波已命中的赏金机会挂到一只未强化的普通敌人上。 */
export function offerPendingBounty(state: GameState, enemy: Enemy): GameEvent[] {
  if (!state.bountyWavePending || enemy.type !== 'normal') return [];
  const bounty = cfg.skills.mechanisms.bounty;
  state.bountyWavePending = false;
  enemy.bounty = { phase: 'offered', remaining: bounty.markWindowSeconds };
  state.bountyOffered++;
  return [{ type: 'bountyOffered', enemyId: enemy.id, windowSeconds: bounty.markWindowSeconds }];
}

/** 命中画布坐标处最近的、仍可接单的赏金目标。 */
export function findBountyOfferAt(
  state: GameState,
  x: number,
  y: number,
  hitPadding = cfg.skills.mechanisms.bounty.hitRadiusPadding,
): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.bounty?.phase !== 'offered' || enemy.bounty.remaining <= 0) continue;
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance <= enemy.r + hitPadding && distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 点击接单：HP 与 maxHP 同乘，保持接单瞬间的血量比例；速度永久乘算。
 * 只有玩家主动接单后才强化，offer 过期本身不会改变任何战斗数值。
 */
export function acceptBountyAt(
  state: GameState,
  _config: Config,
  x: number,
  y: number,
  hitPadding = cfg.skills.mechanisms.bounty.hitRadiusPadding,
): GameEvent[] {
  if (!canIssueGameplayCommand(state)) return [];
  const enemy = findBountyOfferAt(state, x, y, hitPadding);
  if (!enemy) return [];

  const enrage = cfg.skills.mechanisms.bounty.acceptEffects.enrage;
  enemy.hp *= enrage.hpMul;
  enemy.maxHp *= enrage.hpMul;
  enemy.speed *= enrage.speedMul;
  enemy.bounty = { phase: 'accepted', remaining: 0 };
  state.bountyAccepted++;
  return [{ type: 'bountyAccepted', enemyId: enemy.id }];
}

/** 推进所有未接单窗口；超时仅撤销标记，不强化、不扣血。 */
export function tickBountyOffers(state: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (const enemy of state.enemies) {
    if (enemy.bounty?.phase !== 'offered') continue;
    enemy.bounty.remaining -= dt;
    if (enemy.bounty.remaining > 0) continue;
    delete enemy.bounty;
    state.bountyExpired++;
    events.push({ type: 'bountyExpired', enemyId: enemy.id, reason: 'timeout' });
  }
  return events;
}

/**
 * 敌人以突破/撞召唤物方式离场时结清赏金状态。
 * 未接单记为错过；已接单记为失败，但不额外施加惩罚。
 */
export function settleRemovedBounty(
  state: GameState,
  enemy: Enemy,
  reason: BountyRemovalReason,
): GameEvent[] {
  if (enemy.bounty?.phase === 'accepted') {
    state.bountyFailed++;
    return [{ type: 'bountyFailed', enemyId: enemy.id, reason }];
  }
  if (enemy.bounty?.phase === 'offered') {
    state.bountyExpired++;
    return [{ type: 'bountyExpired', enemyId: enemy.id, reason }];
  }
  return [];
}

/**
 * 击杀结清。接单目标由赏金掉落完全取代普通概率掉落，确保 schema 的
 * rewards.dropCount 就是“击杀必掉张数”；未接单目标仍走普通掉落规则。
 */
export function settleKilledBounty(
  state: GameState,
  config: Config,
  rng: Rng,
  enemy: Enemy,
): { handledDrops: boolean; events: GameEvent[] } {
  if (enemy.bounty?.phase === 'accepted') {
    const dropCount = spawnBountyRewards(state, config, rng, enemy);
    state.bountyCompleted++;
    state.bountyRewardDrops += dropCount;
    return {
      handledDrops: true,
      events: [{ type: 'bountyCompleted', enemyId: enemy.id, dropCount }],
    };
  }
  if (enemy.bounty?.phase === 'offered') {
    state.bountyExpired++;
    return {
      handledDrops: false,
      events: [{ type: 'bountyExpired', enemyId: enemy.id, reason: 'killed' }],
    };
  }
  return { handledDrops: false, events: [] };
}
