import { cfg } from '../../config';
import type { BuildScalingAxis } from '../../config/types';
import type { BindingDef, BuildTag, CardDef, ConsumableTierDef, EffectDef, Trigger } from '../effects/defs';
import type { GameState } from '../types';

export interface BuildScalingTotals {
  /** axis -> target tag -> additive perk total. Multiplicative axes consume this as (1 + total). */
  byAxis: Partial<Record<BuildScalingAxis, Partial<Record<BuildTag, number>>>>;
}

interface ScalingRule {
  atom: EffectDef['atom'];
  param: string;
  mode?: 'mul' | 'add';
  integer?: boolean;
  cap?: number;
}

/** Explicit atom/parameter allowlist. Same-named parameters on other atoms stay untouched. */
export const BUILD_SCALING_RULES: Partial<Record<BuildScalingAxis, readonly ScalingRule[]>> = {
  effectDamageMul: [
    { atom: 'aoeOnHit', param: 'damageRatio' },
    { atom: 'burstDamage', param: 'damageMul' },
    { atom: 'split', param: 'damageRatio' },
    { atom: 'beamMorph', param: 'damageRatio' },
    { atom: 'mortarMorph', param: 'damageRatio' },
    { atom: 'summon', param: 'explodeDamageMul' },
    { atom: 'summon', param: 'damageRatio' },
    { atom: 'pierce', param: 'damageRetention', cap: 1 },
    { atom: 'chain', param: 'damageRetention', cap: 1 },
  ],
  quantityAdd: [
    { atom: 'pierce', param: 'count', mode: 'add', integer: true },
    { atom: 'chain', param: 'bounces', mode: 'add', integer: true },
    { atom: 'split', param: 'count', mode: 'add', integer: true },
    { atom: 'ricochet', param: 'bounces', mode: 'add', integer: true },
  ],
  controlPotencyMul: [
    { atom: 'slow', param: 'ratio', cap: 0.8 },
    { atom: 'freeze', param: 'duration' },
    { atom: 'stun', param: 'duration' },
    { atom: 'knockback', param: 'distance' },
    { atom: 'vulnerable', param: 'ratio' },
  ],
  areaScaleMul: [
    { atom: 'aura', param: 'radius' },
    { atom: 'aura', param: 'radiusRatioOfRange' },
    { atom: 'groundZone', param: 'radius' },
    { atom: 'groundZone', param: 'duration' },
  ],
  dotDamageMul: [{ atom: 'dot', param: 'damageRatio' }],
  defenseDurabilityMul: [
    { atom: 'shield', param: 'absorbHits', integer: true },
    { atom: 'summon', param: 'hp' },
  ],
  retaliationMul: [
    { atom: 'novaOnBreak', param: 'damage' },
    { atom: 'thorns', param: 'ratio' },
  ],
};

const EMPTY_TOTALS: BuildScalingTotals = { byAxis: {} };
const cache = new WeakMap<GameState, { version: number; totals: BuildScalingTotals }>();

export function aggregateBuildScaling(state: GameState): BuildScalingTotals {
  const totals: BuildScalingTotals = { byAxis: {} };
  for (const perk of cfg.progression.perks) {
    const stacks = state.perkStacks[perk.id] ?? 0;
    if (!(stacks > 0)) continue;
    for (const effect of perk.effects) {
      if (effect.kind !== 'buildScaling') continue;
      const axisTotals = totals.byAxis[effect.axis] ?? (totals.byAxis[effect.axis] = {});
      for (const tag of effect.targetTags) {
        axisTotals[tag] = (axisTotals[tag] ?? 0) + effect.value * stacks;
      }
    }
  }
  return totals;
}

function currentTotals(state: GameState): BuildScalingTotals {
  if (state.buildState.scalingVersion === 0) return EMPTY_TOTALS;
  const cached = cache.get(state);
  if (cached?.version === state.buildState.scalingVersion) return cached.totals;
  const totals = aggregateBuildScaling(state);
  cache.set(state, { version: state.buildState.scalingVersion, totals });
  return totals;
}

function hasScaling(totals: BuildScalingTotals): boolean {
  return Object.keys(totals.byAxis).length > 0;
}

/** A multi-tag card takes the strongest matching tag total for an axis, never their sum. */
export function scalingFor(totals: BuildScalingTotals, def: CardDef, axis: BuildScalingAxis): number {
  const byTag = totals.byAxis[axis];
  if (!byTag) return 0;
  return def.synergyTags.reduce((best, tag) => Math.max(best, byTag[tag] ?? 0), 0);
}

function scaleNumber(original: number, value: number, rule: ScalingRule): number {
  let next = rule.mode === 'add' ? original + value : original * (1 + value);
  if (rule.integer) next = Math.max(original, Math.round(next));
  if (rule.cap !== undefined) next = Math.min(rule.cap, next);
  return next;
}

function scaleEffects(effects: EffectDef[], trigger: Trigger | undefined, totals: BuildScalingTotals, def: CardDef): void {
  for (const effect of effects) {
    const params = effect.params;
    if (!params) continue;
    for (const [axis, rules] of Object.entries(BUILD_SCALING_RULES) as [BuildScalingAxis, readonly ScalingRule[]][]) {
      const value = scalingFor(totals, def, axis);
      if (value === 0) continue;
      for (const rule of rules) {
        if (rule.atom !== effect.atom || typeof params[rule.param] !== 'number') continue;
        params[rule.param] = scaleNumber(params[rule.param] as number, value, rule);
      }
    }

    // This exception is scoped by binding trigger, not by the generic burstDamage parameter name.
    if (trigger === 'onBreach' && effect.atom === 'burstDamage' && typeof params.damageMul === 'number') {
      const value = scalingFor(totals, def, 'retaliationMul');
      if (value !== 0) params.damageMul = (params.damageMul as number) * (1 + value);
    }

    if (Array.isArray(params.effects)) scaleEffects(params.effects as EffectDef[], trigger, totals, def);
  }
}

export function applyBuildScalingToBindings(state: GameState, def: CardDef, bindings: BindingDef[]): BindingDef[] {
  const totals = currentTotals(state);
  if (!hasScaling(totals)) return bindings;
  for (const binding of bindings) scaleEffects(binding.effects, binding.trigger, totals, def);
  return bindings;
}

export function applyBuildScalingToTier(state: GameState, def: CardDef, tier: ConsumableTierDef): ConsumableTierDef {
  const totals = currentTotals(state);
  if (!hasScaling(totals)) return tier;
  const areaValue = scalingFor(totals, def, 'areaScaleMul');
  if (areaValue !== 0) {
    if (typeof tier.radius === 'number') tier.radius *= 1 + areaValue;
    if (typeof tier.duration === 'number') tier.duration *= 1 + areaValue;
  }
  scaleEffects(tier.effects, undefined, totals, def);
  return tier;
}

/** Global bridge multiplier: the strongest tagged total applies once to every damage source. */
export function controlledDamageTakenBonus(state: GameState): number {
  const byTag = currentTotals(state).byAxis.controlledDamageTakenMul;
  return byTag ? Math.max(0, ...Object.values(byTag).map(value => value ?? 0)) : 0;
}
