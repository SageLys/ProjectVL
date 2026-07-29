import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { fireTrigger, registerSkillDefs, tickIntervalBindings } from '../src/core/effects/interpreter';
import { ATOMS, type EffectCtx } from '../src/core/effects/registry';
import { tickEffects } from '../src/core/effects/runtime';
import { formatEffect } from '../src/ui/effectText';
import type { CardDef } from '../src/core/effects/defs';
import type { GameState } from '../src/core/types';
import {
  card, constRng, createDefaultConfig, enemy, fixtureEvolutionTree, freshState, resetTestEnv,
} from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

function context(state: GameState, over: Partial<EffectCtx> = {}): EffectCtx {
  return {
    state, config, rng, events: [], origin: { x: 100, y: 100 }, star: 3, baseDamage: 10,
    ...over,
  };
}

function lineProbe(): CardDef {
  const equip = [{
    trigger: 'onHit' as const,
    effects: [{
      atom: 'groundZone' as const,
      params: { shape: 'line' as const, radius: 20, duration: 2, tickInterval: 1, effects: [] },
    }],
  }];
  return {
    id: 'pierce', category: 'projectile', synergyTags: ['projectile'], textKey: 'test.lineProbe', teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip },
      '6': { tier: 'transform', equip },
    },
    amplifyAxis: { params: {} },
    evolutionTree: fixtureEvolutionTree('pierce', equip),
    consumable: {
      placement: 'point', interpolation: 'linear',
      anchors: {
        '1': { radius: 20, duration: 2, effects: [] },
        '3': { radius: 20, duration: 2, effects: [] },
        '6': { radius: 20, duration: 2, effects: [] },
      },
    },
  };
}

describe('groundZone line geometry', () => {
  it('materializes the checked-in flashfireC2 declaration as line geometry', () => {
    const state = freshState();
    const equipped = card('flashfire', 5);
    equipped.evolutionPath = ['3:flashfireC', '5:flashfireC2'];
    state.equipment[0] = equipped;
    state.enemies = [enemy({ x: cfg.combat.turret.x + 100, y: cfg.combat.turret.y })];

    tickIntervalBindings(state, config, rng, 4);

    expect(state.zones).toContainEqual(expect.objectContaining({
      shape: 'line', lineLength: 140, lineWidth: 70,
    }));
  });

  it('uses payload.point versus turret as the preferred deterministic direction', () => {
    registerSkillDefs([lineProbe()]);
    const state = freshState();
    state.equipment[0] = card('pierce', 3);
    const turret = cfg.combat.turret;
    const point = { x: turret.x, y: turret.y - 100 };

    fireTrigger(state, config, rng, 'onHit', { point });

    expect(state.zones).toHaveLength(1);
    expect(state.zones[0]).toMatchObject({
      shape: 'line', lineStartX: point.x, lineStartY: point.y,
      lineDirX: 0, lineDirY: -1, lineLength: 40, lineWidth: 20,
    });
  });

  it('aims from origin at the nearest enemy without payload and falls back to +x without enemies', () => {
    const aimed = freshState();
    aimed.enemies = [
      enemy({ x: 100, y: 40 }),
      enemy({ x: 180, y: 100 }),
    ];
    ATOMS.groundZone(context(aimed), { shape: 'line', radius: 20, duration: 2, tickInterval: 1, effects: [] });
    expect(aimed.zones[0]).toMatchObject({ lineDirX: 0, lineDirY: -1 });

    const fallback = freshState();
    ATOMS.groundZone(context(fallback), { shape: 'line', radius: 20, duration: 2, tickInterval: 1, effects: [] });
    expect(fallback.zones[0]).toMatchObject({ lineDirX: 1, lineDirY: 0 });
  });

  it('hits by point-to-segment distance no greater than half width', () => {
    const state = freshState();
    const turret = cfg.combat.turret;
    const start = { x: turret.x + 100, y: turret.y };
    const inside = enemy({ x: start.x + 20, y: start.y + 9, hp: 100, maxHp: 100 });
    const outside = enemy({ x: start.x + 20, y: start.y + 11, hp: 100, maxHp: 100, r: 50 });
    const pastEnd = enemy({ x: start.x + 51, y: start.y, hp: 100, maxHp: 100 });
    state.enemies = [inside, outside, pastEnd];
    ATOMS.groundZone(context(state, { origin: start, triggerPoint: start }), {
      shape: 'line', radius: 20, duration: 2, tickInterval: 1,
      effects: [{ atom: 'dot', params: { damagePerTick: 5 } }],
    });

    tickEffects(state, config, rng, 0.01);

    expect(inside.hp).toBe(95);
    expect(outside.hp).toBe(100);
    expect(pastEnd.hp).toBe(100);
  });

  it('describes line dimensions and shape to players', () => {
    const text = formatEffect({
      atom: 'groundZone',
      params: { shape: 'line', radius: 20, duration: 3, effects: [] },
    }).map(line => line.text).join(' ');
    expect(text).toContain('线形领域');
    expect(text).toContain('长 40');
    expect(text).toContain('宽 20');
  });
});
