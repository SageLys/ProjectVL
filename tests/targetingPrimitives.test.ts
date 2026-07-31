import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { EffectDef } from '../src/core/effects/defs';
import { runEffects, type EffectCtx } from '../src/core/effects/registry';
import { tickEffects } from '../src/core/effects/runtime';
import { validateSkillsConfig } from '../src/config/skillValidator';
import designFingerprints from '../src/config/base/designFingerprints.json';
import { constRng, createDefaultConfig, enemy, freshState } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

function context() {
  const state = freshState();
  const ctx: EffectCtx = {
    state, config, rng, events: [], origin: { ...cfg.combat.turret },
    star: 3, baseDamage: 10, sourceCardId: 7, sourceBindingIndex: 2,
  };
  return { state, ctx };
}

describe('T1–T6 targeting primitives', () => {
  it('places an effect at the deterministic densest 8×6 cluster', () => {
    const { state, ctx } = context();
    const isolated = enemy({ x: 80, y: 80, hp: 100, maxHp: 100 });
    const clustered = [enemy({ x: 700, y: 500, hp: 100, maxHp: 100 }), enemy({ x: 710, y: 505, hp: 100, maxHp: 100 })];
    state.enemies = [isolated, ...clustered];
    runEffects(ctx, [{ atom: 'burstDamage', at: 'densestCluster', params: { damageMul: 1, radius: 45 } }]);
    expect(isolated.hp).toBe(100);
    expect(clustered.every(target => target.hp === 90)).toBe(true);
  });

  it('fans out to status matches with AND semantics and a hard maxTargets cap', () => {
    const { state, ctx } = context();
    const matches = Array.from({ length: 3 }, (_, index) => enemy({ x: 100 + index * 80, y: 120, hp: 100, maxHp: 100 }));
    matches.forEach(target => {
      target.status.frozen = 1;
      target.status.vulnerable = { ratio: 0.1, remaining: 2 };
    });
    const frozenOnly = enemy({ x: 400, y: 120, hp: 100, maxHp: 100 });
    frozenOnly.status.frozen = 1;
    state.enemies = [...matches, frozenOnly];
    runEffects(ctx, [{
      forEach: {
        set: { kind: 'enemiesWithStatus', status: ['frozen', 'vulnerable'] },
        maxTargets: 2,
        effects: [{ atom: 'burstDamage', params: { damageMul: 1, radius: 0 } }],
      },
    } as unknown as EffectDef]);
    expect(matches.filter(target => target.hp < 100)).toHaveLength(2);
    expect(frozenOnly.hp).toBe(100);
  });

  it('scales only the named parameter and caps source units', () => {
    const { state, ctx } = context();
    state.enemies = Array.from({ length: 5 }, (_, index) => enemy({ x: cfg.combat.turret.x + index * 10, y: cfg.combat.turret.y, hp: 100, maxHp: 100 }));
    runEffects(ctx, [{
      atom: 'burstDamage', params: { damageMul: 1, radius: 100 },
      scaleBy: { source: 'enemiesOnField', param: 'damageMul', perUnit: 0.5, cap: 3 },
    }]);
    expect(state.enemies[0].hp).toBe(75);
  });

  it('interpolates zone radius and derives a line from the bullet path', () => {
    const { state, ctx } = context();
    runEffects(ctx, [{ atom: 'groundZone', params: {
      radius: 20, duration: 2, tickInterval: 1,
      radiusOverTime: { from: 20, to: 100, easing: 'linear' },
      effects: [{ atom: 'slow', params: { ratio: 0.2, duration: 1 } }],
    } }]);
    tickEffects(state, config, rng, 1);
    expect(state.zones[0].radius).toBeCloseTo(60);

    runEffects({ ...ctx, bullet: { x: 10, y: 10, vx: 0, vy: 5, r: 2, life: 1, damage: 1 } }, [{
      atom: 'groundZone', params: {
        radius: 30, duration: 2, tickInterval: 1, shape: 'line', lineFrom: 'bulletPath',
        effects: [{ atom: 'slow', params: { ratio: 0.2, duration: 1 } }],
      },
    }]);
    expect(state.zones[1]).toMatchObject({ lineDirX: 0, lineDirY: 1 });
  });
});

describe('V15/V16 design fixture', () => {
  it('contains all 35 cards / 210 branches and validates the shipped content', () => {
    expect(Object.keys(designFingerprints.cards)).toHaveLength(35);
    expect(Object.values(designFingerprints.cards).reduce((sum, card) => sum + Object.keys(card.branches).length, 0)).toBe(210);
    expect(() => validateSkillsConfig(cfg.skills)).not.toThrow();
  });
});
