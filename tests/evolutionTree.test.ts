import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { buildRunSummary } from '../src/core/settlement';
import { resolveCardBindings } from '../src/core/effects/interpreter';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { clearDecisionResolvers, enqueueDecision, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { collectDrop, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { jumpToWave } from '../src/core/systems/waveSystem';
import { grantWildcards, useWildcardOnSlot } from '../src/core/systems/wildcardSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(() => {
  resetTestEnv();
  clearDecisionResolvers();
});

function pierceDef() {
  const def = cfg.skills.cards.find(item => item.id === 'pierce');
  if (!def) throw new Error('missing pierce');
  return def;
}

describe('single-card evolution tree', () => {
  it('2★+2★ consumes both materials and creates one provisional 3★ decision product', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 2);
    state.cards[1] = card('pierce', 2);

    const result = autoMergeCards(state, config, rng);
    const product = state.cards.find(Boolean)!;
    expect(result.merged).toBe(1);
    expect(state.cards.filter(Boolean)).toHaveLength(1);
    expect(product).toMatchObject({ type: 'pierce', star: 3, provisional: true });
    expect(state.decisions.current).toMatchObject({
      kind: 'evolutionBranch',
      cardType: 'pierce',
      checkpointStar: 3,
      provisionalCardId: product.id,
    });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'evolutionBranchOffered',
      provisionalCardId: product.id,
    }));

    resolveCurrentDecision(state, config, rng, 'pierceA');
    expect(product.provisional).toBe(false);
    expect(product.evolutionPath).toEqual(['3:pierceA']);
    expect(state.runBuild.evolutionChoices.pierce?.[3]).toBe('pierceA');
    expect(state.decisions.current).toBeNull();
  });

  it('later copies inherit the family route and do not ask again', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 2);
    state.cards[1] = card('pierce', 2);
    autoMergeCards(state, config, rng);
    resolveCurrentDecision(state, config, rng, 'pierceB');

    state.cards[1] = card('pierce', 2);
    state.cards[2] = card('pierce', 2);
    autoMergeCards(state, config, rng);
    const inherited = state.cards.filter(Boolean);
    expect(inherited).toHaveLength(1);
    expect(inherited[0]).toMatchObject({ star: 4, evolutionPath: ['3:pierceB'] });
    expect(inherited[0]?.provisional).not.toBe(true);
    expect(state.decisions.current).toBeNull();
  });

  it('stacks branch 3, persistent shared-4 amplify, independent branch 5, and shared 6', () => {
    const def = pierceDef();
    const path = ['3:pierceA', '5:pierceB2'];
    const at3 = resolveCardBindings(def, path, 3);
    const at4 = resolveCardBindings(def, path, 4);
    const at5 = resolveCardBindings(def, path, 5);
    const at6 = resolveCardBindings(def, path, 6);

    expect(at3[0].effects[0]).toMatchObject({
      atom: 'pierce',
      params: { count: 2, damageRetention: 0.8 },
    });
    expect(at4[0].effects[0]).toMatchObject({
      atom: 'pierce',
      params: { count: 3, damageRetention: 0.9 },
    });
    expect(at5[0]).toEqual(at4[0]);
    expect(at5.flatMap(binding => binding.effects).map(effect => effect.atom)).toEqual(['pierce', 'pierce']);
    expect(at6.flatMap(binding => binding.effects).map(effect => effect.atom)).toEqual([
      'pierce', 'pierce', 'beamMorph',
    ]);
  });

  it('provisional cards cannot equip, consume, merge, or accept a wildcard; resolution resumes the chain', () => {
    const state = freshState();
    for (let index = 0; index < 4; index++) state.cards[index] = card('pierce', 2);
    expect(autoMergeCards(state, config, rng).merged).toBe(1);
    const provisionalIndex = state.cards.findIndex(item => item?.provisional);
    const provisional = state.cards[provisionalIndex]!;
    expect(state.cards.filter(item => item?.star === 2)).toHaveLength(2);
    expect(autoMergeCards(state, config, rng).merged).toBe(0);
    expect(consumeCard(state, config, rng, provisionalIndex, 0, 0)).toEqual([]);
    expect(moveOrSwap(state, config, rng, 'cards', provisionalIndex, 'equipment', 0)).toEqual([
      { type: 'equipRejected', reason: 'provisional' },
    ]);
    grantWildcards(state, [{ star: 3, count: 1 }]);
    expect(useWildcardOnSlot(state, config, rng, 'cards', provisionalIndex)).toEqual([
      { type: 'wildcardMergeRejected', reason: 'provisional', requiredStar: 3 },
    ]);
    expect(provisional.provisional).toBe(true);

    const events = resolveCurrentDecision(state, config, rng, 'pierceC');
    expect(events.filter(event => event.type === 'merged')).toHaveLength(2);
    expect(state.cards.filter(Boolean)).toHaveLength(1);
    expect(state.cards.find(Boolean)).toMatchObject({
      type: 'pierce',
      star: 4,
      evolutionPath: ['3:pierceC'],
    });
    expect(state.cards.find(Boolean)?.provisional).not.toBe(true);
    expect(state.merges).toBe(3);
  });

  it('the 5★ checkpoint is independent from the locked 3★ choice', () => {
    const state = freshState();
    state.runBuild.evolutionChoices.pierce = { 3: 'pierceA' };
    state.cards[0] = { ...card('pierce', 4), evolutionPath: ['3:pierceA'] };
    state.cards[1] = { ...card('pierce', 4), evolutionPath: ['3:pierceA'] };
    autoMergeCards(state, config, rng);
    const product = state.cards.find(Boolean)!;
    expect(product).toMatchObject({ star: 5, provisional: true, evolutionPath: ['3:pierceA'] });

    resolveCurrentDecision(state, config, rng, 'pierceB2');
    expect(product.evolutionPath).toEqual(['3:pierceA', '5:pierceB2']);
    expect(state.runBuild.evolutionChoices.pierce).toEqual({ 3: 'pierceA', 5: 'pierceB2' });
  });

  it('wildcard upgrades enter the same checkpoint decision flow', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 2);
    grantWildcards(state, [{ star: 2, count: 1 }]);

    const events = useWildcardOnSlot(state, config, rng, 'cards', 0);
    expect(state.cards[0]).toMatchObject({ star: 3, provisional: true });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'evolutionBranchOffered',
      cardType: 'pierce',
      checkpointStar: 3,
    }));
    resolveCurrentDecision(state, config, rng, 'pierceA');
    expect(state.cards[0]).toMatchObject({ star: 3, provisional: false, evolutionPath: ['3:pierceA'] });
  });

  it('direct high-star drops resolve every reached checkpoint in order', () => {
    const state = freshState();
    spawnGroundDrop(state, config, rng, 0, 0, 'pierce', 5, 'debug');
    collectDrop(state, config, rng, state.groundDrops[0]);

    expect(state.cards[0]).toMatchObject({ star: 5, provisional: true });
    expect(state.decisions.current).toMatchObject({ kind: 'evolutionBranch', checkpointStar: 3 });
    resolveCurrentDecision(state, config, rng, 'pierceC');
    expect(state.cards[0]).toMatchObject({ star: 5, provisional: true, evolutionPath: ['3:pierceC'] });
    expect(state.decisions.current).toMatchObject({ kind: 'evolutionBranch', checkpointStar: 5 });
    resolveCurrentDecision(state, config, rng, 'pierceA2');
    expect(state.cards[0]).toMatchObject({
      star: 5,
      provisional: false,
      evolutionPath: ['3:pierceC', '5:pierceA2'],
    });
  });

  it('queues behind an existing build decision without overwriting either choice set', () => {
    const state = freshState();
    enqueueDecision(state, { kind: 'recipeEvolution', recipeId: 'recipe1' });
    state.cards[0] = card('pierce', 2);
    state.cards[1] = card('pierce', 2);
    autoMergeCards(state, config, rng);

    expect(state.decisions.current).toEqual({ kind: 'recipeEvolution', recipeId: 'recipe1' });
    expect(state.decisions.pending).toHaveLength(1);
    expect(state.decisions.pending[0]).toMatchObject({
      kind: 'evolutionBranch',
      options: ['pierceA', 'pierceB', 'pierceC'],
    });
    resolveCurrentDecision(state, config, rng, 'recipe1');
    expect(state.decisions.current).toMatchObject({ kind: 'evolutionBranch' });
    resolveCurrentDecision(state, config, rng, 'pierceB');
    expect(state.decisions.current).toBeNull();
  });

  it('正式卡不再走空路径兼容解析，配方卡只在 6★ 解析终态', () => {
    const formal = cfg.skills.cards.find(item => item.id === 'frost')!;
    expect(resolveCardBindings(formal, [], 6)).toEqual([]);
    const recipe = cfg.skills.cards.find(item => item.id === 'frozenThunder')!;
    expect(resolveCardBindings(recipe, [], 5)).toEqual([]);
    expect(resolveCardBindings(recipe, [], 6)).toEqual(recipe.stars['6'].equip);
  });

  it('jumpToWave preserves run-locked choices and settlement records every family path', () => {
    const state = freshState();
    state.runBuild.evolutionChoices.pierce = { 3: 'pierceA', 5: 'pierceC2' };
    state.cards[0] = { ...card('pierce', 5), evolutionPath: ['3:pierceA', '5:pierceC2'] };
    state.cards[1] = card('frost', 3);

    jumpToWave(state, config, rng, 4);
    expect(state.runBuild.evolutionChoices.pierce).toEqual({ 3: 'pierceA', 5: 'pierceC2' });
    expect(buildRunSummary(state, false).cardEvolutions).toEqual(expect.arrayContaining([
      { type: 'pierce', highestStar: 5, path: ['3:pierceA', '5:pierceC2'] },
      { type: 'frost', highestStar: 3, path: ['3:frostA'] },
    ]));
  });
});
