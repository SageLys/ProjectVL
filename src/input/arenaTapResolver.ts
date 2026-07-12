import type { Enemy, GameState, GroundDrop } from '../core/types';

export type ArenaTapTarget =
  | { kind: 'bounty'; enemy: Enemy; distance: number; normalizedDistance: number; ambiguous: boolean }
  | { kind: 'drop'; drop: GroundDrop; distance: number; normalizedDistance: number; ambiguous: boolean }
  | { kind: 'empty'; ambiguous: false };

/**
 * 主画面一次点击只能解析为一个意图。掉落与赏金都命中时比较归一化距离；
 * 距离相同（或浮点近似相同）时掉落优先，保证 opt-in 赏金不会因扩张命中圈被误接。
 */
export function resolveArenaTapTarget(
  state: GameState,
  x: number,
  y: number,
  pickupRadius: number,
  bountyPadding: number,
): ArenaTapTarget {
  let dropCandidate: { drop: GroundDrop; distance: number; normalizedDistance: number } | null = null;
  for (const drop of state.groundDrops) {
    const distance = Math.hypot(drop.x - x, drop.y - y);
    if (distance >= pickupRadius) continue;
    if (!dropCandidate || distance < dropCandidate.distance || (distance === dropCandidate.distance && drop.id < dropCandidate.drop.id)) {
      dropCandidate = { drop, distance, normalizedDistance: distance / pickupRadius };
    }
  }

  let bountyCandidate: { enemy: Enemy; distance: number; normalizedDistance: number } | null = null;
  for (const enemy of state.enemies) {
    if (enemy.bounty?.phase !== 'offered' || enemy.bounty.remaining <= 0) continue;
    const radius = enemy.r + bountyPadding;
    const distance = Math.hypot(enemy.x - x, enemy.y - y);
    if (distance > radius) continue;
    if (!bountyCandidate || distance < bountyCandidate.distance || (distance === bountyCandidate.distance && enemy.id < bountyCandidate.enemy.id)) {
      bountyCandidate = { enemy, distance, normalizedDistance: distance / radius };
    }
  }

  if (!dropCandidate && !bountyCandidate) return { kind: 'empty', ambiguous: false };
  if (!dropCandidate && bountyCandidate) return { kind: 'bounty', ...bountyCandidate, ambiguous: false };
  if (dropCandidate && !bountyCandidate) return { kind: 'drop', ...dropCandidate, ambiguous: false };

  // 风险必须主动选择：赏金只有“明显更靠近”时才胜出，平局交给无风险掉落。
  if (bountyCandidate!.normalizedDistance + 1e-9 < dropCandidate!.normalizedDistance) {
    return { kind: 'bounty', ...bountyCandidate!, ambiguous: true };
  }
  return { kind: 'drop', ...dropCandidate!, ambiguous: true };
}
