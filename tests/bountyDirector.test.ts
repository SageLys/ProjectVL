import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { calculateOfferChance, tickBountySystem } from '../src/core/systems/bountySystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function readyWave() {
  const state = freshState();
  state.wave = 1;
  state.spawnLeft = 10;
  state.waveSpawnQuota = 10;
  state.bountyDirector.checkTimer = cfg.bounty.offer.checkIntervalSeconds;
  return state;
}

describe('Bounty Director · 周期与概率', () => {
  it('第 1 波即可在周期检查命中 Offer', () => {
    const state = freshState();
    startNextWave(state, createDefaultConfig(), constRng(0));
    const events = tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    expect(events.some(event => event.type === 'bountyOfferSpawned')).toBe(true);
    expect(state.bountyOffers).toHaveLength(1);
  });

  it('只按 checkIntervalSeconds 检查而非每帧', () => {
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    const state = readyWave();
    for (let i = 0; i < 3; i++) tickBountySystem(state, createDefaultConfig(), constRng(0), 1);
    expect(state.bountyOffers).toHaveLength(0);
    tickBountySystem(state, createDefaultConfig(), constRng(0), 1);
    expect(state.bountyOffers).toHaveLength(1);
  });

  it('无伤时长和高血量提高概率，刚受伤降低概率', () => {
    const state = readyWave();
    state.hp = state.maxHp;
    state.time = 40;
    state.bountyDirector.lastHpLossAt = 0;
    const healthy = calculateOfferChance(state);
    state.hp = state.maxHp * 0.4;
    state.bountyDirector.lastHpLossAt = state.time;
    const hurt = calculateOfferChance(state);
    expect(healthy).toBeGreaterThan(hurt);
  });

  it('动态概率始终受 min/max 夹取', () => {
    const state = readyWave();
    cfg.bounty.offer.baseChancePerCheck = -10;
    expect(calculateOfferChance(state)).toBe(cfg.bounty.offer.minChancePerCheck);
    cfg.bounty.offer.baseChancePerCheck = 10;
    expect(calculateOfferChance(state)).toBe(cfg.bounty.offer.maxChancePerCheck);
  });

  it('波次进度达到阈值时无视概率和冷却强制保底', () => {
    const state = readyWave();
    state.spawnLeft = 4;
    state.bountyDirector.cooldownRemaining = 999;
    cfg.bounty.offer.baseChancePerCheck = 0;
    const events = tickBountySystem(state, createDefaultConfig(), constRng(0.99), cfg.bounty.offer.checkIntervalSeconds);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bountyOfferSpawned', guaranteed: true }));
    expect(state.bountyDirector.guaranteedThisWave).toBe(true);
  });

  it('每波不超过 maxOffersPerWave，且普通报价受冷却限制', () => {
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    cfg.bounty.offer.cooldownSeconds = 100;
    cfg.bounty.offer.maxConcurrentOffers = 3;
    const state = readyWave();
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    expect(state.bountyDirector.offersThisWave).toBe(1);
    state.bountyDirector.cooldownRemaining = 0;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    state.bountyDirector.cooldownRemaining = 0;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    expect(state.bountyDirector.offersThisWave).toBe(cfg.bounty.offer.maxOffersPerWave);
  });

  it('相同 RNG 流产生稳定结果', () => {
    const a = readyWave();
    const b = readyWave();
    tickBountySystem(a, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    tickBountySystem(b, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds);
    expect(b.bountyOffers).toEqual(a.bountyOffers);
    expect(b.bountyDirector.rewardBag).toEqual(a.bountyDirector.rewardBag);
  });

  it('enabled=false 时概率与保底都不生成', () => {
    cfg.bounty.enabled = false;
    const state = readyWave();
    state.spawnLeft = 0;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds * 3);
    expect(state.bountyOffers).toHaveLength(0);
    expect(state.bountyDirector.offersThisWave).toBe(0);
  });
});
