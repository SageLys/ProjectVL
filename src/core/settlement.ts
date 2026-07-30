import { cfg } from '../config';
import type { BuildTag } from './effects/defs';
import type { Card, CardType, GameState } from './types';

export interface RunSummary {
  win: boolean;
  score: { total: number; win: number; waves: number; kills: number; hp: number; build: number; wildcards: number };
  clearedWaves: number;
  topLane: BuildTag | null;
  highestCard: { type: CardType; star: number } | null;
  cardEvolutions: Array<{ type: CardType; highestStar: number; path: string[] }>;
  completedRecipes: string[];
  assistBudgetUsed: number;
}

const BUILD_TAGS: BuildTag[] = ['projectile', 'control', 'domain', 'defense', 'utility'];

function highestCard(cards: Array<Card | null>): RunSummary['highestCard'] {
  let highest: Card | null = null;
  for (const card of cards) if (card && (!highest || card.star > highest.star)) highest = card;
  return highest ? { type: highest.type, star: highest.star } : null;
}

export function buildRunSummary(state: GameState, win: boolean): RunSummary {
  const settlement = cfg.settlement;
  // TODO: derive and persist buildState.affinity in a separate behavior-changing fix.
  const allCards = [...state.cards, ...state.equipment];
  const clearedWaves = win ? cfg.waves.totalWaves : Math.max(0, state.wave - 1);
  const maxAffinity = Math.max(...BUILD_TAGS.map(tag => state.buildState.affinity[tag]));
  const topLane = maxAffinity > 0
    ? BUILD_TAGS.find(tag => state.buildState.affinity[tag] === maxAffinity) ?? null
    : null;
  const score = {
    win: win ? settlement.winBonus : 0,
    waves: clearedWaves * settlement.perWaveCleared,
    kills: state.kills * settlement.perKill,
    hp: win && state.maxHp > 0
      ? Math.round(Math.max(0, Math.min(1, state.hp / state.maxHp)) * settlement.hpRatioBonusMax)
      : 0,
    build: allCards.reduce((sum, card) => sum + (card ? card.star ** 2 : 0), 0) * settlement.perEquippedStarSquared,
    wildcards: Object.entries(state.wildcards).reduce(
      (sum, [star, count]) => sum + count * (settlement.wildcardStarValue[star] ?? 0),
      0,
    ),
    total: 0,
  };
  score.total = score.win + score.waves + score.kills + score.hp + score.build + score.wildcards;
  const highestByType = new Map<CardType, Card>();
  for (const card of allCards) {
    if (!card) continue;
    const current = highestByType.get(card.type);
    if (
      !current
      || card.star > current.star
      || (card.star === current.star && (card.evolutionPath?.length ?? 0) > (current.evolutionPath?.length ?? 0))
    ) highestByType.set(card.type, card);
  }
  const cardEvolutions = new Map<CardType, { type: CardType; highestStar: number; path: string[] }>();
  for (const [type, stats] of Object.entries(state.normalDropDirector.typeStats)) {
    if (stats.highestStarReached <= 0) continue;
    cardEvolutions.set(type, { type, highestStar: stats.highestStarReached, path: [] });
  }
  for (const card of highestByType.values()) {
    const recorded = cardEvolutions.get(card.type);
    if (!recorded || card.star >= recorded.highestStar) {
      cardEvolutions.set(card.type, {
        type: card.type,
        highestStar: Math.max(card.star, recorded?.highestStar ?? 0),
        path: [...(card.evolutionPath ?? recorded?.path ?? [])],
      });
    }
  }
  return {
    win,
    score,
    clearedWaves,
    topLane,
    highestCard: highestCard(allCards),
    cardEvolutions: [...cardEvolutions.values()]
      .sort((a, b) => a.type.localeCompare(b.type)),
    completedRecipes: [...state.recipes.completedRecipeIds],
    assistBudgetUsed: state.recipes.assistBudgetUsed,
  };
}
