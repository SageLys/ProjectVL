import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { difficultyMultipliersFor } from '../src/core/difficulty';
import { updateGame } from '../src/core/updateGame';
import type { CardDef } from '../src/core/effects/defs';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { applyKnockback } from '../src/core/effects/statusSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import { findTarget } from '../src/core/systems/combatSystem';
import { collectDrop } from '../src/core/systems/dropSystem';
import { moveEnemies, spawnWaveBoss } from '../src/core/systems/enemySystem';
import { advanceWavePhase } from '../src/core/systems/waveSystem';
import type { Enemy, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, fixtureEvolutionTree, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);
const turret = { x: 270, y: 365 };

beforeEach(resetTestEnv);

function runtime(phase: 'approach' | 'contact', orbitDirection: -1 | 1 = 1, remaining = 0.4) {
  return { phase, orbitDirection, contactTickRemaining: remaining, contactAngle: 0 } as const;
}

function contactBoss(partial: Partial<Enemy> = {}): Enemy {
  return enemy({
    type: 'boss', spawnKind: 'waveBoss', x: turret.x + 48, y: turret.y,
    hp: 10000, maxHp: 10000, speed: 30, r: 35, damage: 28, contactDps: 14,
    bossRuntime: runtime('contact'),
    ...partial,
  });
}

function triggerDef(id: string, atom: 'groundZone' | 'novaOnBreak', params: Record<string, unknown>): CardDef {
  const equip = atom === 'groundZone'
    ? [{ trigger: 'onBreach' as const, effects: [{ atom, params }] }]
    : [{ trigger: 'passive' as const, effects: [{ atom, params }] }];
  const tier = { radius: 1, effects: [{ atom: 'burstDamage' as const, params: { damageMul: 0, radius: 1 } }] };
  return {
    id, category: 'defense', synergyTags: ['defense'], textKey: `t.${id}`, teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip },
      '6': { tier: 'transform', equip },
    },
    amplifyAxis: { params: {} },
    evolutionTree: fixtureEvolutionTree(id, equip),
    consumable: { placement: 'point', anchors: { '1': tier, '3': tier, '6': tier } },
  };
}

function equip(state: GameState, type: string): void {
  state.equipment[0] = card(type, 3);
}

function simulateContact(dt: number, seconds: number): GameState {
  const state = freshState();
  state.wave = 1;
  state.enemies = [contactBoss()];
  for (let i = 0; i < Math.round(seconds / dt); i++) moveEnemies(state, config, rng, dt);
  return state;
}

describe('wave Boss approach and contact behavior', () => {
  it('enters contact at the turret instead of teleporting back to an edge', () => {
    const state = freshState();
    state.wave = 1;
    const boss = contactBoss({
      x: turret.x + cfg.enemies.bossBehavior.contactDistance - 1,
      bossRuntime: runtime('approach'),
    });
    state.enemies = [boss];

    const events = moveEnemies(state, config, rng, 1 / 60);

    expect(boss.bossRuntime?.phase).toBe('contact');
    expect(Math.hypot(boss.x - turret.x, boss.y - turret.y)).toBeCloseTo(cfg.enemies.bossBehavior.contactDistance);
    expect(events).toContainEqual({ type: 'bossContactStarted', enemyId: boss.id });
    expect(boss.x).not.toBeCloseTo(-cfg.waves.spawnMargin);
    expect(boss.x).not.toBeCloseTo(cfg.combat.canvas.width + cfg.waves.spawnMargin);
    expect(boss.y).not.toBeCloseTo(-cfg.waves.spawnMargin);
    expect(boss.y).not.toBeCloseTo(cfg.combat.canvas.height + cfg.waves.spawnMargin);
  });

  it('snaps the final curved step into contact so the live frame loop starts dealing damage', () => {
    const state = freshState();
    state.wave = 1;
    state.wavePhase = 'boss';
    const boss = spawnWaveBoss(state, rng);
    state.waveBossId = boss.id;
    const dt = 1 / 60;
    const finalStep = boss.speed * config.enemySpeed * dt;
    boss.x = turret.x + cfg.enemies.bossBehavior.contactDistance + finalStep;
    boss.y = turret.y;

    const entryEvents = updateGame(state, config, rng, dt);

    expect(boss.bossRuntime?.phase).toBe('contact');
    expect(Math.hypot(boss.x - turret.x, boss.y - turret.y)).toBeCloseTo(cfg.enemies.bossBehavior.contactDistance);
    expect(entryEvents).toContainEqual({ type: 'bossContactStarted', enemyId: boss.id });
    const hpBeforePulse = state.hp;
    const pulseEvents = updateGame(state, config, rng, cfg.enemies.bossBehavior.contactWarmup);
    expect(state.hp).toBeLessThan(hpBeforePulse);
    expect(pulseEvents).toContainEqual({ type: 'bossContactDamage', enemyId: boss.id, damage: 7 });
  });

  it('remains targetable in contact, grants the existing reward on death, and lets the Boss phase finish', () => {
    const state = freshState();
    state.wave = 1;
    state.wavePhase = 'boss';
    const boss = contactBoss({ hp: 1, maxHp: 1 });
    state.enemies = [boss];
    state.waveBossId = boss.id;

    expect(findTarget(state, config)).toBe(boss);
    dealDamage(state, config, rng, boss, 1);

    expect(state.enemies).not.toContain(boss);
    expect(state.bossRewardClaimedWave).toBe(1);
    expect(state.groundDrops.some(drop => drop.kind === 'wildcard' && drop.bossRewardWave === 1)).toBe(true);
    collectDrop(state, config, rng, state.groundDrops[0]);
    expect(advanceWavePhase(state, config, rng)).toEqual([{ type: 'waveCleared', wave: 1 }]);
    expect(state.wavePhase).toBe('between');
  });

  it('resolves the same contact damage at 30, 60, and 120 FPS', () => {
    const hp = [1 / 30, 1 / 60, 1 / 120].map(dt => simulateContact(dt, 4).hp);
    expect(hp[0]).toBeCloseTo(hp[1], 8);
    expect(hp[1]).toBeCloseTo(hp[2], 8);
  });

  it('fires onBreach once per contact entry, never once per pulse', () => {
    registerSkillDefs([triggerDef('contactProbe', 'groundZone', { radius: 10, duration: 10, tickInterval: 10, effects: [] })]);
    const state = freshState();
    state.wave = 1;
    equip(state, 'contactProbe');
    const boss = contactBoss({ x: turret.x + 47, bossRuntime: runtime('approach') });
    state.enemies = [boss];

    moveEnemies(state, config, rng, 0);
    expect(state.zones).toHaveLength(1);
    moveEnemies(state, config, rng, 2);
    expect(state.zones).toHaveLength(1);

    boss.x = turret.x + cfg.enemies.bossBehavior.contactExitDistance + 1;
    moveEnemies(state, config, rng, 0);
    expect(boss.bossRuntime?.phase).toBe('approach');
    boss.x = turret.x + cfg.enemies.bossBehavior.contactDistance - 1;
    moveEnemies(state, config, rng, 0);
    expect(state.zones).toHaveLength(2);
  });

  it('absorbs individual pulses with shields and lets a break nova end contact', () => {
    registerSkillDefs([triggerDef('stationaryNova', 'novaOnBreak', { damage: 0, knockbackDistance: 0 })]);
    const state = freshState();
    state.wave = 1;
    equip(state, 'stationaryNova');
    state.shield = { hits: 2, maxHits: 2, regenRemaining: null, regenSeconds: null };
    state.enemies = [contactBoss({ bossRuntime: runtime('contact', 1, 0) })];

    expect(moveEnemies(state, config, rng, 0).filter(event => event.type === 'shieldBroken')).toHaveLength(0);
    expect(state.hp).toBe(100);
    expect(moveEnemies(state, config, rng, 0.5).filter(event => event.type === 'shieldBroken')).toHaveLength(1);
    expect(state.hp).toBe(100);
    expect(moveEnemies(state, config, rng, 0.5)).toContainEqual({
      type: 'bossContactDamage', enemyId: state.enemies[0].id, damage: 7,
    });
    expect(state.hp).toBe(93);

    resetTestEnv();
    registerSkillDefs([triggerDef('pushNova', 'novaOnBreak', { damage: 0, knockbackDistance: 120 })]);
    const pushed = freshState();
    pushed.wave = 1;
    equip(pushed, 'pushNova');
    pushed.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: null };
    const pushedBoss = contactBoss({ knockbackResistOverride: 0, bossRuntime: runtime('contact', 1, 0) });
    pushed.enemies = [pushedBoss];
    expect(moveEnemies(pushed, config, rng, 0).filter(event => event.type === 'shieldBroken')).toHaveLength(1);
    expect(Math.hypot(pushedBoss.x - turret.x, pushedBoss.y - turret.y)).toBeGreaterThanOrEqual(cfg.enemies.bossBehavior.contactExitDistance);
    expect(moveEnemies(pushed, config, rng, 0)).toContainEqual({ type: 'bossContactEnded', enemyId: pushedBoss.id });
    expect(pushedBoss.bossRuntime?.phase).toBe('approach');
  });

  it.each(['frozen', 'stunned'] as const)('pauses contact timing while %s without catch-up pulses', status => {
    const state = freshState();
    state.wave = 1;
    const boss = contactBoss({ bossRuntime: runtime('contact', 1, 0.2) });
    boss.status[status] = 1;
    state.enemies = [boss];

    moveEnemies(state, config, rng, 1);
    expect(state.hp).toBe(100);
    expect(boss.bossRuntime?.contactTickRemaining).toBeCloseTo(0.2);
    boss.status[status] = 0;
    moveEnemies(state, config, rng, 0.19);
    expect(state.hp).toBe(100);
    moveEnemies(state, config, rng, 0.02);
    expect(state.hp).toBe(93);
  });

  it('leaves contact after sufficient knockback', () => {
    const state = freshState();
    const boss = contactBoss({ knockbackResistOverride: 0 });
    state.enemies = [boss];

    expect(applyKnockback(boss, turret.x, turret.y, 20)).toBe(true);
    expect(Math.hypot(boss.x - turret.x, boss.y - turret.y)).toBeGreaterThanOrEqual(cfg.enemies.bossBehavior.contactExitDistance);
    moveEnemies(state, config, rng, 0);
    expect(boss.bossRuntime?.phase).toBe('approach');
  });

  it('keeps regular enemy breakthrough damage, removal, event, and onBreach behavior unchanged', () => {
    registerSkillDefs([triggerDef('regularProbe', 'groundZone', { radius: 10, duration: 10, tickInterval: 10, effects: [] })]);
    const state = freshState();
    equip(state, 'regularProbe');
    const regular = enemy({ x: turret.x, y: turret.y, speed: 0, damage: 8 });
    state.enemies = [regular];

    const events = moveEnemies(state, config, rng, 0);

    expect(state.enemies).not.toContain(regular);
    expect(state.hp).toBe(92);
    expect(events).toContainEqual({ type: 'breakthrough', damage: 8 });
    expect(state.zones).toHaveLength(1);
  });

  it('uses pulse damage for thorns and routes a reflected Boss death through the reward pipeline', () => {
    const thorns = triggerDef('pulseThorns', 'novaOnBreak', { damage: 0, knockbackDistance: 0 });
    thorns.stars['3']!.equip = [{ trigger: 'passive', effects: [{ atom: 'thorns', params: { ratio: 1 } }] }];
    thorns.evolutionTree = fixtureEvolutionTree('pulseThorns', thorns.stars['3']!.equip);
    registerSkillDefs([thorns]);
    const state = freshState();
    state.wave = 1;
    state.wavePhase = 'boss';
    equip(state, 'pulseThorns');
    const boss = contactBoss({ hp: 7, maxHp: 7, bossRuntime: runtime('contact', 1, 0) });
    state.enemies = [boss];
    state.waveBossId = boss.id;

    moveEnemies(state, config, rng, 0);

    expect(state.hp).toBe(100);
    expect(state.enemies).not.toContain(boss);
    expect(state.bossRewardClaimedWave).toBe(1);
    expect(state.groundDrops).toHaveLength(1);
  });

  it('curves inward monotonically in both directions and slow changes speed, not heading', () => {
    for (const orbitDirection of [-1, 1] as const) {
      const state = freshState();
      state.wave = 1;
      const boss = contactBoss({
        x: turret.x, y: -cfg.waves.spawnMargin,
        bossRuntime: runtime('approach', orbitDirection),
      });
      state.enemies = [boss];
      let previous = Math.hypot(boss.x - turret.x, boss.y - turret.y);
      for (let frame = 0; frame < 2000 && boss.bossRuntime?.phase === 'approach'; frame++) {
        moveEnemies(state, config, rng, 1 / 60);
        const distance = Math.hypot(boss.x - turret.x, boss.y - turret.y);
        expect(distance).toBeLessThanOrEqual(previous + 1e-8);
        expect(distance).toBeGreaterThanOrEqual(cfg.enemies.bossBehavior.contactDistance - 1e-8);
        expect(boss.x).toBeGreaterThanOrEqual(-cfg.waves.spawnMargin);
        expect(boss.x).toBeLessThanOrEqual(cfg.combat.canvas.width + cfg.waves.spawnMargin);
        expect(boss.y).toBeGreaterThanOrEqual(-cfg.waves.spawnMargin);
        expect(boss.y).toBeLessThanOrEqual(cfg.combat.canvas.height + cfg.waves.spawnMargin);
        previous = distance;
      }
      expect(boss.bossRuntime?.phase).toBe('contact');
    }

    const normalState = freshState();
    const slowState = freshState();
    const normal = contactBoss({ x: turret.x, y: turret.y - 100, bossRuntime: runtime('approach', 1) });
    const slowed = contactBoss({ x: normal.x, y: normal.y, bossRuntime: runtime('approach', 1) });
    slowed.status.slow = { ratio: 0.5, remaining: 10 };
    normalState.enemies = [normal];
    slowState.enemies = [slowed];
    moveEnemies(normalState, config, rng, 1 / 60);
    moveEnemies(slowState, config, rng, 1 / 60);
    const normalDelta = { x: normal.x - turret.x, y: normal.y - (turret.y - 100) };
    const slowDelta = { x: slowed.x - turret.x, y: slowed.y - (turret.y - 100) };
    const normalLen = Math.hypot(normalDelta.x, normalDelta.y);
    const slowLen = Math.hypot(slowDelta.x, slowDelta.y);
    expect(normalDelta.x / normalLen).toBeCloseTo(slowDelta.x / slowLen, 10);
    expect(normalDelta.y / normalLen).toBeCloseTo(slowDelta.y / slowLen, 10);
    expect(slowLen).toBeLessThan(normalLen);
  });

  it('initializes orbit direction from the Boss id without consuming extra RNG', () => {
    const state = freshState();
    state.wave = 1;
    let calls = 0;
    const countingRng = () => { calls++; return 0; };
    const boss = spawnWaveBoss(state, countingRng);
    expect(calls).toBe(2);
    expect(boss.bossRuntime?.orbitDirection).toBe(boss.id % 2 === 0 ? 1 : -1);
    expect(boss.contactDps).toBeCloseTo(
      14 * difficultyMultipliersFor(state.difficultyId, 'boss', state.wave).damage,
    );

    const standard = freshState();
    standard.wave = 1;
    standard.difficultyId = 'standard';
    const standardBoss = spawnWaveBoss(standard, constRng(0));
    expect(standardBoss.contactDps).toBeCloseTo(14 * 0.65);
  });
});
