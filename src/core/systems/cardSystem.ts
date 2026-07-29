import { cfg } from '../../config';
import type { CardType, Config, GameEvent, GameState, Rng } from '../types';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { getOrCreateCardTypeRunStats } from './dropTypePolicy';
import { finalizeEvolutionUpgrade, inheritEvolutionPath } from './evolutionTreeSystem';
import { createCardWithAffixes } from './cardAffixSystem';

export function getActiveMergeCopies(): number {
  return cfg.economy.placeholderAssumptions.twoCopyMerge ? 2 : cfg.economy.mergeCopiesWhenTwoCopyDisabled;
}

export type MergeKind = 'merge' | 'feed' | 'wildcard' | 'recipe';

export const MAX_REFUND_ROUNDS = 4;

export function commitMerge(
  state: GameState,
  config: Config,
  rng: Rng,
  cardType: CardType,
  resultStar: number,
  kind: MergeKind,
): GameEvent[] {
  state.merges++;
  const stats = getOrCreateCardTypeRunStats(state, cardType);
  stats.mergeOps++;
  stats.highestStarReached = Math.max(stats.highestStarReached, resultStar);
  const events = fireTrigger(state, config, rng, 'onMerge', { merge: { cardType, resultStar } });
  if (kind === 'wildcard' || kind === 'recipe') return events;

  const refunds = getModifiers(state).mergeMaterialRefunds.filter(
    rule => rule.scope === 'both' || rule.scope === kind,
  );
  if (refunds.length === 0) return events;
  for (const rule of refunds) {
    if (rng() >= rule.refundChance) continue;
    const star = Math.min(rule.star, resultStar - 1, cfg.economy.maxStar - 1);
    if (star < 1 || rule.count <= 0) continue;
    state.pendingMergeRefunds.push({ cardType, star, count: rule.count });
  }
  return events;
}

export function flushMergeRefunds(state: GameState, _config: Config, rng: Rng): GameEvent[] {
  const pending = state.pendingMergeRefunds.splice(0);
  const events: GameEvent[] = [];
  for (const refund of pending) {
    let granted = 0;
    let lost = 0;
    for (let index = 0; index < refund.count; index++) {
      const slot = state.cards.findIndex(card => card === null);
      if (slot < 0) {
        lost++;
        continue;
      }
      const created = createCardWithAffixes(state, rng, refund.cardType, refund.star);
      state.cards[slot] = created.card;
      granted++;
      events.push(...created.events);
    }
    if (granted > 0 || lost > 0) {
      events.push({ type: 'mergeRefunded', cardType: refund.cardType, star: refund.star, granted, lost });
    }
  }
  return events;
}

function discardPendingMergeRefunds(state: GameState): GameEvent[] {
  const pending = state.pendingMergeRefunds.splice(0);
  return pending
    .filter(refund => refund.count > 0)
    .map(refund => ({
      type: 'mergeRefunded' as const,
      cardType: refund.cardType,
      star: refund.star,
      granted: 0,
      lost: refund.count,
    }));
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
  let refundRounds = 0;
  while (true) {
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
          inheritEvolutionPath(resultCard, materials);
          state.cards[i] = resultCard;
          for (const j of partners) state.cards[j] = null;
          merged++;
          events.push(...created.events);
          events.push({ type: 'merged', cardType: a.type, resultStar, resultCardId: resultCard.id });
          const evolutionEvents = finalizeEvolutionUpgrade(state, resultCard);
          events.push(...commitMerge(state, config, rng, a.type, resultStar, 'merge'));
          events.push(...evolutionEvents);
          changed = true;
          break outer;
        }
      }
    }

    if (state.pendingMergeRefunds.length === 0) break;
    if (refundRounds >= MAX_REFUND_ROUNDS) {
      if (import.meta.env.DEV) console.warn(`[merge-refund] exceeded ${MAX_REFUND_ROUNDS} refund rounds; pending cards discarded`);
      events.push(...discardPendingMergeRefunds(state));
      break;
    }
    refundRounds++;
    const refundEvents = flushMergeRefunds(state, config, rng);
    events.push(...refundEvents);
    const granted = refundEvents.reduce(
      (sum, event) => sum + (event.type === 'mergeRefunded' ? event.granted : 0),
      0,
    );
    if (granted === 0) break;
  }
  return { merged, events };
}
