import { cfg } from '../../config';
import type { CardType, Config, GameEvent, GameState, Rng } from '../types';
import { fireTrigger } from '../effects/interpreter';
import { getOrCreateCardTypeRunStats } from './dropTypePolicy';
import { finalizeEvolutionUpgrade, inheritEvolutionPath } from './evolutionTreeSystem';
import { createCardWithAffixes } from './cardAffixSystem';

export function getActiveMergeCopies(): number {
  return cfg.economy.placeholderAssumptions.twoCopyMerge ? 2 : cfg.economy.mergeCopiesWhenTwoCopyDisabled;
}

export function commitMerge(state: GameState, config: Config, rng: Rng, cardType: CardType, resultStar: number): GameEvent[] {
  state.merges++;
  const stats = getOrCreateCardTypeRunStats(state, cardType);
  stats.mergeOps++;
  stats.highestStarReached = Math.max(stats.highestStarReached, resultStar);
  return fireTrigger(state, config, rng, 'onMerge', { merge: { cardType, resultStar } });
}

/**
 * Hand cards merge automatically: matching type and star merge into the next star
 * once enough copies exist. The loop continues until no further merge is possible.
 */
export function autoMergeCards(state: GameState, config: Config, rng: Rng): { merged: number; events: GameEvent[] } {
  const { maxStar } = cfg.economy;
  const mergeCopies = getActiveMergeCopies();
  const events: GameEvent[] = [];
  let merged = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const blockedTypes = new Set(
      [...state.cards, ...state.equipment]
        .filter(card => card?.provisional)
        .map(card => card!.type),
    );
    outer: for (let i = 0; i < state.cards.length; i++) {
      const a = state.cards[i];
      if (!a || a.provisional || blockedTypes.has(a.type) || a.star >= maxStar) continue;
      const partners: number[] = [];
      for (let j = i + 1; j < state.cards.length && partners.length < mergeCopies - 1; j++) {
        const b = state.cards[j];
        if (b && !b.provisional && a.type === b.type && a.star === b.star) partners.push(j);
      }
      if (partners.length === mergeCopies - 1) {
        const resultStar = a.star + 1;
        const materials = [a, ...partners.map(index => state.cards[index]!)];
        const created = createCardWithAffixes(state, rng, a.type, resultStar);
        const resultCard = created.card;
        inheritEvolutionPath(state, resultCard, materials);
        state.cards[i] = resultCard;
        for (const j of partners) state.cards[j] = null;
        merged++;
        events.push(...created.events);
        events.push({ type: 'merged', cardType: a.type, resultStar, resultCardId: resultCard.id });
        const evolutionEvents = finalizeEvolutionUpgrade(state, resultCard);
        events.push(...commitMerge(state, config, rng, a.type, resultStar));
        events.push(...evolutionEvents);
        changed = true;
        break outer;
      }
    }
  }
  return { merged, events };
}
