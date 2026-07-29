import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { ATOM_NAMES } from '../src/core/effects/atomContract';
import type { BindingDef, CardDef, EffectDef } from '../src/core/effects/defs';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { makeCountingRng } from '../src/core/rng';
import { buildRunSummary } from '../src/core/settlement';
import {
  MAX_REFUND_ROUNDS, autoMergeCards, commitMerge, flushMergeRefunds,
} from '../src/core/systems/cardSystem';
import {
  acceptBountyOfferAt, notifyBountyMemberKilled, tickBountySystem,
} from '../src/core/systems/bountySystem';
import { grantWaveBossReward } from '../src/core/systems/waveBossSystem';
import { useWildcardOnSlot } from '../src/core/systems/wildcardSystem';
import type { GameEvent, GameState, Rng } from '../src/core/types';
import { formatToast } from '../src/ui/eventText';
import {
  card, constRng, createDefaultConfig, freshState, resetTestEnv, seqRng,
} from './helpers';

const config = createDefaultConfig();

function fixtureDef(id: string, effects: EffectDef[]): CardDef {
  const equip: BindingDef[] = [{ trigger: 'passive', effects }];
  const emptyTier = { radius: 100, effects: [] as EffectDef[] };
  return {
    id,
    category: 'economy',
    synergyTags: ['utility'],
    textKey: `test.${id}`,
    teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip },
      '6': { tier: 'transform', equip },
    },
    amplifyAxis: { params: {} },
    evolutionTree: {
      checkpoints: [{ star: 3, options: [{ id: `${id}A`, textKey: `test.${id}.A`, equip }] }],
      sharedNodes: [],
    },
    consumable: {
      placement: 'point',
      anchors: { '1': emptyTier, '3': emptyTier, '6': emptyTier },
    },
  };
}

function registerFixtures(...defs: CardDef[]): void {
  registerSkillDefs([...cfg.skills.cards, ...defs]);
}

function equip(state: GameState, type: string, slot = 0): void {
  state.equipment[slot] = card(type, 3);
}

function refundEffect(
  overrides: Partial<{ refundChance: number; count: number; star: number; scope: 'merge' | 'feed' | 'both' }> = {},
): EffectDef {
  return {
    atom: 'mergeMaterialRefund',
    params: { refundChance: 1, count: 1, star: 1, scope: 'both', ...overrides },
  };
}

function bonusEffect(
  overrides: Partial<{ bonusChance: number; count: number; scope: 'bounty' | 'boss' | 'both' }> = {},
): EffectDef {
  return {
    atom: 'wildcardRewardBonus',
    params: { bonusChance: 1, count: 1, scope: 'both', ...overrides },
  };
}

function configWithEffect(effect: unknown, trigger = 'passive', consume = false): unknown {
  const candidate = structuredClone(cfg.skills) as unknown as {
    cards: Array<{
      stars: Record<string, { equip: Array<{ trigger: string; effects: unknown[] }> }>;
      consumable: { anchors: Record<string, { effects: unknown[] }> };
    }>;
  };
  const target = candidate.cards[0];
  if (consume) target.consumable.anchors['1'].effects = [effect];
  else target.stars['3'].equip = [{ trigger, effects: [effect] }];
  return candidate;
}

function countingSequence(...values: number[]): { rng: Rng; draws: number[] } {
  const source = seqRng(...values);
  const draws: number[] = [];
  return {
    draws,
    rng: () => {
      const value = source();
      draws.push(value);
      return value;
    },
  };
}

beforeEach(resetTestEnv);

describe('merge economy atom contract', () => {
  it('loads all 41 existing cards without adding either new atom to skills.json', () => {
    expect(cfg.skills.cards).toHaveLength(41);
    expect(() => validateSkillsConfig(structuredClone(cfg.skills))).not.toThrow();
    const source = JSON.stringify(cfg.skills);
    expect(source).not.toContain('mergeMaterialRefund');
    expect(source).not.toContain('wildcardRewardBonus');
  });

  it('retires mergeRule from the atom set and rejects it as an illegal atom', () => {
    expect(ATOM_NAMES).not.toContain('mergeRule' as never);
    expect(() => validateSkillsConfig(configWithEffect({ atom: 'mergeRule', params: {} })))
      .toThrow(/非法效果原子/);
  });

  it.each(['mergeMaterialRefund', 'wildcardRewardBonus'] as const)(
    'rejects %s outside passive and in consumable effects',
    atom => {
      expect(() => validateSkillsConfig(configWithEffect({ atom, params: {} }, 'onHit')))
        .toThrow(/不允许绑定到 onHit/);
      expect(() => validateSkillsConfig(configWithEffect({ atom, params: {} }, 'passive', true)))
        .toThrow(/不支持消耗态/);
    },
  );

  it.each([
    { atom: 'mergeMaterialRefund', params: { count: 0 } },
    { atom: 'mergeMaterialRefund', params: { refundChance: 1.5 } },
    { atom: 'mergeMaterialRefund', params: { scope: 'wildcard' } },
    { atom: 'wildcardRewardBonus', params: { count: 0 } },
    { atom: 'wildcardRewardBonus', params: { bonusChance: 1.5 } },
  ])('rejects out-of-contract params: $atom $params', effect => {
    expect(() => validateSkillsConfig(configWithEffect(effect))).toThrow();
  });
});

describe('merge material refund consumer', () => {
  it('does not read rng when no refund rule is equipped', () => {
    registerFixtures();
    const state = freshState();
    const counting = makeCountingRng(7);
    commitMerge(state, config, counting.rng, 'material', 2, 'merge');
    expect(counting.draws()).toBe(0);
    expect(state.pendingMergeRefunds).toEqual([]);
  });

  it('handles zero, one, and intermediate probabilities with one draw per matching rule', () => {
    const run = (chance: number, rolls: number[]) => {
      const def = fixtureDef('refundSource', [refundEffect({ refundChance: chance })]);
      registerFixtures(def);
      const state = freshState();
      equip(state, def.id);
      const counting = countingSequence(...rolls);
      for (let index = 0; index < rolls.length; index++) {
        commitMerge(state, config, counting.rng, 'material', 2, 'merge');
      }
      return { pending: state.pendingMergeRefunds, draws: counting.draws };
    };
    expect(run(0, [0]).pending).toEqual([]);
    expect(run(1, [0.999]).pending).toHaveLength(1);
    expect(run(0.5, [0.6, 0.4])).toEqual({
      pending: [{ cardType: 'material', star: 1, count: 1 }],
      draws: [0.6, 0.4],
    });
  });

  it('filters merge/feed scopes and hard-skips wildcard/recipe without rng draws', () => {
    const mergeDef = fixtureDef('mergeOnly', [refundEffect({ scope: 'merge' })]);
    const feedDef = fixtureDef('feedOnly', [refundEffect({ scope: 'feed' })]);
    registerFixtures(mergeDef, feedDef);
    const state = freshState();
    equip(state, mergeDef.id, 0);
    equip(state, feedDef.id, 1);
    const counting = countingSequence(0, 0, 0, 0);

    commitMerge(state, config, counting.rng, 'material', 2, 'merge');
    expect(state.pendingMergeRefunds).toEqual([{ cardType: 'material', star: 1, count: 1 }]);
    state.pendingMergeRefunds.length = 0;
    commitMerge(state, config, counting.rng, 'material', 2, 'feed');
    expect(state.pendingMergeRefunds).toEqual([{ cardType: 'material', star: 1, count: 1 }]);
    state.pendingMergeRefunds.length = 0;
    const beforeExcluded = counting.draws.length;
    commitMerge(state, config, counting.rng, 'material', 2, 'wildcard');
    commitMerge(state, config, counting.rng, 'material', 2, 'recipe');
    expect(counting.draws).toHaveLength(beforeExcluded);
    expect(state.pendingMergeRefunds).toEqual([]);
  });

  it('never self-refunds a wildcard upgrade', () => {
    const def = fixtureDef('refundSource', [refundEffect({ count: 4 })]);
    registerFixtures(def);
    const state = freshState();
    equip(state, def.id);
    state.cards[0] = card('material', 2);
    state.wildcards[2] = 1;
    const counting = makeCountingRng(11);

    const events = useWildcardOnSlot(state, config, counting.rng, 'cards', 0);

    expect(events).toContainEqual(expect.objectContaining({ type: 'wildcardMerged', resultStar: 3 }));
    expect(state.wildcards[2]).toBe(0);
    expect(state.pendingMergeRefunds).toEqual([]);
    expect(counting.draws()).toBe(0);
  });

  it('clamps refund stars below the merge result and suppresses results below one star', () => {
    const def = fixtureDef('refundSource', [refundEffect({ star: 99, count: 2 })]);
    registerFixtures(def);
    const state = freshState();
    equip(state, def.id);
    commitMerge(state, config, constRng(0), 'material', 3, 'merge');
    expect(state.pendingMergeRefunds).toEqual([{ cardType: 'material', star: 2, count: 2 }]);
    state.pendingMergeRefunds.length = 0;
    commitMerge(state, config, constRng(0), 'material', 1, 'merge');
    expect(state.pendingMergeRefunds).toEqual([]);
  });

  it('bounds an always-refund chain and discards only pending overflow', () => {
    const def = fixtureDef('refundSource', [refundEffect({ count: 4 })]);
    registerFixtures(def);
    const state = freshState();
    equip(state, def.id);
    state.cards[0] = card('material', 1);
    state.cards[1] = card('material', 1);
    const counting = makeCountingRng(23);

    const result = autoMergeCards(state, config, counting.rng);

    expect(result.merged).toBeGreaterThan(0);
    expect(result.events.filter(event => event.type === 'mergeRefunded').length)
      .toBeGreaterThanOrEqual(MAX_REFUND_ROUNDS);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'mergeRefunded', lost: expect.any(Number) }));
    expect(state.pendingMergeRefunds).toEqual([]);
    expect(counting.draws()).toBeLessThan(100);
  });

  it('reports a full hand as lost without creating a ground drop', () => {
    const state = freshState();
    state.cards = state.cards.map((_, index) => card(`full${index}`, 1));
    state.pendingMergeRefunds.push({ cardType: 'material', star: 1, count: 2 });
    const beforeDrops = state.groundDrops.length;

    expect(flushMergeRefunds(state, config, constRng(0))).toContainEqual({
      type: 'mergeRefunded', cardType: 'material', star: 1, granted: 0, lost: 2,
    });
    expect(state.groundDrops).toHaveLength(beforeDrops);
  });

  it('keeps refund outcomes and the exact rng sequence invariant under equipment slot swaps', () => {
    const a = fixtureDef('alphaRefund', [refundEffect({ refundChance: 0.5, count: 1 })]);
    const b = fixtureDef('betaRefund', [refundEffect({ refundChance: 0.5, count: 2 })]);
    registerFixtures(a, b);
    const run = (types: string[]) => {
      const state = freshState();
      types.forEach((type, index) => equip(state, type, index));
      const counting = countingSequence(0.4, 0.6);
      commitMerge(state, config, counting.rng, 'material', 2, 'merge');
      return { pending: state.pendingMergeRefunds, draws: counting.draws };
    };
    expect(run([b.id, a.id])).toEqual(run([a.id, b.id]));
  });
});

function createBountyOfferWithBonus(baseCount: number): { state: GameState; events: GameEvent[] } {
  cfg.bounty.reward.wildcardCount = baseCount;
  cfg.bounty.offer.baseChancePerCheck = 1;
  cfg.bounty.offer.maxChancePerCheck = 1;
  const def = fixtureDef('bountyBonus', [bonusEffect({ scope: 'bounty' })]);
  registerFixtures(def);
  const state = freshState();
  state.wave = 1;
  state.spawnLeft = 10;
  state.waveSpawnQuota = 10;
  state.bountyDirector.checkTimer = 0;
  equip(state, def.id);
  const events = tickBountySystem(state, config, constRng(0), 0);
  return { state, events };
}

function completeBounty(state: GameState): void {
  const offer = state.bountyOffers[0];
  acceptBountyOfferAt(state, offer.x, offer.y);
  tickBountySystem(state, config, constRng(0), 10);
  for (const member of [...state.enemies]) notifyBountyMemberKilled(state, member, config, constRng(0));
}

describe('wildcard reward bonus consumer', () => {
  it('freezes the Bounty promise and drops exactly the displayed wildcard count', () => {
    const { state, events } = createBountyOfferWithBonus(2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bountyOfferSpawned' }));
    const promised = state.bountyOffers[0].wildcardCount;
    expect(promised).toBe(3);
    completeBounty(state);
    const wildcard = state.groundDrops.find(drop => drop.kind === 'wildcard');
    expect(wildcard).toEqual(expect.objectContaining({ count: promised }));
  });

  it('creates one wildcard visual pile when the Bounty baseline count is zero', () => {
    const { state } = createBountyOfferWithBonus(0);
    expect(state.bountyOffers[0].wildcardCount).toBe(1);
    completeBounty(state);
    expect(state.groundDrops).toHaveLength(cfg.bounty.reward.cardCount + 1);
    expect(state.groundDrops.filter(drop => drop.kind === 'wildcard')).toEqual([
      expect.objectContaining({ count: 1 }),
    ]);
  });

  it('does not add bonus rng draws or wildcards to a validation card reward', () => {
    cfg.waves.stagePlan.validation[0].bossReward = {
      kind: 'card', star: 4, count: 1, typePolicy: 'uniform',
    };
    const def = fixtureDef('bossBonus', [bonusEffect({ scope: 'boss', count: 3 })]);
    registerFixtures(def);
    const run = (withBonus: boolean) => {
      const state = freshState();
      state.wave = 9;
      if (withBonus) equip(state, def.id);
      const counting = makeCountingRng(99);
      grantWaveBossReward(state, config, counting.rng, 100, 100);
      return { draws: counting.draws(), drops: state.groundDrops };
    };
    const baseline = run(false);
    const equipped = run(true);
    expect(equipped.draws).toBe(baseline.draws);
    expect(equipped.drops.every(drop => drop.kind === 'card')).toBe(true);
    expect(equipped.drops).toHaveLength(1);
  });

  it('keeps bonus wildcards on the ground and out of settlement until pickup', () => {
    const def = fixtureDef('bossBonus', [bonusEffect({ scope: 'boss', count: 2 })]);
    registerFixtures(def);
    const state = freshState();
    state.wave = 1;
    equip(state, def.id);
    const beforeScore = buildRunSummary(state, false).score.wildcards;

    grantWaveBossReward(state, config, constRng(0), 100, 100);

    expect(state.groundDrops).toEqual([expect.objectContaining({ kind: 'wildcard', count: 3 })]);
    expect(state.wildcards[1]).toBe(0);
    expect(buildRunSummary(state, false).score.wildcards).toBe(beforeScore);
  });
});

describe('merge economy event text', () => {
  it('formats merge refunds by granted/lost counts and wildcard grants by actual grants', () => {
    expect(formatToast({ type: 'mergeRefunded', cardType: 'pierce', star: 1, granted: 2, lost: 0 }))
      .toContain('获得 2 张 1★');
    expect(formatToast({ type: 'mergeRefunded', cardType: 'pierce', star: 1, granted: 0, lost: 2 }))
      .toContain('手牌已满，损失 2 张 1★');
    expect(formatToast({ type: 'mergeRefunded', cardType: 'pierce', star: 1, granted: 1, lost: 2 }))
      .toContain('获得 1 张 1★');
    expect(formatToast({ type: 'wildcardsGranted', grants: [{ star: 3, count: 2 }] }))
      .toBe('获得 2 张 3★ 万能卡');
  });
});
