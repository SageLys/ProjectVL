import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { applyFreeze, applyKnockback } from '../src/core/effects/statusSystem';
import { tickBountySystem } from '../src/core/systems/bountySystem';
import { advanceWavePhase, jumpToWave } from '../src/core/systems/waveSystem';
import { killEnemy } from '../src/core/systems/damageSystem';
import { collectDrop, tickDrops } from '../src/core/systems/dropSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('validation fixed encounters', () => {
  it('spawns 1 then 2 validation elites with zero Budget quota and waits before the Boss', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 9);
    expect(state.spawnLeft).toBe(0);
    expect(state.waveSpawnQuota).toBe(0);
    expect(state.enemies.map(enemy => enemy.spawnKind)).toEqual(['validationElite']);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    state.enemies.length = 0;
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([
      { type: 'validationRewardSettleStarted', wave: 9, seconds: 12 },
    ]);
    expect(state.wavePhase).toBe('validationRewardSettle');
    expect(state.enemies).toHaveLength(0);
    state.validationRewardSettleRemaining = 0;
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toContainEqual({ type: 'waveBossSpawned', wave: 9 });
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0].spawnKind).toBe('waveBoss');

    jumpToWave(state, runtime, constRng(0.25), 10);
    expect(state.spawnLeft).toBe(0);
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies.every(enemy => enemy.spawnKind === 'validationElite')).toBe(true);
    expect(state.enemies.map(enemy => enemy.type)).toEqual(['tank', 'fast']);
  });

  it('stores and applies per-instance control and knockback resistance overrides', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 9);
    const elite = state.enemies[0];
    expect(elite).toMatchObject({
      ccResistOverride: 0.7,
      knockbackResistOverride: 0.8,
      validationReward: { kind: 'card', star: 4, count: 1, typePolicy: 'focusGod' },
    });
    applyFreeze(elite, 10);
    expect(elite.status.frozen).toBeCloseTo(cfg.combat.controlCeiling.freezeSeconds * 0.3, 10);
    elite.status.frozen = 0;
    elite.x = 10;
    elite.y = 0;
    expect(applyKnockback(elite, 0, 0, 100)).toBe(true);
    expect(elite.x).toBeCloseTo(30, 10);
  });

  it('does not generate Bounty offers in validation', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0), 9);
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds * 2);
    expect(state.bountyOffers).toHaveLength(0);
    expect(state.bountyDirector.offersThisWave).toBe(0);
  });

  it('restores the legacy linear Budget and no fixed encounter when the stage-plan switch is off', () => {
    cfg.waves.stagePlan.enabled = false;
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 9);
    expect(state.spawnLeft).toBe(cfg.waves.budget.waveQuota.base + 9 * cfg.waves.budget.waveQuota.perWave);
    expect(state.enemies).toHaveLength(0);
  });

  it('creates exactly 2 + 3 secure pickups with the configured star/count composition', () => {
    const runtime = createDefaultConfig();
    const rewardsFor = (wave: 9 | 10) => {
      const state = freshState();
      const events = [] as ReturnType<typeof killEnemy>;
      jumpToWave(state, runtime, constRng(0.25), wave);
      for (const elite of [...state.enemies]) {
        state.enemies.splice(state.enemies.indexOf(elite), 1);
        events.push(...killEnemy(state, runtime, constRng(0.25), elite));
      }
      advanceWavePhase(state, runtime, constRng(0.25));
      state.validationRewardSettleRemaining = 0;
      advanceWavePhase(state, runtime, constRng(0.25));
      const boss = state.enemies.find(enemy => enemy.spawnKind === 'waveBoss')!;
      state.enemies.splice(state.enemies.indexOf(boss), 1);
      events.push(...killEnemy(state, runtime, constRng(0.25), boss));
      return { state, events };
    };
    const wave9 = rewardsFor(9);
    const wave10 = rewardsFor(10);
    expect(wave9.state.cards.filter(Boolean)).toEqual([
      expect.objectContaining({ star: 4 }),
    ]);
    expect(wave10.state.cards.filter(Boolean).map(card => card!.star)).toEqual([5, 3]);
    expect(wave9.state.groundDrops).toEqual([
      expect.objectContaining({ kind: 'wildcard', star: 5, count: 1, source: 'bossKill' }),
    ]);
    expect(wave10.state.groundDrops).toEqual([
      expect.objectContaining({ kind: 'wildcard', star: 5, count: 1, source: 'bossKill' }),
    ]);
    expect([...wave9.state.groundDrops, ...wave10.state.groundDrops].every(drop => drop.secure)).toBe(true);
    expect(wave9.events).toContainEqual(expect.objectContaining({
      type: 'validationRewardGranted', star: 4, delivery: 'hand',
    }));
    expect(wave10.events.filter(event => event.type === 'validationRewardGranted'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ star: 5, delivery: 'hand' }),
        expect.objectContaining({ star: 3, delivery: 'hand' }),
      ]));
  });

  it('keeps secure rewards forever, lets wildcards bypass a full hand, and holds concrete cards until space exists', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 9);
    state.cards.fill(card('pierce', 1));
    const elite = state.enemies.pop()!;
    killEnemy(state, runtime, constRng(0.25), elite);
    const secure = state.groundDrops[0];
    const life = secure.life;
    tickDrops(state, runtime, constRng(0.25), life + 100);
    expect(secure.life).toBe(life);
    expect(state.expired).toBe(0);
    advanceWavePhase(state, runtime, constRng(0.25));
    state.validationRewardSettleRemaining = 0;
    advanceWavePhase(state, runtime, constRng(0.25));
    const boss = state.enemies.pop()!;
    killEnemy(state, runtime, constRng(0.25), boss);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    state.cards.fill(card('pierce', 1));
    const cardDrop = state.groundDrops.find(drop => drop.kind === 'card')!;
    const wildcardDrop = state.groundDrops.find(drop => drop.kind === 'wildcard')!;
    expect(collectDrop(state, runtime, constRng(0.25), wildcardDrop)).toContainEqual(
      expect.objectContaining({ type: 'wildcardsGranted', grants: [{ star: 5, count: 1 }] }),
    );
    expect(collectDrop(state, runtime, constRng(0.25), cardDrop)).toEqual([
      expect.objectContaining({ type: 'cardsFull', dropId: cardDrop.id, secure: true }),
    ]);
    expect(state.groundDrops).toEqual([cardDrop]);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    state.cards[0] = null;
    expect(collectDrop(state, runtime, constRng(0.25), cardDrop)).toContainEqual(
      expect.objectContaining({ type: 'collected', star: 4, validationTypePolicy: 'focusGod' }),
    );
    expect(state.groundDrops).toHaveLength(0);
    expect(state.wildcards[5]).toBe(1);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toContainEqual({ type: 'waveCleared', wave: 9 });
  });
});
