import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef } from '../src/core/effects/defs';
import { absorbBreach, tickEffects } from '../src/core/effects/runtime';
import { moveEnemies } from '../src/core/systems/enemySystem';
import type { CardType, CombatVfx, GameEvent, GameState, Rng } from '../src/core/types';
import {
  card,
  createDefaultConfig,
  enemy,
  fixtureEvolutionTree,
  freshState,
  registerSkillDefs,
  resetTestEnv,
} from './helpers';

const config = createDefaultConfig();
const turret = cfg.combat.turret;

function defenseDef(id: CardType, equip: BindingDef[]): CardDef {
  const tier = { radius: 100, effects: [] };
  return {
    id,
    identityContract: 'test fixture',
    category: 'defense',
    synergyTags: ['defense'],
    textKey: `test.${id}`,
    teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip },
      '6': { tier: 'transform', equip },
    },
    amplifyAxis: { params: {} },
    evolutionTree: fixtureEvolutionTree(id, equip),
    consumable: {
      placement: 'point',
      anchors: { '1': tier, '3': tier, '6': tier },
    },
  };
}

function equip(state: GameState, type: CardType): void {
  state.equipment[0] = card(type, 3);
}

function atTurret(partial: Parameters<typeof enemy>[0] = {}) {
  return enemy({ x: turret.x, y: turret.y, speed: 0, ...partial });
}

function seededCounter(seed: number): { rng: Rng; calls: () => number } {
  let value = seed >>> 0;
  let count = 0;
  return {
    rng: () => {
      count++;
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 0x100000000;
    },
    calls: () => count,
  };
}

function muteVfx(state: GameState): void {
  const sink: CombatVfx[] = [];
  sink.push = (..._items: CombatVfx[]) => 0;
  state.vfx = sink;
}

beforeEach(resetTestEnv);

describe('defense feedback output channel', () => {
  it('shows a shield absorb while preserving HP and consuming one layer', () => {
    const state = freshState();
    state.shield = { hits: 2, maxHits: 2, regenRemaining: null, regenSeconds: null };
    state.enemies = [atTurret({ damage: 20, hp: 999, maxHp: 999 })];

    moveEnemies(state, config, () => 0.99, 0);

    expect(state.hp).toBe(100);
    expect(state.shield.hits).toBe(1);
    expect(state.vfx).toContainEqual({
      kind: 'shieldAbsorb', x: turret.x, y: turret.y, remaining: 0.25,
    });
  });

  it('emits break and nova feedback without changing nova damage or knockback', () => {
    registerSkillDefs([defenseDef('feedbackAegis', [{
      trigger: 'passive',
      effects: [{ atom: 'novaOnBreak', params: { damage: 10, knockbackDistance: 50 } }],
    }])]);
    const state = freshState();
    equip(state, 'feedbackAegis');
    state.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: 2 };
    const bystander = enemy({
      x: turret.x + 80,
      y: turret.y,
      hp: 100,
      maxHp: 100,
      knockbackResistOverride: 0,
    });
    state.enemies = [bystander];
    const events: GameEvent[] = [];

    expect(absorbBreach(state, config, () => 0.99, 28, events)).toBeNull();

    expect(events).toContainEqual({ type: 'shieldBroken' });
    expect(state.vfx).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'shieldAbsorb' }),
      expect.objectContaining({ kind: 'shieldBreak' }),
      expect.objectContaining({ kind: 'retaliationNova', radius: 220 }),
    ]));
    expect(bystander.hp).toBe(90);
    expect(bystander.x).toBeGreaterThan(turret.x + 80);
  });

  it('announces shield restoration and emits its formation effect', () => {
    const state = freshState();
    state.shield = { hits: 0, maxHits: 3, regenRemaining: 0.05, regenSeconds: 2 };

    const events = tickEffects(state, config, () => 0.99, 0.1);

    expect(state.shield.hits).toBe(3);
    expect(state.shield.regenRemaining).toBeNull();
    expect(events).toContainEqual({ type: 'shieldRestored' });
    expect(state.vfx).toContainEqual({
      kind: 'shieldRegen', x: turret.x, y: turret.y, remaining: 0.4,
    });
  });

  it('marks a lethal thorns reflection with the breached enemy id', () => {
    registerSkillDefs([defenseDef('feedbackThorns', [{
      trigger: 'passive',
      effects: [{ atom: 'thorns', params: { ratio: 2 } }],
    }])]);
    const state = freshState();
    equip(state, 'feedbackThorns');
    const breached = atTurret({ id: 77, hp: 10, maxHp: 10, damage: 8 });
    state.enemies = [breached];

    moveEnemies(state, config, () => 0.99, 0);

    expect(state.enemies).not.toContain(breached);
    expect(state.kills).toBe(1);
    expect(state.hp).toBe(100);
    expect(state.vfx).toContainEqual({
      kind: 'thornsReflect',
      x: turret.x,
      y: turret.y,
      enemyId: 77,
      remaining: 0.35,
    });
  });

  it('shows mitigation only when breach reduction actually reduces HP damage', () => {
    registerSkillDefs([defenseDef('feedbackReduction', [{
      trigger: 'passive',
      effects: [{ atom: 'breachReduction', params: { ratio: 0.5 } }],
    }])]);
    const state = freshState();
    equip(state, 'feedbackReduction');
    state.enemies = [atTurret({ damage: 28, hp: 999, maxHp: 999 })];

    const events = moveEnemies(state, config, () => 0.99, 0);

    expect(state.hp).toBe(86);
    expect(events).toContainEqual({ type: 'breakthrough', damage: 14 });
    expect(state.vfx).toContainEqual({
      kind: 'breachMitigated', x: turret.x, y: turret.y, remaining: 0.3,
    });
  });

  it('does not consume RNG or affect simulation when the VFX output channel is disabled', () => {
    const bindings: BindingDef[] = [
      {
        trigger: 'passive',
        effects: [
          { atom: 'breachReduction', params: { ratio: 0.25 } },
          { atom: 'thorns', params: { ratio: 0.2 } },
          { atom: 'novaOnBreak', params: { damage: 0, knockbackDistance: 0 } },
        ],
      },
      {
        trigger: 'onBreach',
        effects: [{ atom: 'burstDamage', params: { damageMul: 0, radius: 180 } }],
      },
    ];
    registerSkillDefs([defenseDef('feedbackDeterminism', bindings)]);
    const visible = freshState();
    const muted = freshState();
    equip(visible, 'feedbackDeterminism');
    equip(muted, 'feedbackDeterminism');
    visible.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: null };
    muted.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: null };
    muteVfx(muted);
    const visibleRng = seededCounter(0x5eed);
    const mutedRng = seededCounter(0x5eed);
    const visibleEvents: GameEvent[] = [];
    const mutedEvents: GameEvent[] = [];

    for (const spec of [
      { id: 101, hp: 999, maxHp: 999, damage: 12 },
      { id: 102, hp: 999, maxHp: 999, damage: 12 },
      { id: 103, hp: 2, maxHp: 2, damage: 12 },
    ]) {
      visible.enemies = [atTurret(spec)];
      muted.enemies = [atTurret(spec)];
      visibleEvents.push(...moveEnemies(visible, config, visibleRng.rng, 0));
      mutedEvents.push(...moveEnemies(muted, config, mutedRng.rng, 0));
    }

    expect(visible.vfx.length).toBeGreaterThan(0);
    expect(muted.vfx).toHaveLength(0);
    expect(visibleRng.calls()).toBe(mutedRng.calls());
    expect(visible.hp).toBe(muted.hp);
    expect(visible.kills).toBe(muted.kills);
    expect(visible.enemies).toEqual(muted.enemies);
    expect(visible.particles).toEqual(muted.particles);
    expect(visibleEvents).toEqual(mutedEvents);
  });
});
