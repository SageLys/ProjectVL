import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng } from '../types';
import { fireTrigger } from '../effects/interpreter';

export function getActiveMergeCopies(): number {
  return cfg.economy.placeholderAssumptions.twoCopyMerge ? 2 : cfg.economy.mergeCopiesWhenTwoCopyDisabled;
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
    outer: for (let i = 0; i < state.cards.length; i++) {
      const a = state.cards[i];
      if (!a || a.star >= maxStar) continue;
      const partners: number[] = [];
      for (let j = i + 1; j < state.cards.length && partners.length < mergeCopies - 1; j++) {
        const b = state.cards[j];
        if (b && a.type === b.type && a.star === b.star) partners.push(j);
      }
      if (partners.length === mergeCopies - 1) {
        const resultStar = a.star + 1;
        state.cards[i] = { id: state.nextCardId++, type: a.type, star: resultStar };
        for (const j of partners) state.cards[j] = null;
        state.merges++;
        merged++;
        events.push({ type: 'merged', cardType: a.type, resultStar });
        events.push(...fireTrigger(state, config, rng, 'onMerge', { merge: { cardType: a.type, resultStar } }));
        changed = true;
        break outer;
      }
    }
  }
  return { merged, events };
}
