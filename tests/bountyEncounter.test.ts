import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BountyOffer, Enemy } from '../src/core/types';
import { acceptBountyOfferAt, notifyBountyMemberKilled, tickBountySystem } from '../src/core/systems/bountySystem';
import { moveEnemies } from '../src/core/systems/enemySystem';
import { checkWaveClear, jumpToWave, restartWave } from '../src/core/systems/waveSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function offer(overrides: Partial<BountyOffer> = {}): BountyOffer {
  return {
    id: 1,
    rewardCardType: 'frost',
    rewardCardStar: 1,
    rewardCardCount: 1,
    wildcardStar: 1,
    wildcardCount: 1,
    side: 'top',
    x: 270,
    y: 32,
    remaining: 8,
    guaranteed: false,
    createdAt: 0,
    ...overrides,
  };
}

function acceptAndSpawn(wave = 1): { state: ReturnType<typeof freshState>; members: Enemy[] } {
  const state = freshState();
  state.wave = wave;
  state.spawnLeft = 9;
  state.waveSpawnQuota = 12;
  state.bountyOffers.push(offer());
  acceptBountyOfferAt(state, 270, 32);
  tickBountySystem(state, createDefaultConfig(), constRng(0), 10);
  return { state, members: [...state.enemies] };
}

describe('Bounty Encounter · 生成与生命周期', () => {
  it('接受后按波次数量从 Offer 方向生成，且不消耗普通配额', () => {
    const { state, members } = acceptAndSpawn(3);
    expect(members).toHaveLength(4);
    expect(members.every(member => member.y === -cfg.waves.spawnMargin)).toBe(true);
    expect(state.spawnLeft).toBe(9);
    expect(state.waveSpawnQuota).toBe(12);
    expect(state.lastSpawnCheckCount).toBe(0);
  });

  it('全员应用倍率并共享 encounterId / rewardType', () => {
    const { state, members } = acceptAndSpawn();
    const base = cfg.enemies.types.normal;
    expect(members[0].maxHp).toBe((base.hpBase + base.hpPerWave) * cfg.bounty.encounter.hpMul);
    expect(members[0].speed).toBe((base.speedBase + base.speedPerWave) * cfg.bounty.encounter.speedMul);
    expect(members[0].damage).toBe(base.damage * cfg.bounty.encounter.damageMul);
    expect(new Set(members.map(member => member.bountyEncounterId))).toEqual(new Set([state.bountyEncounters[0].id]));
    expect(members.every(member => member.bountyRewardType === 'frost')).toBe(true);
  });

  it('分批生成间隙即使场上为空也不触发波清', () => {
    const state = freshState();
    state.wave = 1;
    state.spawnLeft = 0;
    state.bountyOffers.push(offer());
    acceptBountyOfferAt(state, 270, 32);
    expect(state.enemies).toHaveLength(0);
    expect(checkWaveClear(state)).toEqual([]);
  });

  it('最后一名成员解决时才 completed，重复通知幂等', () => {
    const { state, members } = acceptAndSpawn();
    const encounter = state.bountyEncounters[0];
    for (const member of members.slice(0, -1)) expect(notifyBountyMemberKilled(state, member)).toEqual([]);
    expect(encounter.status).toBe('active');
    const events = notifyBountyMemberKilled(state, members[members.length - 1]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bountyCompleted', encounterId: encounter.id }));
    expect(encounter.status).toBe('completed');
    expect(notifyBountyMemberKilled(state, members[members.length - 1])).toEqual([]);
  });

  it('任一成员突破立即 failed，剩余成员退化为普通敌人', () => {
    const { state, members } = acceptAndSpawn();
    const breached = members[0];
    const survivor = members[1];
    breached.x = cfg.combat.turret.x;
    breached.y = cfg.combat.turret.y;
    survivor.x = 500;
    survivor.y = 100;
    state.enemies = [survivor, breached];
    const events = moveEnemies(state, createDefaultConfig(), constRng(0), 0);
    expect(events).toContainEqual({ type: 'bountyFailed', encounterId: state.bountyEncounters[0].id });
    expect(state.bountyEncounters[0].status).toBe('failed');
    expect(survivor.bountyEncounterId).toBeUndefined();
    expect(survivor.bountyRewardType).toBeUndefined();
  });

  it('撞嘲讽召唤物消散计入完成进度但不增加击杀', () => {
    const { state, members } = acceptAndSpawn();
    const member = members[0];
    state.bountyEncounters[0].memberIds = [member.id];
    state.enemies = [member];
    state.summons = [{ id: 7, kind: 'decoy', x: 100, y: 100, hp: 20, maxHp: 20 }];
    member.x = 100;
    member.y = 100;
    member.status.taunt = { x: 100, y: 100, remaining: 2, summonId: 7 };
    const events = moveEnemies(state, createDefaultConfig(), constRng(0), 0);
    expect(events.some(event => event.type === 'bountyCompleted')).toBe(true);
    expect(state.kills).toBe(0);
  });

  it('jumpToWave / restartWave 清理 Offer、Encounter 与 Director 瞬态', () => {
    const state = freshState();
    state.bountyOffers.push(offer());
    acceptBountyOfferAt(state, 270, 32);
    state.bountyDirector.cooldownRemaining = 7;
    jumpToWave(state, createDefaultConfig(), constRng(0.5), 2);
    expect(state.bountyOffers).toEqual([]);
    expect(state.bountyEncounters).toEqual([]);
    expect(state.bountyDirector.cooldownRemaining).toBe(0);
    state.bountyOffers.push(offer());
    acceptBountyOfferAt(state, 270, 32);
    restartWave(state, createDefaultConfig(), constRng(0.5));
    expect(state.bountyOffers).toEqual([]);
    expect(state.bountyEncounters).toEqual([]);
  });
});
