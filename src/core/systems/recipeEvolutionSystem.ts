import { cfg } from '../../config';
import type { EvolutionRecipeDef } from '../../config/types';
import { reconcileEquipmentPassives } from '../effects/interpreter';
import { reconcileMaxHp } from '../stats';
import type { Card, CardRef, Config, GameEvent, GameState, RecipeLineage, Rng, SlotKind } from '../types';
import { autoMergeCards, commitMerge } from './cardSystem';
import { createCardWithAffixes } from './cardAffixSystem';
import { enqueueDecision, registerDecisionResolver } from './decisionQueueSystem';

interface LocatedCard extends CardRef {
  card: Card;
}

export interface ActionableRecipe {
  recipeId: string;
  variable: CardRef;
  anchor: CardRef;
}

export interface RecipeDropMatch {
  recipeId: string;
  source: CardRef;
  target: CardRef;
}

function collectionFor(state: GameState, slotKind: SlotKind): Array<Card | null> {
  return slotKind === 'cards' ? state.cards : state.equipment;
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

function resolveRef(state: GameState, ref: CardRef): LocatedCard | null {
  const card = collectionFor(state, ref.slotKind)[ref.index];
  return card?.id === ref.cardId ? { ...ref, card } : null;
}

function candidatesFor(cards: LocatedCard[], cardType: string, minStar: number): LocatedCard[] {
  return cards
    .filter(item => item.card.type === cardType && item.card.star >= minStar)
    .sort((left, right) => left.card.star - right.card.star
      || (left.slotKind === right.slotKind ? 0 : left.slotKind === 'cards' ? -1 : 1)
      || left.index - right.index);
}

function recipeById(recipeId: string): EvolutionRecipeDef | undefined {
  return cfg.evolutionRecipes.recipes.find(recipe => recipe.id === recipeId);
}

/** Recipes whose two configured material types survived the frozen run roster. */
export function getRosterCompatibleRecipes(state: GameState): EvolutionRecipeDef[] {
  const roster = new Set(state.godPool.runRoster);
  return cfg.evolutionRecipes.recipes.filter(recipe =>
    roster.has(recipe.ingredientVariable.cardId) && roster.has(recipe.ingredientAnchor.cardId));
}

function currentCompatibleIds(state: GameState): Set<string> {
  return new Set(state.recipes.compatibleRecipeIds);
}

function materialCommitment(state: GameState, cardType: string): number {
  return Math.min(16, locatedCards(state)
    .filter(item => item.card.type === cardType)
    .reduce((sum, item) => sum + 2 ** (item.card.star - 1), 0));
}

export function recipeProgress(state: GameState, recipeId: string): [number, number] {
  const recipe = recipeById(recipeId);
  return recipe
    ? [
      materialCommitment(state, recipe.ingredientVariable.cardId),
      materialCommitment(state, recipe.ingredientAnchor.cardId),
    ]
    : [0, 0];
}

export function setPinnedRecipe(state: GameState, recipeId: string | null): boolean {
  if (recipeId !== null && !state.recipes.compatibleRecipeIds.includes(recipeId)) return false;
  state.recipes.pinnedRecipeId = recipeId;
  state.normalDropDirector.roleBag.length = 0;
  state.bountyDirector.rewardBag.length = 0;
  return true;
}

function recipePinResolver(
  state: GameState,
  _config: Config,
  _rng: Rng,
  decision: import('../types').RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'recipePin') return [];
  setPinnedRecipe(state, choice === '__skip__' ? null : choice);
  return [];
}

export function initializeRecipesAfterRosterLock(state: GameState): GameEvent[] {
  state.recipes.compatibleRecipeIds = getRosterCompatibleRecipes(state).map(recipe => recipe.id);
  registerDecisionResolver('recipePin', recipePinResolver);
  const events = recomputeRecipeReadiness(state);
  if (!state.recipes.compatibleRecipeIds.length) return events;
  return [
    ...events,
    ...enqueueDecision(state, {
      kind: 'recipePin',
      candidates: [...state.recipes.compatibleRecipeIds, '__skip__'],
    }),
  ];
}

/** Deterministically selects the lowest-star live pair for every ready, unfinished recipe. */
export function getActionableRecipes(state: GameState): ActionableRecipe[] {
  if (state.recipes.completedRecipeIds.length >= cfg.economy.evolution.maxRecipeCompletions) return [];
  const compatible = currentCompatibleIds(state);
  const completed = new Set(state.recipes.completedRecipeIds);
  const cards = locatedCards(state);
  return cfg.evolutionRecipes.recipes.flatMap(recipe => {
    if (!compatible.has(recipe.id) || completed.has(recipe.id)) return [];
    const variables = candidatesFor(cards, recipe.ingredientVariable.cardId, recipe.ingredientVariable.minStar);
    const anchors = candidatesFor(cards, recipe.ingredientAnchor.cardId, recipe.ingredientAnchor.minStar);
    for (const variable of variables) {
      const anchor = anchors.find(item => item.cardId !== variable.cardId);
      if (!anchor) continue;
      return [{
        recipeId: recipe.id,
        variable: { slotKind: variable.slotKind, index: variable.index, cardId: variable.cardId },
        anchor: { slotKind: anchor.slotKind, index: anchor.index, cardId: anchor.cardId },
      }];
    }
    return [];
  });
}

/** Refreshes ready ids and closes all assistance permanently on the first ready transition. */
export function recomputeRecipeReadiness(state: GameState): GameEvent[] {
  const previous = new Set(state.recipes.readyRecipeIds);
  const ready = getActionableRecipes(state).map(item => item.recipeId);
  state.recipes.readyRecipeIds = ready;
  const newlyReady = ready.filter(recipeId => !previous.has(recipeId));
  if (ready.length && state.recipes.firstReadyWave === null) {
    state.recipes.firstReadyWave = state.wave;
    state.recipes.assistClosed = true;
  }
  const notified = new Set(state.recipes.notifiedRecipeIds);
  const toNotify = newlyReady.filter(recipeId => !notified.has(recipeId));
  for (const recipeId of toNotify) notified.add(recipeId);
  state.recipes.notifiedRecipeIds = [...notified];
  return toNotify.length ? [{ type: 'recipeAvailable', recipeIds: toNotify }] : [];
}

function refsEqual(left: CardRef, right: CardRef): boolean {
  return left.slotKind === right.slotKind && left.index === right.index && left.cardId === right.cardId;
}

/** Pure unordered-pair recognition used before generic move/swap/feed handling. */
export function matchRecipeDrop(state: GameState, source: CardRef, target: CardRef): RecipeDropMatch | null {
  if (source.cardId === target.cardId) return null;
  for (const actionable of getActionableRecipes(state)) {
    const forward = refsEqual(source, actionable.variable) && refsEqual(target, actionable.anchor);
    const reverse = refsEqual(source, actionable.anchor) && refsEqual(target, actionable.variable);
    if (forward || reverse) return { recipeId: actionable.recipeId, source, target };
  }
  return null;
}

type RecipeRejectionReason = Extract<GameEvent, { type: 'recipeRejected' }>['reason'];

function executionRejection(state: GameState, recipeId: string): RecipeRejectionReason | null {
  if (state.mode !== 'playing') return 'mode';
  if (state.decisions.current || state.decisions.pending.length) return 'decision';
  if (state.paused) return 'paused';
  if (state.wavePhase === 'between'
    && (!state.intermission.active || state.intermission.step !== 'free')) return 'intermission';
  if (!['regular', 'boss', 'between', 'validationRewardSettle'].includes(state.wavePhase)) return 'phase';
  if (state.recipes.completedRecipeIds.includes(recipeId)) return 'completed';
  if (state.recipes.completedRecipeIds.length >= cfg.economy.evolution.maxRecipeCompletions) return 'limit';
  return null;
}

function orientedMaterials(
  recipe: EvolutionRecipeDef,
  source: LocatedCard,
  target: LocatedCard,
): { variable: LocatedCard; anchor: LocatedCard } | null {
  const is = (item: LocatedCard, requirement: EvolutionRecipeDef['ingredientVariable']) =>
    item.card.type === requirement.cardId;
  if (is(source, recipe.ingredientVariable) && is(target, recipe.ingredientAnchor)) {
    return { variable: source, anchor: target };
  }
  if (is(target, recipe.ingredientVariable) && is(source, recipe.ingredientAnchor)) {
    return { variable: target, anchor: source };
  }
  return null;
}

function clearRemovedEquipmentRuntime(state: GameState, removedIds: number[]): void {
  const ids = new Set(removedIds.map(String));
  for (const key of Object.keys(state.intervalClocks)) {
    const parts = key.split(':');
    const sourceId = parts[0] === 'aura' || parts[0] === 'weapon' ? parts[1] : parts[0];
    if (ids.has(sourceId)) delete state.intervalClocks[key];
  }
  for (const key of Object.keys(state.cooldowns)) {
    if (ids.has(key.split(':')[1])) delete state.cooldowns[key];
  }
}

/**
 * Nine-step atomic recipe transaction. All validation precedes card creation, so
 * every rejection preserves slots, ids, affix templates and RNG consumption.
 */
export function evolveRecipePair(
  state: GameState,
  config: Config,
  rng: Rng,
  recipeId: string,
  sourceRef: CardRef,
  targetRef: CardRef,
): GameEvent[] {
  const rejected = executionRejection(state, recipeId);
  if (rejected) return [{ type: 'recipeRejected', recipeId, reason: rejected }];

  const recipe = recipeById(recipeId);
  if (!recipe || !state.recipes.compatibleRecipeIds.includes(recipeId)) {
    return [{ type: 'recipeRejected', recipeId, reason: 'materials' }];
  }
  const source = resolveRef(state, sourceRef);
  const target = resolveRef(state, targetRef);
  if (!source || !target || source.cardId === target.cardId) {
    return [{ type: 'recipeRejected', recipeId, reason: 'stale' }];
  }
  if (source.card.provisional || target.card.provisional) {
    return [{ type: 'recipeRejected', recipeId, reason: 'provisional' }];
  }
  const materials = orientedMaterials(recipe, source, target);
  if (!materials) return [{ type: 'recipeRejected', recipeId, reason: 'materials' }];
  if (materials.variable.card.star < recipe.ingredientVariable.minStar
    || materials.anchor.card.star < recipe.ingredientAnchor.minStar) {
    return [{ type: 'recipeRejected', recipeId, reason: 'star' }];
  }
  const outputDef = cfg.skills.cards.find(card => card.id === recipe.outputCardId);
  const targetSlots = collectionFor(state, target.slotKind);
  if (!outputDef || !outputDef.recipeOnly || target.index < 0 || target.index >= targetSlots.length) {
    return [{ type: 'recipeRejected', recipeId, reason: 'slots' }];
  }

  const sourceWasEquipment = source.slotKind === 'equipment';
  const targetWasEquipment = target.slotKind === 'equipment';
  collectionFor(state, source.slotKind)[source.index] = null;
  targetSlots[target.index] = null;
  const created = createCardWithAffixes(state, rng, recipe.outputCardId, recipe.outputStar);
  const output = created.card;
  output.evolutionPath = [];
  output.primaryGod = outputDef.primaryGod;
  output.sourceGods = outputDef.sourceGods ? [...outputDef.sourceGods] : undefined;
  output.recipeLineage = {
    recipeId,
    materials: [materials.variable, materials.anchor].map(item => ({
      cardType: item.card.type,
      evolutionPath: [...(item.card.evolutionPath ?? [])],
    })) as RecipeLineage['materials'],
  };
  targetSlots[target.index] = output;
  state.recipes.completedRecipeIds.push(recipeId);

  const events: GameEvent[] = [...created.events, {
    type: 'recipeCompleted',
    recipeId,
    outputCardType: output.type,
    outputStar: output.star,
    outputCardId: output.id,
    target: { slotKind: target.slotKind, index: target.index },
    materialCardIds: [materials.variable.card.id, materials.anchor.card.id],
  }];
  events.push(...commitMerge(state, config, rng, output.type, output.star, 'recipe'));
  events.push(...autoMergeCards(state, config, rng).events);
  if (sourceWasEquipment || targetWasEquipment) clearRemovedEquipmentRuntime(state, [source.cardId, target.cardId]);
  reconcileMaxHp(state);
  events.push(...reconcileEquipmentPassives(state, config, rng));
  events.push(...recomputeRecipeReadiness(state));
  return events;
}

/** Compatibility query for presentation code; recipe execution is drag-only. */
export function availableRecipes(state: GameState): Array<{ recipeId: string; a: CardRef; b: CardRef }> {
  return getActionableRecipes(state).map(item => ({ recipeId: item.recipeId, a: item.variable, b: item.anchor }));
}

/** Compatibility entrypoint used by replay/debug callers; output lands in the second card's slot. */
export function confirmRecipe(
  state: GameState,
  config: Config,
  rng: Rng,
  recipeId: string,
  aCardId: number,
  bCardId: number,
): GameEvent[] {
  const cards = locatedCards(state);
  const a = cards.find(item => item.cardId === aCardId);
  const b = cards.find(item => item.cardId === bCardId);
  if (!a || !b) return [{ type: 'recipeRejected', recipeId, reason: 'stale' }];
  return evolveRecipePair(state, config, rng, recipeId, a, b);
}

/** Director hook; later stages add pool, weight and checkpoint interventions here. */
export function updateRecipeDirector(state: GameState): GameEvent[] {
  if (state.wave >= cfg.economy.evolution.assistWindowWaves[0]
    && state.recipes.pinnedRecipeId === null
    && state.recipes.compatibleRecipeIds.length) {
    const ranked = [...state.recipes.compatibleRecipeIds].sort((left, right) => {
      const a = recipeProgress(state, left);
      const b = recipeProgress(state, right);
      return (b[0] + b[1]) - (a[0] + a[1]) || left.localeCompare(right);
    });
    setPinnedRecipe(state, ranked[0]);
  }
  return recomputeRecipeReadiness(state);
}
