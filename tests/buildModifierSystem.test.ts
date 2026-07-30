import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef } from '../src/core/effects/defs';
import { applyBuildScalingToBindings, aggregateBuildScaling, controlledDamageTakenBonus } from '../src/core/systems/buildModifierSystem';
import { freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
describe('buildModifierSystem runtime scaling', () => {
  it('keeps empty permanent totals and preserves bindings', () => {
    const state = freshState();
    const binding: BindingDef[] = [{ trigger: 'onFire', effects: [{ atom: 'split', params: { count: 2, damageRatio: 0.5 } }] }];
    expect(aggregateBuildScaling(state)).toEqual({ byAxis: {} });
    expect(applyBuildScalingToBindings(state, cfg.skills.cards[0], structuredClone(binding))).toEqual(binding);
    expect(controlledDamageTakenBonus(state)).toBe(0);
  });
});
