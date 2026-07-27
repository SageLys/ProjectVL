import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { RelicDef } from '../src/config/types';
import type { BindingDef, CardDef, ConsumableTierDef, EffectDef } from '../src/core/effects/defs';
import { effectParams, nestedEffectsOf } from '../src/core/effects/atomContract';
import {
  getModifiers,
  registerSkillDefs,
  releaseConsumable,
  resolveCardBindings,
  resolveConsumableTier,
} from '../src/core/effects/interpreter';
import { applySlow, applyVulnerable } from '../src/core/effects/statusSystem';
import {
  aggregateBuildScaling,
  applyBuildScalingToBindings,
  applyBuildScalingToTier,
  controlledDamageTakenBonus,
  scalingFor,
} from '../src/core/systems/buildModifierSystem';
import { updateBullets } from '../src/core/systems/combatSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import type { GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.99);

beforeEach(resetTestEnv);
afterEach(resetTestEnv);

function skill(id: string): CardDef {
  return cfg.skills.cards.find(def => def.id === id)!;
}

function activate(state: GameState, relicId: string, stacks = 1): void {
  state.relicStacks[relicId] = stacks;
  state.buildState.scalingVersion++;
}

function scaledBindings(state: GameState, id: string, star: number): BindingDef[] {
  const def = skill(id);
  return applyBuildScalingToBindings(state, def, rawBindings(def, star));
}

function rawBindings(def: CardDef, star: number): BindingDef[] {
  const path = def.evolutionTree?.checkpoints
    .filter(checkpoint => checkpoint.star <= star)
    .map(checkpoint => `${checkpoint.star}:${checkpoint.options[0].id}`) ?? [];
  return resolveCardBindings(def, path, star);
}

function scaledTier(state: GameState, id: string, star: number): ConsumableTierDef {
  const def = skill(id);
  return applyBuildScalingToTier(state, def, resolveConsumableTier(def, star));
}

function effectsIn(bindings: BindingDef[]): EffectDef[] {
  return bindings.flatMap(binding => binding.effects);
}

function findAtom(effects: EffectDef[], atom: EffectDef['atom']): EffectDef[] {
  const found: EffectDef[] = [];
  for (const effect of effects) {
    if (effect.atom === atom) found.push(effect);
    found.push(...findAtom(nestedEffectsOf(effect) as EffectDef[], atom));
  }
  return found;
}

function numberParam(effect: EffectDef, key: string): number {
  return effectParams(effect)[key] as number;
}

describe('buildModifierSystem aggregation and explicit mapping', () => {
  it('is an exact identity for all real cards and stars when no build perk is selected', () => {
    const state = freshState();
    for (const def of cfg.skills.cards) {
      for (const star of [3, 4, 5, 6]) {
        const raw = rawBindings(def, star);
        expect(applyBuildScalingToBindings(state, def, structuredClone(raw))).toEqual(raw);
      }
      for (const star of [1, 2, 3, 4, 5, 6]) {
        const raw = resolveConsumableTier(def, star);
        expect(applyBuildScalingToTier(state, def, structuredClone(raw))).toEqual(raw);
      }
    }
  });

  it('aggregates stacks and takes the maximum matching tag instead of summing multi-tag matches', () => {
    const state = freshState();
    activate(state, 'proj_damage', 2);
    activate(state, 'ctrl_potency', 1);
    const totals = aggregateBuildScaling(state);
    expect(totals.byAxis.effectDamageMul?.projectile).toBeCloseTo(0.3);
    expect(scalingFor(totals, skill('chainLightning'), 'effectDamageMul')).toBeCloseTo(0.3);

    const both: CardDef = { ...skill('chainLightning'), synergyTags: ['projectile', 'control'] };
    expect(scalingFor({ byAxis: { effectDamageMul: { projectile: 0.15, control: 0.15 } } }, both, 'effectDamageMul')).toBe(0.15);
  });

  it('scales projectile damage and quantities without touching unrelated cards', () => {
    const state = freshState();
    activate(state, 'proj_damage', 2);
    activate(state, 'proj_quantity');

    const split = scaledBindings(state, 'splitBlast', 3);
    expect(numberParam(findAtom(effectsIn(split), 'split')[0], 'damageRatio')).toBeCloseTo(0.65);
    expect(numberParam(findAtom(effectsIn(split), 'split')[0], 'count')).toBe(3);

    const pierce = scaledBindings(state, 'pierce', 5);
    expect(numberParam(findAtom(effectsIn(pierce), 'pierce')[0], 'count')).toBe(4);
    expect(numberParam(findAtom(effectsIn(pierce), 'pierce')[0], 'damageRetention')).toBe(1);
    expect(numberParam(findAtom(effectsIn(pierce), 'ricochet')[0], 'bounces')).toBe(2);

    expect(scaledBindings(state, 'aegis', 6)).toEqual(rawBindings(skill('aegis'), 6));
    expect(scaledBindings(state, 'harvest', 6)).toEqual(rawBindings(skill('harvest'), 6));
  });

  it('scales only the allowlisted control parameters and preserves stacksToTrigger', () => {
    const state = freshState();
    activate(state, 'ctrl_potency');
    const frost = scaledBindings(state, 'frost', 3);
    const slow = findAtom(effectsIn(frost), 'slow')[0];
    const freeze = findAtom(effectsIn(frost), 'freeze')[0];
    expect(numberParam(slow, 'ratio')).toBeCloseTo(0.36);
    expect(numberParam(freeze, 'duration')).toBeCloseTo(0.96);
    expect(numberParam(freeze, 'stacksToTrigger')).toBe(3);
    expect(numberParam(findAtom(effectsIn(scaledBindings(state, 'impact', 3)), 'knockback')[0], 'distance')).toBeCloseTo(26.4);

    const capped = freshState();
    activate(capped, 'ctrl_potency', 20);
    expect(numberParam(findAtom(effectsIn(scaledBindings(capped, 'frost', 3)), 'slow')[0], 'ratio')).toBe(0.8);
  });

  it('rounds defensive durability upward without changing the source binding', () => {
    const state = freshState();
    activate(state, 'def_durability');
    const raw = rawBindings(skill('aegis'), 3);
    const scaled = applyBuildScalingToBindings(state, skill('aegis'), structuredClone(raw));
    expect(numberParam(findAtom(effectsIn(scaled), 'shield')[0], 'absorbHits')).toBe(3);
    expect(numberParam(findAtom(effectsIn(raw), 'shield')[0], 'absorbHits')).toBe(2);
  });

  it('lets a dual-tag card receive independent projectile and control axes', () => {
    const state = freshState();
    activate(state, 'proj_damage');
    activate(state, 'ctrl_potency');
    const bindings = scaledBindings(state, 'chainLightning', 3);
    expect(numberParam(findAtom(effectsIn(bindings), 'chain')[0], 'damageRetention')).toBeCloseTo(0.805);
    expect(numberParam(findAtom(effectsIn(bindings), 'slow')[0], 'ratio')).toBeCloseTo(0.24);
  });

  it('applies a future multi-target relic only once to a dual-tag card', () => {
    const fixtureRelic: RelicDef = {
      id: 'fixture_both', textKey: 'relics.fixture_both',
      rarity: 'common', targetTags: ['projectile', 'control'],
      effects: [{ kind: 'buildScaling', targetTags: ['projectile', 'control'], axis: 'effectDamageMul', value: 0.15 }],
      maxStacks: 1,
    };
    cfg.relics.relics.push(fixtureRelic);
    const state = freshState();
    activate(state, fixtureRelic.id);
    const def: CardDef = {
      ...skill('splitBlast'), id: 'fixture', synergyTags: ['projectile', 'control'],
    };
    const bindings: BindingDef[] = [{ trigger: 'onFire', effects: [{ atom: 'split', params: { count: 2, damageRatio: 1 } }] }];
    expect(numberParam(findAtom(effectsIn(applyBuildScalingToBindings(state, def, bindings)), 'split')[0], 'damageRatio')).toBeCloseTo(1.15);
  });

  it('walks nested zone/aura effects and scales consumable top-level area exactly once', () => {
    const state = freshState();
    activate(state, 'domain_dot');
    activate(state, 'domain_area');
    const scorch = scaledBindings(state, 'scorch', 3);
    expect(numberParam(findAtom(effectsIn(scorch), 'groundZone')[0], 'radius')).toBeCloseTo(46);
    expect(numberParam(findAtom(effectsIn(scorch), 'dot')[0], 'damageRatio')).toBeCloseTo(0.18);

    const frost = scaledTier(state, 'frost', 3);
    expect(frost.radius).toBeCloseTo(149.5);
    expect(frost.duration).toBeCloseTo(3.45);
    expect(scaledTier(state, 'pierce', 3).radius).toBe(70);

    registerSkillDefs(cfg.skills.cards);
    releaseConsumable(state, config, rng, 'scorch', 3, 100, 100);
    expect(numberParam(state.zones[0].effects.find(effect => effect.atom === 'dot')!, 'damageRatio')).toBeCloseTo(0.24);
  });

  it('limits retaliation burst scaling to onBreach while leaving nested aura dot unchanged', () => {
    const state = freshState();
    activate(state, 'def_bridge');
    const thorns = scaledBindings(state, 'thorns', 5);
    expect(numberParam(findAtom(effectsIn(thorns), 'burstDamage')[0], 'damageMul')).toBeCloseTo(2.5);
    expect(numberParam(findAtom(effectsIn(thorns), 'dot')[0], 'damageRatio')).toBe(0.1);
  });

  it('invalidates cached totals immediately when progression applies a relic', async () => {
    registerSkillDefs(cfg.skills.cards);
    const state = freshState();
    state.equipment[0] = {
      ...card('aegis', 5),
      evolutionPath: ['3:aegisA', '5:aegisA2'],
    };
    expect(getModifiers(state).novaOnBreak?.damage).toBe(30);
    state.decisions.current = { kind: 'relic', relicIndex: 0, options: ['def_bridge'] };
    const { applyRelic } = await import('../src/core/systems/progressionSystem');
    applyRelic(state, 'def_bridge');
    expect(getModifiers(state).novaOnBreak?.damage).toBeCloseTo(37.5);
  });
});

describe('controlled damage bridge', () => {
  it('multiplies controlled damage once and forms an independent product with vulnerable', () => {
    const state = freshState();
    activate(state, 'ctrl_bridge', 2);
    expect(controlledDamageTakenBonus(state)).toBeCloseTo(0.2);

    const plain = enemy({ hp: 100, maxHp: 100 });
    state.enemies = [plain];
    dealDamage(state, config, rng, plain, 10);
    expect(plain.hp).toBe(90);

    const controlled = enemy({ hp: 100, maxHp: 100 });
    applySlow(controlled, 0.2, 1);
    applyVulnerable(controlled, 0.25, 1);
    state.enemies = [controlled];
    dealDamage(state, config, rng, controlled, 10);
    expect(controlled.hp).toBe(85);
  });

  it('also applies to the existing base-bullet hit path', () => {
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
