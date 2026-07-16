import { cfg } from '../../config';
import type { Card, Config, GameEvent, GameState, Rng, SlotKind } from '../types';
import { autoMergeCards } from './cardSystem';
import { getSkillDef, releaseConsumable, fireTrigger } from '../effects/interpreter';

function collectionFor(state: GameState, kind: SlotKind): (Card | null)[] {
  return kind === 'cards' ? state.cards : state.equipment;
}

function feed(state: GameState, config: Config, rng: Rng, source: (Card | null)[], sourceIndex: number, target: Card, targetIndex: number): GameEvent[] {
  target.star++;
  source[sourceIndex] = null;
  state.merges++;
  state.equipOps++;
  const events: GameEvent[] = [{ type: 'fed', cardType: target.type, resultStar: target.star, slotIndex: targetIndex, targetCardId: target.id }];
  events.push(...fireTrigger(state, config, rng, 'onMerge', { merge: { cardType: target.type, resultStar: target.star } }));
  return events;
}

function duplicateEquippedType(cards: (Card | null)[], moving: Card, skipIndex: number): Card | null {
  for (let i = 0; i < cards.length; i++) {
    if (i === skipIndex) continue;
    const card = cards[i];
    if (card?.type === moving.type) return card;
  }
  return null;
}

/**
 * 手牌内部可移动/交换；手牌拖入装备格后持续生效。
 * 装备卡不能通过本函数返回手牌；同型同星拖到已装备卡只执行喂养。
 */
export function moveOrSwap(state: GameState, config: Config, rng: Rng, sourceKind: SlotKind, sourceIndex: number, targetKind: SlotKind, targetIndex: number): GameEvent[] {
  if (sourceKind === targetKind && sourceIndex === targetIndex) return [];
  if (sourceKind === 'equipment' && targetKind !== 'equipment') return [];
  const source = collectionFor(state, sourceKind);
  const target = collectionFor(state, targetKind);
  const moving = source[sourceIndex];
  if (!moving) return [];
  const replaced = target[targetIndex];

  if (cfg.economy.placeholderAssumptions.feedEquipped && cfg.economy.feedEquipped && replaced && targetKind === 'equipment' && replaced.type === moving.type && replaced.star === moving.star && replaced.star < cfg.economy.maxStar) {
    return feed(state, config, rng, source, sourceIndex, replaced, targetIndex);
  }

  if (targetKind === 'equipment') {
    if (moving.star < cfg.economy.equipThreshold) return [{ type: 'equipRejected', reason: 'star' }];
    if (cfg.economy.placeholderAssumptions.distinctEquippedTypes && cfg.economy.equipDistinctTypes && duplicateEquippedType(state.equipment, moving, targetIndex)) {
      return [{ type: 'equipRejected', reason: 'duplicate' }];
    }
    if (sourceKind === 'cards' && replaced) return [{ type: 'equipFull' }];
  }

  target[targetIndex] = moving;
  source[sourceIndex] = replaced ?? null;
  state.equipOps++;
  const events: GameEvent[] = targetKind === 'equipment' && sourceKind === 'cards'
    ? [{ type: 'equipped', cardType: moving.type, star: moving.star, slotIndex: targetIndex }]
    : replaced ? [{ type: 'swapped', a: moving.type, b: replaced.type }] : [];
  const { merged, events: mergeEvents } = (targetKind === 'cards' || sourceKind === 'cards')
    ? autoMergeCards(state, config, rng)
    : { merged: 0, events: [] as GameEvent[] };
  if (!replaced && !(targetKind === 'equipment' && sourceKind === 'cards')) events.push({ type: 'moved', cardType: moving.type, merges: merged });
  events.push(...mergeEvents);
  return events;
}

/** 从手牌或装备栏消耗卡牌，并在指定落点释放。 */
export function consumeCard(state: GameState, config: Config, rng: Rng, sourceIndex: number, x: number, y: number, sourceKind: SlotKind = 'cards'): GameEvent[] {
  const source = collectionFor(state, sourceKind);
  const card = source[sourceIndex];
  if (!card) return [];
  source[sourceIndex] = null;
  state.consumes++;
  const events: GameEvent[] = [{ type: 'skillConsumed', cardType: card.type, star: card.star, x, y }];
  if (getSkillDef(card.type)) events.push(...releaseConsumable(state, config, rng, card.type, card.star, x, y));
  return events;
}
