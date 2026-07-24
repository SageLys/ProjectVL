import { cfg } from '../../config';
import type { CardType, CardTypeRunStats, GameState } from '../types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function emptyTypeStats(): CardTypeRunStats {
  return {
    ordinaryShown: 0,
    totalShown: 0,
    collected: 0,
    mergeOps: 0,
    highestStarReached: 0,
    lastOrdinaryShownAt: 0,
  };
}

export function getOrCreateCardTypeRunStats(state: GameState, type: CardType): CardTypeRunStats {
  return state.normalDropDirector.typeStats[type]
    ?? (state.normalDropDirector.typeStats[type] = emptyTypeStats());
}

export function calculateBuildMaturity(state: GameState): number {
  const maturity = cfg.economy.normalDropTypePolicy.maturity;
  const highestStarReached = Object.values(state.normalDropDirector.typeStats)
    .reduce((highest, stats) => Math.max(highest, stats.highestStarReached), 0);
  const equippedTypes = state.equipment.filter(card => card !== null).length;
  return clamp01(
    maturity.mergeWeight * clamp01(state.merges / Math.max(Number.EPSILON, maturity.fullMergeOps))
      + maturity.starWeight * clamp01(
        (highestStarReached - 1) / Math.max(Number.EPSILON, maturity.fullHighestStar - 1),
      )
      + maturity.equipWeight * clamp01(
        equippedTypes / Math.max(Number.EPSILON, maturity.fullEquippedTypes),
      ),
  );
}

export function calculateCommitmentScore(state: GameState, type: CardType): number {
  const policy = cfg.economy.normalDropTypePolicy.build;
  let score = 0;
  for (const card of [...state.cards, ...state.equipment]) {
    if (card?.type === type) score += 2 ** Math.max(0, card.star - 1);
  }
  const stats = getOrCreateCardTypeRunStats(state, type);
  score += policy.historicalMergeWeight * Math.min(stats.mergeOps, policy.historicalMergeCap);
  const equipped = state.equipment.find(card => card?.type === type);
  if (equipped) {
    score += policy.equippedBaseBonus
      + policy.equippedStarBonus * (equipped.star - cfg.economy.equipThreshold);
  }
  return Math.max(0, score);
}
