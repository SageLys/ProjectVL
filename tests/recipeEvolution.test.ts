// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../src/config';
import { buildRunSummary } from '../src/core/settlement';
import { makeCountingRng } from '../src/core/rng';
import {
  evolveRecipePair,
  getActionableRecipes,
  initializeRecipesAfterRosterLock,
  matchRecipeDrop,
  recomputeRecipeReadiness,
  updateRecipeDirector,
} from '../src/core/systems/recipeEvolutionSystem';
import type { CardRef, GameState, SlotKind } from '../src/core/types';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import { createIntermissionPanel } from '../src/ui/intermissionPanel';
import { card, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();

function recipe(index = 0) {
  return cfg.evolutionRecipes.recipes[index];
}

function ref(state: GameState, kind: SlotKind, index: number): CardRef {
  const item = (kind === 'cards' ? state.cards : state.equipment)[index]!;
  return { slotKind: kind, index, cardId: item.id };
}

function readyPair(
  sourceKind: SlotKind = 'cards',
  targetKind: SlotKind = 'cards',
  sourceIndex = 0,
  targetIndex = sourceKind === targetKind ? 1 : 0,
  recipeIndex = 0,
) {
  const state = freshState();
  const item = recipe(recipeIndex);
  state.recipes.compatibleRecipeIds = [item.id];
  (sourceKind === 'cards' ? state.cards : state.equipment)[sourceIndex] = card(item.ingredientVariable.cardId, 5);
  (targetKind === 'cards' ? state.cards : state.equipment)[targetIndex] = card(item.ingredientAnchor.cardId, 5);
  recomputeRecipeReadiness(state);
  return { state, item, source: ref(state, sourceKind, sourceIndex), target: ref(state, targetKind, targetIndex) };
}

beforeEach(() => {
  resetTestEnv();
  document.body.innerHTML = '';
});

describe('instant fixed-recipe evolution', () => {
  it('initializes compatibility after the third god without enqueueing a recipe choice', () => {
    const state = freshState();
    const item = recipe();
    state.godPool.runRoster = [item.ingredientVariable.cardId, item.ingredientAnchor.cardId];
    const events = initializeRecipesAfterRosterLock(state);
    expect(state.recipes.compatibleRecipeIds).toContain(item.id);
    expect(state.decisions).toEqual({ current: null, pending: [] });
    expect(events.some(event => event.type === 'decisionOffered')).toBe(false);
  });

  it('selects one hidden director target deterministically at the assist window and clears stale bags', () => {
    const state = freshState();
    const [first, second] = cfg.evolutionRecipes.recipes.slice(0, 2);
    state.wave = cfg.economy.evolution.assistWindowWaves[0];
    state.recipes.compatibleRecipeIds = [first.id, second.id];
    state.cards[0] = card(second.ingredientVariable.cardId, 4);
    state.cards[1] = card(second.ingredientAnchor.cardId, 3);
    state.normalDropDirector.roleBag.push('discovery');
    state.bountyDirector.rewardBag.push(first.ingredientVariable.cardId);
    updateRecipeDirector(state);
    expect(state.recipes.directedRecipeId).toBe(second.id);
    expect(state.normalDropDirector.roleBag).toEqual([]);
    expect(state.bountyDirector.rewardBag).toEqual([]);
    const selected = state.recipes.directedRecipeId;
    state.cards = state.cards.map(() => null);
    updateRecipeDirector(state);
    expect(state.recipes.directedRecipeId).toBe(selected);
  });

  it.each([
    ['cards', 'cards'],
    ['cards', 'equipment'],
    ['equipment', 'cards'],
    ['equipment', 'equipment'],
  ] as const)('supports %s → %s and always places output in the target slot', (sourceKind, targetKind) => {
    const { state, item, source, target } = readyPair(sourceKind, targetKind);
    const events = evolveRecipePair(state, config, () => 0, item.id, source, target);
    expect((targetKind === 'cards' ? state.cards : state.equipment)[target.index]).toMatchObject({
      type: item.outputCardId,
      star: 6,
      primaryGod: item.anchorGod,
      sourceGods: expect.arrayContaining([item.variableGod, item.anchorGod]),
      recipeLineage: { recipeId: item.id },
    });
    expect((sourceKind === 'cards' ? state.cards : state.equipment)[source.index]).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({
      type: 'recipeCompleted', recipeId: item.id,
      target: { slotKind: targetKind, index: target.index },
    }));
    expect(state.merges).toBe(1);
    expect(state.recipes.completedRecipeIds).toEqual([item.id]);
  });

  it('recognizes the material pair in either drag direction', () => {
    const { state, item, source, target } = readyPair();
    expect(matchRecipeDrop(state, source, target)?.recipeId).toBe(item.id);
    expect(matchRecipeDrop(state, target, source)?.recipeId).toBe(item.id);
  });

  it('allows combat, boss, free intermission, and validation settle', () => {
    for (const phase of ['regular', 'boss', 'validationRewardSettle'] as const) {
      const { state, item, source, target } = readyPair();
      state.wavePhase = phase;
      expect(evolveRecipePair(state, config, () => 0, item.id, source, target))
        .toContainEqual(expect.objectContaining({ type: 'recipeCompleted' }));
    }
    const { state, item, source, target } = readyPair();
    state.wavePhase = 'between';
    state.intermission.active = true;
    state.intermission.step = 'free';
    expect(evolveRecipePair(state, config, () => 0, item.id, source, target))
      .toContainEqual(expect.objectContaining({ type: 'recipeCompleted' }));
  });

  it.each([
    ['paused', (state: GameState) => { state.paused = true; }, 'paused'],
    ['decision', (state: GameState) => { state.decisions.current = { kind: 'godFocus', wave: 2, candidates: ['storm'] }; }, 'decision'],
    ['settle', (state: GameState) => { state.wavePhase = 'between'; state.intermission.active = true; state.intermission.step = 'settle'; }, 'intermission'],
    ['godDecision', (state: GameState) => { state.wavePhase = 'between'; state.intermission.active = true; state.intermission.step = 'godDecision'; }, 'intermission'],
  ])('rejects %s with an exact reason and consumes no RNG', (_label, mutate, reason) => {
    const { state, item, source, target } = readyPair();
    mutate(state);
    const rng = makeCountingRng(123);
    const before = structuredClone(state);
    expect(evolveRecipePair(state, config, rng.rng, item.id, source, target)).toEqual([
      { type: 'recipeRejected', recipeId: item.id, reason },
    ]);
    expect(rng.draws()).toBe(0);
    expect(state).toEqual(before);
  });

  it('rejects stale, under-star, and provisional instances atomically', () => {
    const stale = readyPair();
    stale.state.cards[0] = null;
    expect(evolveRecipePair(stale.state, config, () => 0, stale.item.id, stale.source, stale.target))
      .toEqual([{ type: 'recipeRejected', recipeId: stale.item.id, reason: 'stale' }]);

    const under = readyPair();
    under.state.cards[0]!.star = 4;
    expect(evolveRecipePair(under.state, config, () => 0, under.item.id, under.source, under.target))
      .toEqual([{ type: 'recipeRejected', recipeId: under.item.id, reason: 'star' }]);

    const provisional = readyPair();
    provisional.state.cards[0]!.provisional = true;
    expect(evolveRecipePair(provisional.state, config, () => 0, provisional.item.id, provisional.source, provisional.target))
      .toEqual([{ type: 'recipeRejected', recipeId: provisional.item.id, reason: 'provisional' }]);
  });

  it('enforces once per recipe and the strict run cap of two', () => {
    const first = readyPair();
    evolveRecipePair(first.state, config, () => 0, first.item.id, first.source, first.target);
    expect(evolveRecipePair(first.state, config, () => 0, first.item.id, first.source, first.target))
      .toEqual([{ type: 'recipeRejected', recipeId: first.item.id, reason: 'completed' }]);

    const capped = readyPair();
    capped.state.recipes.completedRecipeIds = cfg.evolutionRecipes.recipes.slice(1, 3).map(item => item.id);
    expect(evolveRecipePair(capped.state, config, () => 0, capped.item.id, capped.source, capped.target))
      .toEqual([{ type: 'recipeRejected', recipeId: capped.item.id, reason: 'limit' }]);
    expect(getActionableRecipes(capped.state)).toEqual([]);
  });

  it('records recipe lineage, validation delivery, settle timing, and assist usage in telemetry', () => {
    const { state, item, source, target } = readyPair();
    state.recipes.assistBudgetUsed = 2;
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 19,
      getPresetName: () => 'recipe-v2',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });
    telemetry.recordGameEvents([
      ...evolveRecipePair(state, config, () => 0, item.id, source, target),
      { type: 'validationRewardGranted', wave: 9, cardType: item.ingredientVariable.cardId, star: 4, delivery: 'hand' },
      { type: 'validationRewardSettleStarted', wave: 9, seconds: 12 },
    ]);
    expect(telemetry.getSession().events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'recipe_completed', recipeId: item.id, targetSlotKind: target.slotKind,
        targetSlotIndex: target.index, assistBudgetUsed: 2,
      }),
      expect.objectContaining({ type: 'validation_reward_granted', delivery: 'hand', assistBudgetUsed: 2 }),
      expect.objectContaining({ type: 'validation_reward_settle_started', settleSeconds: 12, assistBudgetUsed: 2 }),
    ]));
  });

  it('records completion and assistance in the run summary', () => {
    const { state, item, source, target } = readyPair();
    evolveRecipePair(state, config, () => 0, item.id, source, target);
    state.recipes.assistBudgetUsed = 1;
    expect(buildRunSummary(state, false)).toMatchObject({
      completedRecipes: [item.id],
      assistBudgetUsed: 1,
    });
  });

  it('does not render any recipe area during intermission', () => {
    const { state } = readyPair();
    state.wave = 4;
    state.wavePhase = 'between';
    state.intermission.active = true;
    state.intermission.afterWave = 4;
    state.intermission.step = 'free';
    const arena = document.createElement('div');
    const confirmSpy = vi.spyOn(window, 'confirm');
    createIntermissionPanel(arena, { onReady() {} }).render(state);
    expect(arena.querySelector('.recipe-progress-row')).toBeNull();
    expect(arena.querySelector('.intermission-recipes')).toBeNull();
    expect(arena.querySelector('.recipe-confirm')).toBeNull();
    expect(arena.querySelector('[data-equipment-card-id]')).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('exports the complete v2 system surface without arbitrary fusion', async () => {
    const module = await import('../src/core/systems/recipeEvolutionSystem');
    expect(module).toEqual(expect.objectContaining({
      getRosterCompatibleRecipes: expect.any(Function),
      getActionableRecipes: expect.any(Function),
      recomputeRecipeReadiness: expect.any(Function),
      matchRecipeDrop: expect.any(Function),
      evolveRecipePair: expect.any(Function),
      updateRecipeDirector: expect.any(Function),
    }));
    expect(module).not.toHaveProperty('fuseCards');
  });
});
