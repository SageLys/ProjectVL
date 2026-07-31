import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { applyFreeze, applyKnockback } from '../src/core/effects/statusSystem';
import { tickBountySystem } from '../src/core/systems/bountySystem';
import {
  advanceWavePhase, jumpToWave, tickSpawns, tickValidationDirector,
} from '../src/core/systems/waveSystem';
import {
  createEnemy, determineValidationType, randomEdgeSpawnPosition, spawnEnemy,
} from '../src/core/systems/enemySystem';
import { killEnemy } from '../src/core/systems/damageSystem';
import { collectDrop, tickDrops } from '../src/core/systems/dropSystem';
import { card, constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function enterValidationBoss(wave: 9 | 10 = 9) {
  const state = freshState();
  const runtime = createDefaultConfig();
  jumpToWave(state, runtime, constRng(0.25), wave);
  state.spawnLeft = 0;
  state.enemies.length = 0;
  tickValidationDirector(state, runtime, constRng(0.25), 0);
  state.enemies.length = 0;
  advanceWavePhase(state, runtime, constRng(0.25));
  state.validationRewardSettleRemaining = 0;
  advanceWavePhase(state, runtime, constRng(0.25));
  return { state, runtime };
}

describe('validation swarm and milestones', () => {
  it('starts with the configured Budget quota and no fixed elite', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 9);
    expect(state.spawnLeft).toBe(cfg.waves.stagePlan.validation[0].swarm.quota);
    expect(state.waveSpawnQuota).toBe(state.spawnLeft);
    expect(state.enemies).toHaveLength(0);
  });

  it('spawns validation minions through Budget admission without exceeding maxAlive', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 9);
    for (let index = 0; index < 100; index++) {
      tickSpawns(state, constRng(0.25), 1);
      expect(state.enemies.length).toBeLessThanOrEqual(cfg.waves.stagePlan.validation[0].swarm.maxAlive);
    }
    expect(state.enemies.some(enemy => enemy.spawnKind === 'validationMinion')).toBe(true);
  });

  it('uses only validation composition and covers cumulative boundaries', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0.25), 9);
    cfg.waves.stagePlan.validation[0].swarm.composition = { normal: 1, fast: 0, tank: 0 };
    for (let index = 0; index < 200; index++) spawnEnemy(state, constRng(0));
    expect(state.enemies.every(enemy => enemy.type === 'normal')).toBe(true);
    const mix = { normal: 6, fast: 3, tank: 1 };
    expect([0, 0.6, 0.9, 0.999].map(roll => determineValidationType(mix, roll)))
      .toEqual(['normal', 'fast', 'tank', 'tank']);
    expect(determineValidationType({ normal: 0, fast: 0, tank: 0 }, 0.5)).toBe('normal');
  });

  it('spawns each milestone elite exactly once after its progress threshold', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 9);
    const quota = state.waveSpawnQuota;
    state.spawnLeft = quota * 0.51;
    tickValidationDirector(state, runtime, constRng(0.25), 0);
    expect(state.enemies.filter(enemy => enemy.spawnKind === 'validationElite')).toHaveLength(0);
    state.spawnLeft = quota * 0.49;
    tickValidationDirector(state, runtime, constRng(0.25), 0);
    tickValidationDirector(state, runtime, constRng(0.25), 0);
    const elite = state.enemies.find(enemy => enemy.spawnKind === 'validationElite')!;
    expect(state.enemies.filter(enemy => enemy.spawnKind === 'validationElite')).toHaveLength(1);
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

  it('waits for minions and elites, then enters validation reward settlement', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 9);
    state.spawnLeft = 0;
    const minion = createEnemy(state, 'normal', 9, { x: 0, y: 0 }, { spawnKind: 'validationMinion' });
    state.enemies.push(minion);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    state.enemies.length = 0;
    state.validationRuntime.spawnedEliteIndexes = cfg.waves.stagePlan.validation[0].elites.map((_, index) => index);
    expect(advanceWavePhase(state, runtime, constRng(0.25)))
      .toContainEqual({ type: 'validationRewardSettleStarted', wave: 9, seconds: 12 });
  });

  it('resets milestone runtime on debug jumps and disables encounters with the stage-plan switch', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    jumpToWave(state, runtime, constRng(0.25), 9);
    state.validationRuntime.spawnedEliteIndexes.push(0);
    jumpToWave(state, runtime, constRng(0.25), 9);
    expect(state.validationRuntime.spawnedEliteIndexes).toEqual([]);
    cfg.waves.stagePlan.enabled = false;
    jumpToWave(state, runtime, constRng(0.25), 9);
    expect(state.spawnLeft).toBe(cfg.waves.budget.waveQuota.base + 9 * cfg.waves.budget.waveQuota.perWave);
    expect(state.enemies).toHaveLength(0);
  });

  it('does not generate Bounty offers in validation', () => {
    const state = freshState();
    jumpToWave(state, createDefaultConfig(), constRng(0), 9);
    cfg.bounty.offer.baseChancePerCheck = 1;
    cfg.bounty.offer.maxChancePerCheck = 1;
    tickBountySystem(state, createDefaultConfig(), constRng(0), cfg.bounty.offer.checkIntervalSeconds * 2);
    expect(state.bountyOffers).toHaveLength(0);
  });
});

describe('validation Boss escorts', () => {
  it('waits one full interval, respects maxAlive, and clears escorts without rewards after Boss death', () => {
    const { state, runtime } = enterValidationBoss();
    const escort = cfg.waves.stagePlan.validation[0].bossEscort!;
    expect(tickValidationDirector(state, runtime, constRng(0.25), 0)).toEqual([]);
    tickValidationDirector(state, runtime, constRng(0.25), escort.intervalSeconds);
    expect(state.enemies.filter(enemy => enemy.spawnKind === 'validationMinion')).toHaveLength(escort.count);
    for (let index = 0; index < 20; index++) {
      tickValidationDirector(state, runtime, constRng(0.25), escort.intervalSeconds);
    }
    expect(state.enemies.filter(enemy => enemy.spawnKind === 'validationMinion').length).toBe(escort.maxAlive);
    const boss = state.enemies.find(enemy => enemy.spawnKind === 'waveBoss')!;
    state.enemies.splice(state.enemies.indexOf(boss), 1);
    const kills = state.kills;
    const points = state.rewardMeter.points;
    const events = tickValidationDirector(state, runtime, constRng(0.25), 0);
    expect(events).toContainEqual({ type: 'validationEscortsCleared', wave: 9, removed: escort.maxAlive });
    expect(state.enemies.some(enemy => enemy.spawnKind === 'validationMinion')).toBe(false);
    expect(state.kills).toBe(kills);
    expect(state.rewardMeter.points).toBe(points);
  });

  it('does not summon escorts when bossEscort is omitted in dev-short', () => {
    const short = cfg.waves.stagePlan.validation[0];
    const saved = short.bossEscort;
    delete short.bossEscort;
    try {
      const { state, runtime } = enterValidationBoss();
      tickValidationDirector(state, runtime, constRng(0.25), 100);
      expect(state.enemies.some(enemy => enemy.spawnKind === 'validationMinion')).toBe(false);
    } finally {
      short.bossEscort = saved;
    }
  });
});

describe('validation reward isolation', () => {
  function killMinions(rateEnabled: boolean) {
    cfg.economy.ordinaryDropRate.enabled = rateEnabled;
    const state = freshState();
    const runtime = { ...createDefaultConfig(), dropChance: 1 };
    jumpToWave(state, runtime, constRng(0), 9);
    const points = state.rewardMeter.points;
    for (let index = 0; index < 100; index++) {
      const enemy = createEnemy(state, 'normal', 9, randomEdgeSpawnPosition(constRng(0)), {
        spawnKind: 'validationMinion',
      });
      killEnemy(state, runtime, constRng(0), enemy);
    }
    return { state, points };
  }

  it.each([true, false])('blocks ordinary drops in both rate branches (enabled=%s)', enabled => {
    const { state } = killMinions(enabled);
    expect(state.groundDrops.filter(drop => drop.source === 'normalKill')).toHaveLength(0);
    expect(state.ordinaryDrop.shownThisWave).toBe(0);
  });

  it('still counts kills and grants reward-meter progress', () => {
    const { state, points } = killMinions(true);
    expect(state.kills).toBe(100);
    expect(state.rewardMeter.points > points || state.rewardMeter.activationCount > 0).toBe(true);
  });

  it('creates exactly the configured 2 + 3 secure rewards, all at least 4★', () => {
    const dropsFor = (wave: 9 | 10) => {
      const state = freshState();
      const runtime = createDefaultConfig();
      state.cards.fill(card('pierce', 1));
      jumpToWave(state, runtime, constRng(0.25), wave);
      state.spawnLeft = 0;
      tickValidationDirector(state, runtime, constRng(0.25), 0);
      for (const elite of state.enemies.filter(enemy => enemy.spawnKind === 'validationElite')) {
        state.enemies.splice(state.enemies.indexOf(elite), 1);
        killEnemy(state, runtime, constRng(0.25), elite);
      }
      state.enemies.length = 0;
      advanceWavePhase(state, runtime, constRng(0.25));
      state.validationRewardSettleRemaining = 0;
      advanceWavePhase(state, runtime, constRng(0.25));
      const boss = state.enemies.find(enemy => enemy.spawnKind === 'waveBoss')!;
      state.enemies.splice(state.enemies.indexOf(boss), 1);
      killEnemy(state, runtime, constRng(0.25), boss);
      return state.groundDrops;
    };
    const wave9 = dropsFor(9);
    const wave10 = dropsFor(10);
    expect(wave9).toHaveLength(2);
    expect(wave10).toHaveLength(3);
    expect([...wave9, ...wave10].every(drop => drop.secure && drop.star >= 4)).toBe(true);
  });

  it('keeps secure validation rewards alive and gates completion until pickup', () => {
    const { state, runtime } = enterValidationBoss();
    state.cards.fill(card('pierce', 1));
    const boss = state.enemies.find(enemy => enemy.spawnKind === 'waveBoss')!;
    state.enemies.splice(state.enemies.indexOf(boss), 1);
    killEnemy(state, runtime, constRng(0.25), boss);
    tickValidationDirector(state, runtime, constRng(0.25), 0);
    const secure = state.groundDrops[0];
    const life = secure.life;
    tickDrops(state, runtime, constRng(0.25), life + 100);
    expect(secure.life).toBe(life);
    expect(advanceWavePhase(state, runtime, constRng(0.25))).toEqual([]);
    expect(collectDrop(state, runtime, constRng(0.25), secure)).toContainEqual(
      expect.objectContaining({ type: 'wildcardsGranted' }),
    );
    expect(advanceWavePhase(state, runtime, constRng(0.25)))
      .toContainEqual({ type: 'waveCleared', wave: 9 });
  });
});
