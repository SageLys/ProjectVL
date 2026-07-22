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
    jumpToWave(state, runtime, constRng(0.25), 7);
    expect(state.spawnLeft).toBe(0);
    expect(state.waveSpawnQuota).toBe(0);
    expect(state.enemies.map(enemy => enemy.spawnKind)).toEqual(['validationElite']);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    state.enemies.length = 0;
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toContainEqual({ type: 'waveBossSpawned', wave: 7 });
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0].spawnKind).toBe('waveBoss');

    jumpToWave(state, runtime, constRng(0.25), 8);
    expect(state.spawnLeft).toBe(0);
    expect(state.enemies).toHaveLength(2);
    expect(state.enemies.every(enemy => enemy.spawnKind === 'validationElite')).toBe(true);
    expect(state.enemies.map(enemy => enemy.type)).toEqual(['tank', 'fast']);
  });

  it('stores and applies per-instance control and knockback resistance overrides', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 7);
    const elite = state.enemies[0];
    expect(elite).toMatchObject({
      ccResistOverride: 0.7,
      knockbackResistOverride: 0.8,
      validationReward: { kind: 'card', star: 4, count: 1, typePolicy: 'build' },
    });
    applyFreeze(elite, 10);
    expect(elite.status.frozen).toBeCloseTo(3, 10);
    elite.status.frozen = 0;
    elite.x = 10;
    elite.y = 0;
    expect(applyKnockback(elite, 0, 0, 100)).toBe(true);
    expect(elite.x).toBeCloseTo(30, 10);
  });

  it('does not generate Bounty offers in validation', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0), 7);
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds * 2);
    expect(state.bountyOffers).toHaveLength(0);
    expect(state.bountyDirector.offersThisWave).toBe(0);
  });

  it('restores the legacy linear Budget and no fixed encounter when the rollback switch is off', () => {
    cfg.economy.ordinaryDropRate.enabled = false;
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 7);
    expect(state.spawnLeft).toBe(cfg.waves.budget.waveQuota.base + 7 * cfg.waves.budget.waveQuota.perWave);
    expect(state.enemies).toHaveLength(0);
  });

  it('creates exactly 2 + 3 secure pickups with the configured star/count composition', () => {
    const runtime = createDefaultConfig();
    const rewardsFor = (wave: 7 | 8) => {
      const state = freshState();
      jumpToWave(state, runtime, constRng(0.25), wave);
      for (const elite of [...state.enemies]) {
        state.enemies.splice(state.enemies.indexOf(elite), 1);
        killEnemy(state, runtime, constRng(0.25), elite);
      }
      advanceWavePhase(state, runtime, constRng(0.25));
      const boss = state.enemies.find(enemy => enemy.spawnKind === 'waveBoss')!;
      state.enemies.splice(state.enemies.indexOf(boss), 1);
      killEnemy(state, runtime, constRng(0.25), boss);
      return state;
    };
    const wave7 = rewardsFor(7);
    const wave8 = rewardsFor(8);
    expect(wave7.groundDrops).toHaveLength(2);
    expect(wave8.groundDrops).toHaveLength(3);
    expect(wave7.groundDrops).toEqual([
      expect.objectContaining({ kind: 'card', star: 4, validationTypePolicy: 'build', source: 'validationElite' }),
      expect.objectContaining({ kind: 'wildcard', star: 5, count: 1, source: 'bossKill' }),
    ]);
    expect(wave8.groundDrops).toEqual([
      expect.objectContaining({ kind: 'card', star: 5, validationTypePolicy: 'build', source: 'validationElite' }),
      expect.objectContaining({ kind: 'card', star: 3, validationTypePolicy: 'pivot', source: 'validationElite' }),
      expect.objectContaining({ kind: 'wildcard', star: 5, count: 1, source: 'bossKill' }),
    ]);
    expect([...wave7.groundDrops, ...wave8.groundDrops].every(drop => drop.secure)).toBe(true);
  });

  it('keeps secure rewards forever, lets wildcards bypass a full hand, and holds concrete cards until space exists', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 7);
    const elite = state.enemies.pop()!;
    killEnemy(state, runtime, constRng(0.25), elite);
    const secure = state.groundDrops[0];
    const life = secure.life;
    tickDrops(state, runtime, constRng(0.25), life + 100);
    expect(secure.life).toBe(life);
    expect(state.expired).toBe(0);
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
      expect.objectContaining({ type: 'collected', star: 4, validationTypePolicy: 'build' }),
    );
    expect(state.groundDrops).toHaveLength(0);
    expect(state.wildcards[5]).toBe(1);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toContainEqual({ type: 'waveCleared', wave: 7 });
  });
});
