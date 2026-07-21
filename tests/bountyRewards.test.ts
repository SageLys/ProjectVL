import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import type { BountyOffer } from '../src/core/types';
import { acceptBountyOfferAt, notifyBountyMemberBreached, selectBountyRewardType, tickBountySystem } from '../src/core/systems/bountySystem';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { killEnemy } from '../src/core/systems/damageSystem';
import { collectDrop, spawnGroundDrop, spawnWildcardDrop } from '../src/core/systems/dropSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });

function promisedOffer(overrides: Partial<BountyOffer> = {}): BountyOffer {
  return {
    id: 1,
    rewardCardType: 'sanctum',
    rewardCardStar: 2,
    rewardCardCount: 2,
    wildcardStar: 2,
    wildcardCount: 3,
    side: 'right',
    x: cfg.combat.canvas.width - 32,
    y: 365,
    remaining: 8,
    guaranteed: false,
    createdAt: 0,
    ...overrides,
  };
}

function spawnedEncounter() {
  const state = freshState();
  state.wave = 5;
  state.spawnLeft = 10;
  state.waveSpawnQuota = 10;
  state.bountyOffers.push(promisedOffer());
  acceptBountyOfferAt(state, state.bountyOffers[0].x, state.bountyOffers[0].y);
  tickBountySystem(state, createDefaultConfig(), constRng(0), 10);
  return state;
}

describe('Bounty Rewards · 确定掉落', () => {
  it('biases rewards toward the primary lane and preserves repeat protection', () => {
    const state = freshState();
    state.buildState.affinity.control = 3;
    const rng = createSeededRng(20260716);
    const controlTypes = new Set(cfg.skills.cards.filter(card => card.synergyTags.includes('control')).map(card => card.id));
    const results = Array.from({ length: 600 }, () => selectBountyRewardType(state, rng));
    const share = results.filter(type => controlTypes.has(type)).length / results.length;
    expect(share).toBeGreaterThanOrEqual(cfg.bounty.rewardBias.primaryShare - 0.1);
    // 探索段仍从全卡池抽取，天然会额外命中双标签 control 卡，因此总命中率高于 primaryShare。
    expect(share).toBeLessThanOrEqual(cfg.bounty.rewardBias.primaryShare + 0.2);
    for (let index = 1; index < results.length; index++) expect(results[index]).not.toBe(results[index - 1]);
  });

  it('uses the exact legacy uniform bag sequence when affinity is zero', () => {
    const enabled = freshState();
    const disabled = freshState();
    const enabledRng = createSeededRng(88);
    const disabledRng = createSeededRng(88);
    const enabledSequence = Array.from({ length: 25 }, () => selectBountyRewardType(enabled, enabledRng));
    cfg.bounty.rewardBias.enabled = false;
    const disabledSequence = Array.from({ length: 25 }, () => selectBountyRewardType(disabled, disabledRng));
    expect(enabledSequence).toEqual(disabledSequence);
  });

  it('中途成员死亡不走普通掉落，最后一名才统一发奖', () => {
    const state = spawnedEncounter();
    const config = createDefaultConfig();
    config.dropChance = 1;
    const members = [...state.enemies];
    for (const member of members.slice(0, -1)) {
      state.enemies.splice(state.enemies.indexOf(member), 1);
      killEnemy(state, config, constRng(0), member);
      expect(state.groundDrops).toHaveLength(0);
    }
    const last = members[members.length - 1];
    state.enemies.splice(state.enemies.indexOf(last), 1);
    const events = killEnemy(state, config, constRng(0), last);
    expect(events.some(event => event.type === 'bountyCompleted')).toBe(true);
    expect(events).toContainEqual({ type: 'bountyRewardDropped', encounterId: 1, rewardCardType: 'sanctum' });
    expect(state.groundDrops).toHaveLength(3);
  });

  it('完成奖励的类型、星级、数量与 Offer 完全一致，寿命使用独立配置', () => {
    const state = spawnedEncounter();
    const config = createDefaultConfig();
    const members = [...state.enemies];
    for (const member of members) {
      state.enemies.splice(state.enemies.indexOf(member), 1);
      killEnemy(state, config, constRng(0.5), member);
    }
    const cards = state.groundDrops.filter(drop => drop.kind === 'card');
    const wildcards = state.groundDrops.filter(drop => drop.kind === 'wildcard');
    expect(cards).toHaveLength(2);
    expect(cards.every(drop => drop.type === 'sanctum' && drop.star === 2)).toBe(true);
    expect(wildcards).toHaveLength(1);
    expect(wildcards[0]).toEqual(expect.objectContaining({ star: 2, count: 3 }));
    expect(state.groundDrops.every(drop => drop.life === cfg.bounty.reward.dropLifetimeSeconds && drop.maxLife === cfg.bounty.reward.dropLifetimeSeconds)).toBe(true);
    expect(state.groundDrops.every(drop => drop.bountyEncounterId === 1)).toBe(true);
  });

  it('手牌满时万能卡仍可拾取，普通卡牌掉落仍受手牌约束', () => {
    const state = freshState();
    const config = createDefaultConfig();
    state.cards = state.cards.map((_, index) => card(`filled${index}`, 1));
    spawnWildcardDrop(state, 10, 10, 1, 2, 12);
    const wildcardEvents = collectDrop(state, config, constRng(0), state.groundDrops[0]);
    expect(state.wildcards[1]).toBe(2);
    expect(wildcardEvents).toEqual([expect.objectContaining({ type: 'wildcardsGranted', grants: [{ star: 1, count: 2 }], dropId: expect.any(Number) })]);
    spawnGroundDrop(state, config, constRng(0), 10, 10, 'pierce', 1);
    expect(collectDrop(state, config, constRng(0), state.groundDrops[0])).toEqual([
      expect.objectContaining({ type: 'cardsFull', dropId: expect.any(Number), star: 1 }),
    ]);
    expect(state.groundDrops).toHaveLength(1);
  });

  it('拾取事件保留 Bounty 来源，供完整漏斗遥测归因', () => {
    const state = freshState();
    const config = createDefaultConfig();
    spawnWildcardDrop(state, 10, 10, 1, 2, 12);
    state.groundDrops[0].bountyEncounterId = 7;
    expect(collectDrop(state, config, constRng(0), state.groundDrops[0])).toEqual([expect.objectContaining({
      type: 'wildcardsGranted',
      grants: [{ star: 1, count: 2 }],
      bountyEncounterId: 7,
    })]);

    spawnGroundDrop(state, config, constRng(0), 10, 10, 'pierce', 1);
    state.groundDrops[0].bountyEncounterId = 7;
    expect(collectDrop(state, config, constRng(0), state.groundDrops[0])[0]).toEqual(expect.objectContaining({
      type: 'collected',
      cardType: 'pierce',
      merges: 0,
      bountyEncounterId: 7,
    }));
  });

  it('奖励洗牌袋重装时禁止与上一次类型相同', () => {
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 10;
    state.waveSpawnQuota = 10;
    state.bountyDirector.checkTimer = 0;
    state.bountyDirector.rewardBag = [];
    state.bountyDirector.lastRewardType = 'pierce';
    tickBountySystem(state, createDefaultConfig(), constRng(0), 0);
    expect(state.bountyOffers[0].rewardCardType).not.toBe('pierce');
  });

  it('failed Encounter 不发任何 Bounty 奖励', () => {
    const state = spawnedEncounter();
    const member = state.enemies[0];
    const events = notifyBountyMemberBreached(state, member);
    expect(events).toEqual([{ type: 'bountyFailed', encounterId: 1 }]);
    expect(state.groundDrops).toHaveLength(0);
  });

  it('freezes the offered card type across later affinity changes and keeps the configured wildcard', () => {
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 10;
    state.waveSpawnQuota = 10;
    state.buildState.affinity.control = 3;
    state.bountyDirector.checkTimer = 0;
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    tickBountySystem(state, createDefaultConfig(), createSeededRng(5), 0);
    const promised = state.bountyOffers[0].rewardCardType;
    state.buildState.affinity.control = 0;
    state.buildState.affinity.defense = 9;
    acceptBountyOfferAt(state, state.bountyOffers[0].x, state.bountyOffers[0].y);
    tickBountySystem(state, createDefaultConfig(), constRng(0), 10);
    for (const member of [...state.enemies]) {
      state.enemies.splice(state.enemies.indexOf(member), 1);
      killEnemy(state, createDefaultConfig(), constRng(0.5), member);
    }
    const cardDrops = state.groundDrops.filter(drop => drop.kind === 'card');
    const wildcardDrops = state.groundDrops.filter(drop => drop.kind === 'wildcard');
    expect(cardDrops).toHaveLength(cfg.bounty.reward.cardCount);
    expect(cardDrops.every(drop => drop.type === promised)).toBe(true);
    expect(wildcardDrops).toHaveLength(1);
    expect(wildcardDrops[0]).toEqual(expect.objectContaining({ count: cfg.bounty.reward.wildcardCount }));
  });
});
