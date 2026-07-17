import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { rollDropOnKill } from '../src/core/systems/dropSystem';
import { collectDrop, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { moveOrSwap } from '../src/core/systems/equipmentSystem';
import { grantWildcards, useWildcardOnSlot } from '../src/core/systems/wildcardSystem';
import {
  calculateBuildMaturity,
  calculateAffinityScore,
  calculateCommitmentScore,
  getCardPool,
  refillNormalDropRoleBag,
  selectBuildType,
  selectDiscoveryType,
  selectNormalEnemyDropType,
  selectPivotType,
} from '../src/core/systems/dropTypePolicy';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv, seqRng } from './helpers';

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

describe('NormalDropDirector · card pool and discovery', () => {
  it('reads the active configured pool and automatically includes a twelfth card', () => {
    expect(getCardPool()).toHaveLength(11);
    const state = freshState();
    for (const type of getCardPool()) state.normalDropDirector.typeStats[type].ordinaryShown = 1;
    const twelfth = structuredClone(cfg.skills.cards[0]);
    twelfth.id = 'testTwelfth';
    cfg.skills.cards.push(twelfth);
    expect(getCardPool()).toHaveLength(12);
    expect(getCardPool()).toContain('testTwelfth');
    expect(selectDiscoveryType(state, constRng(0.5))).toBe('testTwelfth');
    expect(state.normalDropDirector.typeStats.testTwelfth).toBeDefined();
  });

  it('prioritizes types not yet shown by ordinary drops', () => {
    const state = freshState();
    for (const type of getCardPool()) state.normalDropDirector.typeStats[type].ordinaryShown = 1;
    state.normalDropDirector.typeStats.frost.ordinaryShown = 0;
    expect(selectDiscoveryType(state, constRng(0.5))).toBe('frost');
  });

  it('covers all eleven types within the first twenty ordinary drops', () => {
    const state = freshState();
    const types = Array.from({ length: 20 }, () => selectNormalEnemyDropType(state, constRng(0.37)));
    expect(new Set(types)).toEqual(new Set(getCardPool()));
    expect(state.normalDropDirector.ordinaryDropCount).toBe(20);
  });
});

describe('NormalDropDirector · build and pivot choices', () => {
  it('biases only build choices toward affinity and caps the added score', () => {
    const baseline = freshState();
    const focused = freshState();
    focused.buildState.affinity.projectile = 3;
    const sample = (state: typeof focused, seed: number) => {
      const rng = createSeededRng(seed);
      return Array.from({ length: 300 }, () => selectBuildType(state, rng));
    };
    const projectile = new Set(['pierce', 'chainLightning', 'splitBlast']);
    const baselineHits = sample(baseline, 91).filter(type => projectile.has(type)).length;
    const focusedHits = sample(focused, 91).filter(type => projectile.has(type)).length;
    expect(focusedHits).toBeGreaterThan(baselineHits + 100);

    const capped = freshState();
    capped.buildState.affinity.projectile = cfg.economy.normalDropTypePolicy.affinity.scoreCap
      / cfg.economy.normalDropTypePolicy.affinity.scorePerStack;
    const excessive = freshState();
    excessive.buildState.affinity.projectile = 99;
    expect(calculateAffinityScore(capped, 'pierce')).toBe(cfg.economy.normalDropTypePolicy.affinity.scoreCap);
    expect(sample(capped, 17)).toEqual(sample(excessive, 17));
  });

  it('does not let affinity affect discovery or pivot selection', () => {
    const baseline = freshState();
    baseline.equipment[0] = card('pierce', 6);
    baseline.equipment[1] = card('frost', 5);
    const focused = structuredClone(baseline);
    focused.buildState.affinity.defense = 99;
    const rolls = [0, 0.17, 0.41, 0.76, 0.99];
    expect(rolls.map(roll => selectDiscoveryType(focused, constRng(roll))))
      .toEqual(rolls.map(roll => selectDiscoveryType(baseline, constRng(roll))));
    expect(rolls.map(roll => selectPivotType(focused, constRng(roll))))
      .toEqual(rolls.map(roll => selectPivotType(baseline, constRng(roll))));
  });

  it('uses opening build slots to match held one-star cards, then falls back to discovery when empty', () => {
    const withCard = freshState();
    withCard.cards[0] = card('pierce', 1);
    expect(selectBuildType(withCard, constRng(0.99))).toBe('pierce');

    const empty = freshState();
    for (const type of getCardPool()) empty.normalDropDirector.typeStats[type].ordinaryShown = 1;
    empty.normalDropDirector.typeStats.decoy.ordinaryShown = 0;
    expect(selectBuildType(empty, constRng(0.5))).toBe('decoy');
  });

  it('scores an equipped three-star card far above a loose one-star card', () => {
    const state = freshState();
    state.equipment[0] = card('pierce', 3);
    state.cards[0] = card('frost', 1);
    expect(calculateCommitmentScore(state, 'pierce')).toBe(10);
    expect(calculateCommitmentScore(state, 'frost')).toBe(1);
  });

  it('builds the exact mature 1/7/2 bag and separates pivots between halves', () => {
    const state = freshState();
    state.merges = cfg.economy.normalDropTypePolicy.maturity.fullMergeOps;
    state.equipment[0] = card('pierce', 4);
    state.equipment[1] = card('frost', 3);
    state.normalDropDirector.typeStats.pierce.highestStarReached = 4;
    for (const type of getCardPool()) state.normalDropDirector.typeStats[type].ordinaryShown = 1;
    expect(calculateBuildMaturity(state)).toBe(1);

    refillNormalDropRoleBag(state, constRng(0.42));
    const bag = state.normalDropDirector.roleBag;
    expect(bag).toHaveLength(10);
    expect(bag.filter(role => role === 'discovery')).toHaveLength(1);
    expect(bag.filter(role => role === 'build')).toHaveLength(7);
    expect(bag.filter(role => role === 'pivot')).toHaveLength(2);
    expect(bag.slice(0, 5)).toContain('pivot');
    expect(bag.slice(5)).toContain('pivot');
  });

  it('normalizes pathological role mixes without changing the configured bag length', () => {
    const state = freshState();
    for (const type of getCardPool()) state.normalDropDirector.typeStats[type].ordinaryShown = 1;
    cfg.economy.normalDropTypePolicy.roleBagSize = 4;
    cfg.economy.normalDropTypePolicy.earlyMix = { discovery: 10, build: 10, pivot: 10 };
    cfg.economy.normalDropTypePolicy.lateMix = { discovery: 10, build: 10, pivot: 10 };
    refillNormalDropRoleBag(state, constRng(0.5));
    expect(state.normalDropDirector.roleBag).toHaveLength(4);
    expect(state.normalDropDirector.roleBag.filter(role => role === 'discovery')).toHaveLength(0);
    expect(state.normalDropDirector.roleBag.filter(role => role === 'pivot')).toHaveLength(4);
  });

  it('never selects either of the two highest-investment types for a pivot', () => {
    const state = freshState();
    state.equipment[0] = card('pierce', 6);
    state.equipment[1] = card('frost', 5);
    for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(['pierce', 'frost']).not.toContain(selectPivotType(state, constRng(roll)));
    }
  });

  it('prevents a third same-type ordinary drop when the role has another legal candidate', () => {
    const state = freshState();
    state.cards[0] = card('pierce', 3);
    state.cards[1] = card('frost', 2);
    state.cards[2] = card('decoy', 2);
    state.normalDropDirector.recentTypes = ['pierce', 'pierce'];
    state.normalDropDirector.roleBag = ['build'];
    expect(selectNormalEnemyDropType(state, constRng(0))).not.toBe('pierce');
  });

  it('pity forces the second missed build slot, clears on hit, and ignores discovery/pivot', () => {
    cfg.economy.normalDropTypePolicy.affinity.scorePerStack = 0;
    const state = freshState();
    state.buildState.affinity.projectile = 1;
    state.buildState.dropPity = { lane: 'projectile', remaining: 2 };
    state.normalDropDirector.roleBag = ['build', 'build'];
    const first = selectNormalEnemyDropType(state, constRng(0.4));
    expect(getCardPool().find(type => type === first)).toBe(first);
    expect(cfg.skills.cards.find(card => card.id === first)!.synergyTags).not.toContain('projectile');
    expect(state.buildState.dropPity?.remaining).toBe(1);
    const second = selectNormalEnemyDropType(state, constRng(0.4));
    expect(cfg.skills.cards.find(card => card.id === second)!.synergyTags).toContain('projectile');
    expect(state.buildState.dropPity).toBeUndefined();

    const hit = freshState();
    cfg.economy.normalDropTypePolicy.affinity.scorePerStack = 2.5;
    hit.buildState.affinity.projectile = 1;
    hit.buildState.dropPity = { lane: 'projectile', remaining: 2 };
    hit.normalDropDirector.roleBag = ['build'];
    const hitType = selectNormalEnemyDropType(hit, constRng(0));
    expect(cfg.skills.cards.find(card => card.id === hitType)!.synergyTags).toContain('projectile');
    expect(hit.buildState.dropPity).toBeUndefined();

    const ignored = freshState();
    ignored.buildState.dropPity = { lane: 'control', remaining: 2 };
    ignored.normalDropDirector.roleBag = ['discovery', 'pivot'];
    selectNormalEnemyDropType(ignored, constRng(0.5));
    selectNormalEnemyDropType(ignored, constRng(0.5));
    expect(ignored.buildState.dropPity).toEqual({ lane: 'control', remaining: 2 });
  });
});

describe('NormalDropDirector · source isolation and reproducibility', () => {
  it('keeps wave Boss deaths isolated from the normal drop director', () => {
    const state = freshState();
    state.equipment[0] = card('pierce', 6);
    state.normalDropDirector.typeStats.pierce.mergeOps = 99;
    const config = createDefaultConfig();
    config.dropChance = 0;
    rollDropOnKill(state, config, constRng(0.99), enemy({ type: 'boss' }));
    expect(state.groundDrops).toEqual([]);
    expect(state.normalDropDirector.ordinaryDropCount).toBe(0);
  });

  it('uses uniform selection without consuming director state when disabled', () => {
    cfg.economy.normalDropTypePolicy.enabled = false;
    const state = freshState();
    state.equipment[0] = card('pierce', 6);
    expect(selectNormalEnemyDropType(state, constRng(0.99))).toBe(getCardPool()[getCardPool().length - 1]);
    expect(state.normalDropDirector.ordinaryDropCount).toBe(0);
    expect(state.normalDropDirector.roleBag).toEqual([]);
  });

  it('is fully reproducible from equal state and equal injected RNG sequences', () => {
    const first = freshState();
    first.cards[0] = card('pierce', 1);
    const second = structuredClone(first);
    const values = [0.04, 0.91, 0.28, 0.73, 0.16, 0.62, 0.35, 0.87, 0.49, 0.11];
    const run = (state: typeof first, rng: () => number) => (
      Array.from({ length: 30 }, () => selectNormalEnemyDropType(state, rng))
    );
    expect(run(first, seqRng(...values))).toEqual(run(second, seqRng(...values)));
    expect(first.normalDropDirector).toEqual(second.normalDropDirector);
  });
});

describe('NormalDropDirector · player investment telemetry', () => {
  it('records automatic merges, equipment feeds, and wildcard upgrades by card type', () => {
    const config = createDefaultConfig();

    const automatic = freshState();
    automatic.cards[0] = card('pierce', 1);
    automatic.cards[1] = card('pierce', 1);
    autoMergeCards(automatic, config, constRng(0));
    expect(automatic.normalDropDirector.typeStats.pierce).toEqual(expect.objectContaining({
      mergeOps: 1,
      highestStarReached: 2,
    }));

    const fed = freshState();
    fed.equipment[0] = card('frost', 3);
    fed.cards[0] = card('frost', 3);
    moveOrSwap(fed, config, constRng(0), 'cards', 0, 'equipment', 0);
    expect(fed.normalDropDirector.typeStats.frost).toEqual(expect.objectContaining({
      mergeOps: 1,
      highestStarReached: 4,
    }));

    const wildcard = freshState();
    wildcard.equipment[0] = card('decoy', 3);
    grantWildcards(wildcard, [{ star: 3, count: 1 }]);
    useWildcardOnSlot(wildcard, config, constRng(0), 'equipment', 0);
    expect(wildcard.normalDropDirector.typeStats.decoy).toEqual(expect.objectContaining({
      mergeOps: 1,
      highestStarReached: 4,
    }));
  });

  it('records successful high-star card collection without counting rejected pickups', () => {
    const state = freshState();
    const config = createDefaultConfig();
    spawnGroundDrop(state, config, constRng(0), 10, 10, 'sanctum', 2);
    collectDrop(state, config, constRng(0), state.groundDrops[0]);
    expect(state.normalDropDirector.typeStats.sanctum).toEqual(expect.objectContaining({
      collected: 1,
      highestStarReached: 2,
    }));
  });
});
