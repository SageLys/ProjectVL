// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef } from '../src/core/effects/defs';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { buildRunSummary } from '../src/core/settlement';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { getActivePool, getRunRoster, selectFocusGodCard } from '../src/core/systems/activePoolSystem';
import { selectBountyRewardType } from '../src/core/systems/bountySystem';
import { getCardPool, selectUniformCardType } from '../src/core/systems/dropTypePolicy';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { beginIntermission, tickIntermission } from '../src/core/systems/intermissionSystem';
import { availableRecipes, confirmRecipe } from '../src/core/systems/recipeEvolutionSystem';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import { createIntermissionPanel } from '../src/ui/intermissionPanel';
import { renderMergeHints } from '../src/ui/renderMergeHints';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0);

function enterFreeIntermission(state = freshState()) {
  state.wave = 1;
  beginIntermission(state);
  state.intermission.step = 'free';
  state.intermission.freeRemaining = 30;
  return state;
}

function mergePulseDef(): CardDef {
  const equip: BindingDef[] = [{
    trigger: 'onMerge',
    effects: [{ atom: 'mergePulse', params: { damagePerMergeCount: 10, radius: 'all' } }],
  }];
  const consumable = { radius: 100, effects: [{ atom: 'burstDamage' as const, params: { damageMul: 1 } }] };
  return {
    id: 'aegis',
    category: 'defense',
    synergyTags: ['defense'],
    textKey: 'test.aegis',
    teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip },
      '6': { tier: 'transform', equip },
    },
    amplifyAxis: { params: { damageMul: '+1' } },
    consumable: {
      placement: 'point',
      anchors: { '1': consumable, '3': consumable, '6': consumable },
    },
  };
}

beforeEach(() => {
  resetTestEnv();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  resetTestEnv();
});

describe('fixed recipe card evolution', () => {
  it('rejects missing, under-star and combat-phase materials with precise reasons', () => {
    const state = enterFreeIntermission();
    state.cards[0] = card('chainLightning', 4);
    state.cards[1] = card('frost', 5);

    expect(availableRecipes(state)).toEqual([]);
    expect(confirmRecipe(state, config, rng, 'frozenThunder', state.cards[0].id, state.cards[1].id))
      .toEqual([{ type: 'recipeRejected', recipeId: 'frozenThunder', reason: 'materials' }]);

    state.cards[0]!.star = 5;
    state.intermission.active = false;
    state.wavePhase = 'regular';
    expect(confirmRecipe(state, config, rng, 'frozenThunder', state.cards[0]!.id, state.cards[1]!.id))
      .toEqual([{ type: 'recipeRejected', recipeId: 'frozenThunder', reason: 'phase' }]);
  });

  it('consumes exactly two cards and uses material A position when the hand was full', () => {
    const state = enterFreeIntermission();
    state.cards = Array.from({ length: cfg.economy.handSlots }, (_, index) => card(`filler${index}`, 1));
    const a = card('chainLightning', 5);
    const b = card('frost', 5);
    state.cards[2] = a;
    state.cards[5] = b;
    const idsBefore = state.cards.map(item => item!.id);

    const events = confirmRecipe(state, config, rng, 'frozenThunder', a.id, b.id);

    expect(events).toContainEqual({
      type: 'recipeCompleted',
      recipeId: 'frozenThunder',
      outputCardType: 'frozenThunder',
      outputStar: 6,
    });
    expect(state.cards[2]).toMatchObject({ type: 'frozenThunder', star: 6, evolutionPath: [] });
    expect(state.cards[5]).toBeNull();
    expect([...state.cards, ...state.equipment].filter(Boolean)).toHaveLength(idsBefore.length - 1);
    expect([...state.cards, ...state.equipment].some(item => item?.id === a.id || item?.id === b.id)).toBe(false);
  });

  it('selects exact-minimum hand copies first and requires explicit UI opt-in for equipment', () => {
    const state = enterFreeIntermission();
    const high = card('chainLightning', 6);
    const exact = card('chainLightning', 5);
    const frost = card('frost', 5);
    state.cards[0] = high;
    state.cards[1] = exact;
    state.equipment[0] = frost;

    expect(availableRecipes(state)[0]).toMatchObject({
      a: { slotKind: 'cards', cardId: exact.id },
      b: { slotKind: 'equipment', cardId: frost.id },
    });

    const onRecipe = vi.fn();
    const arena = document.createElement('div');
    document.body.append(arena);
    const panel = createIntermissionPanel(arena, { onReady() {}, onRecipe });
    panel.render(state);
    const confirm = arena.querySelector<HTMLButtonElement>('.recipe-confirm')!;
    const equipmentConsent = arena.querySelector<HTMLInputElement>('[data-equipment-card-id]')!;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(onRecipe).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    equipmentConsent.click();
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(onRecipe).toHaveBeenCalledWith('frozenThunder', exact.id, frost.id);
  });

  it('produces a normal equipable and consumable Card, while generic recipe outputs can upgrade later', () => {
    const state = enterFreeIntermission();
    state.cards[0] = card('chainLightning', 5);
    state.cards[1] = card('frost', 5);
    confirmRecipe(state, config, rng, 'frozenThunder', state.cards[0].id, state.cards[1].id);
    const outputIndex = state.cards.findIndex(item => item?.type === 'frozenThunder');

    expect(moveOrSwap(state, config, rng, 'cards', outputIndex, 'equipment', 0))
      .toContainEqual(expect.objectContaining({ type: 'equipped', cardType: 'frozenThunder' }));
    expect(consumeCard(state, config, rng, 0, 100, 100, 'equipment'))
      .toContainEqual(expect.objectContaining({ type: 'skillConsumed', cardType: 'frozenThunder', star: 6 }));
    expect(state.consumes).toBe(1);

    const evolving = enterFreeIntermission();
    const recipe = cfg.evolutionRecipes.recipes[0];
    recipe.outputCardId = 'pierce';
    recipe.outputStar = 2;
    evolving.cards[0] = card('chainLightning', 5);
    evolving.cards[1] = card('frost', 5);
    confirmRecipe(evolving, config, rng, recipe.id, evolving.cards[0].id, evolving.cards[1].id);
    evolving.cards[1] = card('pierce', 2);
    const upgradeEvents = autoMergeCards(evolving, config, rng).events;
    expect(evolving.cards.find(item => item?.type === 'pierce')).toMatchObject({ star: 3, provisional: true });
    expect(upgradeEvents).toContainEqual(expect.objectContaining({ type: 'evolutionBranchOffered', cardType: 'pierce' }));
  });

  it('keeps recipe-only cards out of every random pool and bounty/validation selector', () => {
    const state = freshState();
    state.godPool.runRoster = ['frozenThunder', 'pierce', 'chainLightning'];
    state.godPool.activePool = ['frozenThunder', 'frost'];
    state.godPool.focusGod = 'storm';
    state.godPool.rosterByGod.storm = ['frozenThunder', 'pierce'];

    expect(getCardPool()).not.toContain('frozenThunder');
    expect(getRunRoster(state)).toEqual(['pierce', 'chainLightning']);
    expect(getActivePool(state)).toEqual(['frost']);
    expect(selectBountyRewardType(state, rng)).not.toBe('frozenThunder');
    expect(state.bountyDirector.rewardBag).not.toContain('frozenThunder');
    expect(selectFocusGodCard(state, rng)).toBe('pierce');
    expect(selectUniformCardType(rng)).not.toBe('frozenThunder');
  });

  it('counts one merge, fires onMerge, records completion in summary, and emits telemetry', () => {
    registerSkillDefs([mergePulseDef()]);
    const state = enterFreeIntermission();
    state.cards[0] = card('chainLightning', 5);
    state.cards[1] = card('frost', 5);
    state.equipment[0] = card('aegis', 3);
    state.enemies.push(enemy({ hp: 100, maxHp: 100 }));
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 1,
      getPresetName: () => 'test',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });

    const availability = { type: 'recipeAvailable' as const, recipeIds: ['frozenThunder'] };
    const events = confirmRecipe(state, config, rng, 'frozenThunder', state.cards[0].id, state.cards[1].id);
    telemetry.recordGameEvents([availability, ...events]);

    expect(state.merges).toBe(1);
    expect(state.normalDropDirector.typeStats.frozenThunder.mergeOps).toBe(1);
    expect(state.enemies[0].hp).toBeLessThan(100);
    expect(buildRunSummary(state, false).completedRecipes).toEqual(['frozenThunder']);
    expect(telemetry.getSession().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'recipe_available', recipeIds: ['frozenThunder'] }),
      expect.objectContaining({ type: 'recipe_completed', recipeId: 'frozenThunder', cardType: 'frozenThunder', outputStar: 6 }),
    ]));
  });

  it('emits recipe availability at decide-to-free and shows only a silent combat hint', () => {
    const state = freshState();
    state.cards[0] = card('chainLightning', 5);
    state.cards[1] = card('frost', 5);
    state.wave = 1;
    beginIntermission(state);
    state.intermission.step = 'decide';
    state.godPool.lastDecisionAfterWave = 1;
    state.waveChoiceOfferedWave = 1;
    const transition = tickIntermission(state, 0, rng);
    expect(transition.events).toContainEqual({ type: 'recipeAvailable', recipeIds: ['frozenThunder'] });

    state.intermission.active = false;
    state.wavePhase = 'regular';
    const dock = document.createElement('div');
    renderMergeHints(dock, state);
    expect(dock.querySelector('.recipe-evolution-hint')?.textContent).toContain('存在可进化配方');
    expect(dock.querySelector('.recipe-evolution-hint button')).toBeNull();
  });

  it('exports only fixed-recipe APIs, never an arbitrary fusion entrypoint', async () => {
    const module = await import('../src/core/systems/recipeEvolutionSystem');
    expect(Object.keys(module).sort()).toEqual(['availableRecipes', 'confirmRecipe']);
    expect(confirmRecipe(enterFreeIntermission(), config, rng, 'notARecipe', 1, 2))
      .toEqual([{ type: 'recipeRejected', recipeId: 'notARecipe', reason: 'materials' }]);
  });
});
