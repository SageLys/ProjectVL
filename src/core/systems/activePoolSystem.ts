import { cfg } from '../../config';
import type { GodId } from '../../config/types';
import type { CardType, GameState, Rng } from '../types';
import { calculateCommitmentScore, getOrCreateCardTypeRunStats } from './dropCommitment';
import { getSelectedGods } from './godPoolSystem';
import { getDroppableCardTypes, isDroppableCardType } from './cardPoolEligibility';

function unique(values: readonly CardType[]): CardType[] {
  return [...new Set(values)];
}

function shuffle<T>(values: readonly T[], rng: Rng): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.min(index, Math.floor(rng() * (index + 1)));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function getRunRoster(state: GameState): CardType[] {
  if (state.godPool.runRoster.length) {
    const roster = state.godPool.runRoster.filter(isDroppableCardType);
    if (roster.length) return roster;
  }
  const selectedRoster = unique(
    getSelectedGods(state).flatMap(id => state.godPool.rosterByGod[id] ?? []),
  ).filter(isDroppableCardType);
  return selectedRoster.length ? selectedRoster : getDroppableCardTypes();
}

export function getActivePool(state: GameState): CardType[] {
  const active = state.godPool.activePool.filter(isDroppableCardType);
  return active.length ? active : getRunRoster(state);
}

export function getGodRoster(state: GameState, god: GodId | null): CardType[] {
  return god ? (state.godPool.rosterByGod[god] ?? []).filter(isDroppableCardType) : [];
}

export function cardGodInRun(state: GameState, type: CardType): GodId | null {
  const ordered = unique([
    ...(state.godPool.focusGod ? [state.godPool.focusGod] : []),
    ...getSelectedGods(state),
  ]);
  return ordered.find(id => state.godPool.rosterByGod[id]?.includes(type)) ?? null;
}

export function isCardFromSelectedGod(state: GameState, type: CardType): boolean {
  return cardGodInRun(state, type) !== null;
}

function mergeReady(state: GameState, type: CardType): boolean {
  const counts = new Map<number, number>();
  for (const card of state.cards) {
    if (card?.type !== type) continue;
    counts.set(card.star, (counts.get(card.star) ?? 0) + 1);
  }
  return [...counts.values()].some(count => count >= cfg.economy.mergeCopies - 1);
}

function protectionRank(state: GameState, type: CardType): [number, number, number, number] {
  const equipped = state.equipment.some(card => card?.type === type) ? 1 : 0;
  const highStar = [...state.cards, ...state.equipment].some(card => card?.type === type && card.star >= 2) ? 1 : 0;
  const ready = mergeReady(state, type) ? 1 : 0;
  return [equipped, highStar, ready, calculateCommitmentScore(state, type)];
}

function compareRank(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function protectedCards(state: GameState): CardType[] {
  const roster = getRunRoster(state);
  const directorActive = state.wave >= cfg.economy.evolution.assistWindowWaves[0]
    && state.wave <= cfg.economy.evolution.assistWindowWaves[1]
    && !state.recipes.assistClosed;
  const pinned = directorActive
    ? cfg.evolutionRecipes.recipes.find(recipe => recipe.id === state.recipes.pinnedRecipeId)
    : undefined;
  const recipeMaterials = pinned
    ? [pinned.ingredientVariable.cardId, pinned.ingredientAnchor.cardId]
      .filter(type => roster.includes(type))
      .slice(0, cfg.economy.evolution.recipeProtectionSlots)
    : [];
  const candidates = roster.filter(type => {
    const rank = protectionRank(state, type);
    return rank[0] > 0 || rank[1] > 0 || rank[2] > 0 || rank[3] > 0;
  });
  const normalProtections = candidates.filter(type => !recipeMaterials.includes(type)).sort((left, right) => {
    const leftSlept = state.godPool.activePool.length > 0
      && !state.godPool.activePool.includes(left) ? 1 : 0;
    const rightSlept = state.godPool.activePool.length > 0
      && !state.godPool.activePool.includes(right) ? 1 : 0;
    return rightSlept - leftSlept
      || compareRank(protectionRank(state, left), protectionRank(state, right))
      || left.localeCompare(right);
  }).slice(0, 3);
  return unique([...recipeMaterials, ...normalProtections]).slice(
    0,
    3 + cfg.economy.evolution.recipeProtectionSlots,
  );
}

function focusPriority(state: GameState, type: CardType): [number, number, number] {
  const stats = getOrCreateCardTypeRunStats(state, type);
  return [
    stats.collected > 0 ? 1 : 0,
    stats.totalShown > 0 ? 1 : 0,
    calculateCommitmentScore(state, type),
  ];
}

function sortedFocusCards(state: GameState, god: GodId | null, wave: number, rng: Rng): CardType[] {
  let cards = shuffle(getGodRoster(state, god), rng);
  if (wave >= 8) {
    const known = cards.filter(type => state.godPool.activePoolHistory.includes(type));
    if (known.length) cards = known;
  }
  return cards.sort((left, right) => (
    compareRank(
      [...focusPriority(state, left), 0],
      [...focusPriority(state, right), 0],
    ) || left.localeCompare(right)
  ));
}

function addUnique(target: CardType[], values: readonly CardType[], limit = 7): void {
  for (const value of values) {
    if (target.length >= limit) return;
    if (!target.includes(value)) target.push(value);
  }
}

function earlyRecruitmentPool(state: GameState, wave: number, rng: Rng): CardType[] {
  if (wave === 1) return unique(getGodRoster(state, state.godPool.mainGod)).slice(0, 5);
  const pool: CardType[] = [];
  const protections = protectedCards(state);
  const newSub = getGodRoster(state, state.godPool.focusGod);
  const mainFocus = sortedFocusCards(state, state.godPool.mainGod, wave, rng).slice(0, 3);
  addUnique(pool, protections);
  addUnique(pool, newSub);
  addUnique(pool, mainFocus);
  return pool.slice(0, 7);
}

function convergencePool(state: GameState, wave: number, rng: Rng): CardType[] {
  const pool: CardType[] = [];
  const protections = protectedCards(state);
  addUnique(pool, protections);
  const focus = sortedFocusCards(state, state.godPool.focusGod, wave, rng);
  const focusTarget = state.godPool.focusGod === state.godPool.mainGod ? 4 : 3;
  addUnique(pool, focus.slice(0, focusTarget));

  if (wave >= 4 && wave <= 6 && pool.length < 7) {
    const pivot = shuffle(
      getSelectedGods(state)
        .filter(id => id !== state.godPool.focusGod)
        .flatMap(id => getGodRoster(state, id))
        .filter(type => !pool.includes(type)),
      rng,
    ).sort((left, right) => calculateCommitmentScore(state, left) - calculateCommitmentScore(state, right));
    addUnique(pool, pivot.slice(0, 1));
  }

  if (wave <= 6 && pool.length < 5) {
    const fillers = getRunRoster(state).filter(type => !pool.includes(type));
    addUnique(pool, shuffle(fillers, rng), 5);
  }
  return pool.slice(0, 7);
}

export function generateActivePool(state: GameState, wave: number, rng: Rng): CardType[] {
  const main = state.godPool.mainGod;
  if (!main) {
    // Headless/debug compatibility: normal game flow always drafts before wave 1.
    state.godPool.previousActivePool = [...state.godPool.activePool];
    state.godPool.activePool = getDroppableCardTypes();
    state.godPool.activePoolHistory = unique([
      ...state.godPool.activePoolHistory,
      ...state.godPool.activePool,
    ]);
    state.godPool.activePoolWave = wave;
    return [...state.godPool.activePool];
  }

  const generated = wave <= 3
    ? earlyRecruitmentPool(state, wave, rng)
    : convergencePool(state, wave, rng);
  state.godPool.previousActivePool = [...state.godPool.activePool];
  state.godPool.activePool = unique(generated).slice(0, 7);
  state.godPool.activePoolHistory = unique([
    ...state.godPool.activePoolHistory,
    ...state.godPool.activePool,
  ]);
  state.godPool.activePoolWave = wave;
  state.normalDropDirector.roleBag.length = 0;
  return [...state.godPool.activePool];
}

export function selectFocusGodCard(state: GameState, rng: Rng): CardType {
  const focusRoster = getGodRoster(state, state.godPool.focusGod)
    .filter(type => getRunRoster(state).includes(type));
  const candidates = focusRoster.length ? focusRoster : getActivePool(state);
  const weights = candidates.map(type => Math.max(0.5, calculateCommitmentScore(state, type) + 0.5));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let index = 0; index < candidates.length; index++) {
    roll -= weights[index];
    if (roll < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}
