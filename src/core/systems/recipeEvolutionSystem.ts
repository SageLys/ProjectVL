import { cfg } from '../../config';
import type { EvolutionRecipeDef } from '../../config/types';
import { reconcileEquipmentPassives } from '../effects/interpreter';
import { reconcileMaxHp } from '../stats';
import type { Card, CardRef, Config, GameEvent, GameState, Rng, SlotKind } from '../types';
import { autoMergeCards, commitMerge } from './cardSystem';
import { createCardWithAffixes } from './cardAffixSystem';

interface LocatedCard extends CardRef {
  card: Card;
}

function locatedCards(state: GameState): LocatedCard[] {
  const result: LocatedCard[] = [];
  const add = (slotKind: SlotKind, cards: Array<Card | null>) => {
    cards.forEach((card, index) => {
      if (card && !card.provisional) result.push({ slotKind, index, cardId: card.id, card });
    });
  };
  add('cards', state.cards);
  add('equipment', state.equipment);
  return result;
}

function candidatesFor(cards: LocatedCard[], cardType: string, minStar: number): LocatedCard[] {
  return cards
    .filter(item => item.card.type === cardType && item.card.star >= minStar)
    .sort((left, right) => left.card.star - right.card.star
      || (left.slotKind === right.slotKind ? 0 : left.slotKind === 'cards' ? -1 : 1)
      || left.index - right.index);
}

function defaultMaterials(state: GameState, recipe: EvolutionRecipeDef): [LocatedCard, LocatedCard] | null {
  const cards = locatedCards(state);
  const candidatesA = candidatesFor(cards, recipe.ingredientA.cardId, recipe.ingredientA.minStar);
  const candidatesB = candidatesFor(cards, recipe.ingredientB.cardId, recipe.ingredientB.minStar);
  for (const a of candidatesA) {
    const b = candidatesB.find(candidate => candidate.cardId !== a.cardId);
    if (b) return [a, b];
  }
  return null;
}

/** Returns one deterministic, lowest-star material selection for each satisfiable fixed recipe. */
export function availableRecipes(state: GameState): Array<{ recipeId: string; a: CardRef; b: CardRef }> {
  return cfg.evolutionRecipes.recipes.flatMap(recipe => {
    const materials = defaultMaterials(state, recipe);
    if (!materials) return [];
    const [a, b] = materials;
    return [{
      recipeId: recipe.id,
      a: { slotKind: a.slotKind, index: a.index, cardId: a.cardId },
      b: { slotKind: b.slotKind, index: b.index, cardId: b.cardId },
    }];
  });
}

function findById(state: GameState, cardId: number): LocatedCard | null {
  return locatedCards(state).find(item => item.cardId === cardId) ?? null;
}

function isMaterial(item: LocatedCard | null, requirement: EvolutionRecipeDef['ingredientA']): item is LocatedCard {
  return item !== null
    && item.card.type === requirement.cardId
    && item.card.star >= requirement.minStar;
}

function slotsFor(state: GameState, ref: CardRef): Array<Card | null> {
  return ref.slotKind === 'cards' ? state.cards : state.equipment;
}

/**
 * Completes one fixed recipe. The API accepts only a configured recipe id and
 * the two exact material instance ids; arbitrary card-pair fusion is not exposed.
 */
export function confirmRecipe(
  state: GameState,
  config: Config,
  rng: Rng,
  recipeId: string,
  aCardId: number,
  bCardId: number,
): GameEvent[] {
  const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === recipeId);
  if (!state.intermission.active || state.wavePhase !== 'between') {
    return [{ type: 'recipeRejected', recipeId, reason: 'phase' }];
  }

  const a = findById(state, aCardId);
  const b = findById(state, bCardId);
  if (
    !recipe
    || aCardId === bCardId
    || !isMaterial(a, recipe.ingredientA)
    || !isMaterial(b, recipe.ingredientB)
  ) return [{ type: 'recipeRejected', recipeId, reason: 'materials' }];

  const outputDef = cfg.skills.cards.find(card => card.id === recipe.outputCardId);
  const emptyHandIndex = state.cards.findIndex(card => card === null);
  const outputRef: CardRef = emptyHandIndex >= 0
    ? { slotKind: 'cards', index: emptyHandIndex, cardId: -1 }
    : { slotKind: a.slotKind, index: a.index, cardId: -1 };
  const outputSlots = slotsFor(state, outputRef);
  if (!outputDef || outputRef.index < 0 || outputRef.index >= outputSlots.length) {
    return [{ type: 'recipeRejected', recipeId, reason: 'slots' }];
  }

  slotsFor(state, a)[a.index] = null;
  slotsFor(state, b)[b.index] = null;
  const created = createCardWithAffixes(state, rng, recipe.outputCardId, recipe.outputStar);
  const output = created.card;
  output.evolutionPath = [];
  outputSlots[outputRef.index] = output;
  state.completedRecipes.push(recipe.id);

  const events: GameEvent[] = [{
    type: 'recipeCompleted',
    recipeId: recipe.id,
    outputCardType: output.type,
    outputStar: output.star,
  }];
  events.push(...created.events);
  events.push(...commitMerge(state, config, rng, output.type, output.star, 'recipe'));
  events.push(...autoMergeCards(state, config, rng).events);
  reconcileMaxHp(state);
  events.push(...reconcileEquipmentPassives(state, config, rng));
  return events;
}
