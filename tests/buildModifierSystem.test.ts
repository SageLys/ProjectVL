import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef } from '../src/core/effects/defs';
import { applySlow, applyVulnerable } from '../src/core/effects/statusSystem';
import {
  aggregateBuildScaling,
  applyBuildScalingToBindings,
  controlledDamageTakenBonus,
  scalingFor,
} from '../src/core/systems/buildModifierSystem';
import { updateBullets } from '../src/core/systems/combatSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import type { GameState } from '../src/core/types';
import { constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);

beforeEach(resetTestEnv);

function skill(id: string): CardDef {
  return cfg.skills.cards.find(def => def.id === id)!;
}

function activate(state: GameState, relicId: string, stacks = 1): void {
  state.relicStacks[relicId] = stacks;
  state.buildState.scalingVersion++;
}

describe('buildModifierSystem generic mapping', () => {
  it('is an exact identity when no relic or runtime modifier is active', () => {
    const state = freshState();
    const binding: BindingDef[] = [{
      trigger: 'onFire',
      effects: [{ atom: 'split', params: { count: 2, damageRatio: 0.5 } }],
    }];
    const input = structuredClone(binding);
    expect(applyBuildScalingToBindings(state, skill('arcSplitter'), input)).toEqual(binding);
  });

  it('aggregates stacks and takes the strongest matching tag rather than summing tags', () => {
    const state = freshState();
    activate(state, 'proj_damage', 2);
    activate(state, 'ctrl_potency');
    const totals = aggregateBuildScaling(state);
    expect(totals.byAxis.effectDamageMul?.projectile).toBeCloseTo(0.3);
    const dual: CardDef = { ...skill('chainLightning'), synergyTags: ['projectile', 'control'] };
    expect(scalingFor(totals, dual, 'effectDamageMul')).toBeCloseTo(0.3);
  });

  it('scales only allowlisted parameters and leaves the source object untouched', () => {
    const state = freshState();
    activate(state, 'proj_damage');
    activate(state, 'proj_quantity');
    const raw: BindingDef[] = [{
      trigger: 'onFire',
      effects: [{ atom: 'split', params: { count: 2, damageRatio: 1, maxDepth: 1 } }],
    }];
    const scaled = applyBuildScalingToBindings(state, skill('arcSplitter'), structuredClone(raw));
    const params = scaled[0].effects[0].params! as Record<string, number>;
    expect(params.count).toBeGreaterThan(2);
    expect(params.damageRatio).toBeGreaterThan(1);
    expect(params.maxDepth).toBe(1);
    expect(raw[0].effects[0].params).toEqual({ count: 2, damageRatio: 1, maxDepth: 1 });

    const defense = { ...skill('aegis'), synergyTags: ['defense'] as CardDef['synergyTags'] };
    expect(applyBuildScalingToBindings(state, defense, structuredClone(raw))).toEqual(raw);
  });
});

describe('controlled damage bridge', () => {
  it('multiplies controlled damage once and forms an independent product with vulnerable', () => {
    const state = freshState();
    activate(state, 'ctrl_bridge', 2);
    expect(controlledDamageTakenBonus(state)).toBeCloseTo(0.2);

    const controlled = enemy({ hp: 100, maxHp: 100 });
    applySlow(controlled, 0.2, 1);
    applyVulnerable(controlled, 0.25, 1);
    state.enemies = [controlled];
    dealDamage(state, config, rng, controlled, 10);
    expect(controlled.hp).toBe(85);
  });

  it('also applies to the base-bullet hit path', () => {
    const state = freshState();
    activate(state, 'ctrl_bridge');
    const target = enemy({ x: 100, y: 100, hp: 100, maxHp: 100 });
    applySlow(target, 0.2, 1);
    state.enemies = [target];
    state.bullets = [{ x: 100, y: 100, vx: 0, vy: 0, r: 4, life: 1, damage: 10 }];
    updateBullets(state, config, rng, 0);
    expect(target.hp).toBe(89);
  });
});
