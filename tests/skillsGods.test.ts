// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef, Trigger } from '../src/core/effects/defs';
import {
  fireTrigger,
  getModifiers,
  reconcileEquipmentPassives,
  registerSkillDefs,
  resolveCardBindings,
  tickIntervalBindings,
} from '../src/core/effects/interpreter';
import { collectDrop, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { getCardPool } from '../src/core/systems/dropTypePolicy';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { beginIntermission } from '../src/core/systems/intermissionSystem';
import { confirmRecipe } from '../src/core/systems/recipeEvolutionSystem';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import type { GameState } from '../src/core/types';
import {
  card,
  constRng,
  createDefaultConfig,
  enemy,
  freshState,
  resetTestEnv,
} from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.25);
const LEGACY_FORMAL = new Set([
  'chainLightning', 'pierce', 'frost', 'impact', 'scorch', 'splitBlast',
  'aegis', 'thorns', 'decoy', 'sanctum', 'harvest',
]);

function formalCards(): CardDef[] {
  return cfg.skills.cards.filter(def => !def.recipeOnly);
}

function enterFreeIntermission(): GameState {
  const state = freshState();
  state.wave = 1;
  beginIntermission(state);
  state.intermission.step = 'free';
  state.intermission.freeRemaining = 30;
  return state;
}

function smokeTrigger(state: GameState, trigger: Trigger, binding: BindingDef): void {
  const target = enemy({ x: 300, y: 300, hp: 10_000, maxHp: 10_000 });
  target.status.frozen = 1;
  state.enemies = [target];
  if (trigger === 'passive') {
    getModifiers(state);
    return;
  }
  if (trigger === 'interval') {
    tickIntervalBindings(state, config, rng, Number(binding.triggerParams?.seconds ?? 1) + 0.01);
    return;
  }
  fireTrigger(state, config, rng, trigger, {
    bullet: { x: 300, y: 300, damage: 10 } as never,
    enemy: target,
    point: { x: 300, y: 300 },
    drop: { id: 1, kind: 'card', x: 300, y: 300, type: 'pierce', star: 1, life: 1, maxLife: 1, pulse: 0 } as never,
    wave: 1,
    damage: 10,
    merge: { cardType: 'pierce', resultStar: 3 },
    source: 'dot',
  });
}

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

describe('C8 five-god formal card matrix', () => {
  it('contains exactly five gods × seven formal cards plus 25 recipe terminals', () => {
    expect(formalCards()).toHaveLength(35);
    expect(cfg.skills.cards.filter(def => def.recipeOnly)).toHaveLength(25);
    expect(cfg.gods.gods).toHaveLength(5);
    for (const god of cfg.gods.gods) {
      expect(god.anchorCardIds).toHaveLength(2);
      expect(god.variableCardIds).toHaveLength(5);
      expect(formalCards().filter(def => def.god === god.id)).toHaveLength(7);
    }
  });

  it('equips and executes every 3★ branch, then resolves the shared 6★ terminal', () => {
    for (const def of formalCards()) {
      const tree = def.evolutionTree!;
      const checkpoint3 = tree.checkpoints.find(checkpoint => checkpoint.star === 3)!;
      const checkpoint5 = tree.checkpoints.find(checkpoint => checkpoint.star === 5)!;
      expect(checkpoint3.options, `${def.id}:3★`).toHaveLength(3);
      expect(checkpoint5.options, `${def.id}:5★`).toHaveLength(3);

      for (const option of checkpoint3.options) {
        const path = [`3:${option.id}`];
        const bindings = resolveCardBindings(def, path, 3);
        expect(bindings.length, `${def.id}:${option.id}`).toBeGreaterThan(0);
        const state = freshState();
        const instance = card(def.id, 3);
        instance.evolutionPath = path;
        state.equipment[0] = instance;
        reconcileEquipmentPassives(state, config, rng);
        for (const binding of bindings) smokeTrigger(state, binding.trigger, binding);
      }

      const terminalPath = [
        `3:${checkpoint3.options[0].id}`,
        `5:${checkpoint5.options[0].id}`,
      ];
      const terminal = tree.sharedNodes.find(node => node.star === 6)!;
      const resolved = resolveCardBindings(def, terminalPath, 6);
      expect(terminal.equip?.length, `${def.id}:6★`).toBeGreaterThan(0);
      expect(resolved.slice(-(terminal.equip?.length ?? 0))).toEqual(terminal.equip);
    }
  });

  it('releases every new formal card at every consumable star without exceptions', () => {
    const newCards = formalCards().filter(def => !LEGACY_FORMAL.has(def.id));
    expect(newCards).toHaveLength(24);
    for (const def of newCards) for (let star = 1; star <= 6; star++) {
      const state = freshState();
      state.cards[0] = card(def.id, star);
      expect(consumeCard(state, config, rng, 0, 300, 300), `${def.id}@${star}`)
        .toContainEqual(expect.objectContaining({
          type: 'skillConsumed',
          cardType: def.id,
          star,
        }));
    }
  });

  it('uses restore and statBuff across at least three distinct cards each', () => {
    const cardsByAtom = (atom: 'restore' | 'statBuff') => new Set(
      cfg.skills.cards
        .filter(def => JSON.stringify(def).includes(`"atom":"${atom}"`))
        .map(def => def.id),
    );
    expect(cardsByAtom('restore').size).toBeGreaterThanOrEqual(3);
    expect(cardsByAtom('statBuff').size).toBeGreaterThanOrEqual(3);
  });
});

describe('C8 recipe and telemetry coverage', () => {
  it('completes all 25 recipes and makes every output equipable and consumable', () => {
    expect(cfg.evolutionRecipes.recipes).toHaveLength(25);
    for (const recipe of cfg.evolutionRecipes.recipes) {
      const state = enterFreeIntermission();
      state.recipes.compatibleRecipeIds = [recipe.id];
      const materialA = card(recipe.ingredientVariable.cardId, recipe.ingredientVariable.minStar);
      const materialB = card(recipe.ingredientAnchor.cardId, recipe.ingredientAnchor.minStar);
      state.cards[0] = materialA;
      state.cards[1] = materialB;
      const events = confirmRecipe(state, config, rng, recipe.id, materialA.id, materialB.id);
      expect(events, recipe.id).toContainEqual(expect.objectContaining({
        type: 'recipeCompleted',
        recipeId: recipe.id,
        outputCardType: recipe.outputCardId,
        outputStar: 6,
      }));
      const outputIndex = state.cards.findIndex(item => item?.type === recipe.outputCardId);
      expect(outputIndex, recipe.id).toBeGreaterThanOrEqual(0);
      expect(moveOrSwap(state, config, rng, 'cards', outputIndex, 'equipment', 0), recipe.id)
        .toContainEqual(expect.objectContaining({ type: 'equipped', cardType: recipe.outputCardId }));
      expect(consumeCard(state, config, rng, 0, 300, 300, 'equipment'), recipe.id)
        .toContainEqual(expect.objectContaining({ type: 'skillConsumed', cardType: recipe.outputCardId }));
    }
  });

  it('excludes all recipe terminals from ordinary drops', () => {
    const recipeIds = new Set(cfg.skills.cards.filter(def => def.recipeOnly).map(def => def.id));
    expect(getCardPool().every(type => !recipeIds.has(type))).toBe(true);
  });

  it('emits god-segmented shown/collected telemetry and affix rolls for a new card', () => {
    const state = freshState();
    state.godPool.mainGod = 'storm';
    state.godPool.runRoster = ['staticSurge'];
    state.godPool.activePool = ['staticSurge'];
    state.godPool.rosterByGod.storm = ['staticSurge'];
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 8,
      getPresetName: () => 'c8',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });
    spawnGroundDrop(state, config, rng, 10, 10, 'staticSurge', 3, 'normalKill');
    telemetry.beforeUpdate();
    telemetry.afterUpdate();
    telemetry.recordGameEvents(collectDrop(state, config, rng, state.groundDrops[0]));

    const events = telemetry.getSession().events.filter(event => event.cardType === 'staticSurge');
    expect(events.map(event => event.type)).toEqual(expect.arrayContaining([
      'card_shown_by_god',
      'card_collected_by_god',
      'affix_rolled',
    ]));
    expect(events.filter(event =>
      event.type === 'card_shown_by_god' || event.type === 'card_collected_by_god')
      .every(event => event.godId === 'storm')).toBe(true);
  });
});
