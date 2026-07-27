import { cfg } from '../../config';
import type { BuildScalingAxis } from '../../config/types';
import { AFFIX_SINKS, type AffixScalingTarget } from '../../config/affixSinks';
import type { BindingDef, BuildTag, CardDef, ConsumableTierDef, EffectDef, Trigger } from '../effects/defs';
import { effectParams } from '../effects/atomContract';
import type { GameState } from '../types';
import { cardAffixScaling } from './cardAffixSystem';
import { modifierTotal } from './runtimeStatModifierSystem';

export interface BuildScalingTotals {
  /** axis -> target tag -> additive relic total. Multiplicative axes consume this as (1 + total). */
  byAxis: Partial<Record<BuildScalingAxis, Partial<Record<BuildTag, number>>>>;
}

type ScalingRule = AffixScalingTarget;

/** Explicit atom/parameter allowlist. Same-named parameters on other atoms stay untouched. */
export const BUILD_SCALING_RULES: Partial<Record<BuildScalingAxis, readonly ScalingRule[]>> =
  Object.fromEntries(
    Object.entries(AFFIX_SINKS)
      .filter(([, contract]) => contract.scalingTargets?.some(target => target.trigger === undefined))
      .map(([axis, contract]) => [
        axis,
        contract.scalingTargets?.filter(target => target.trigger === undefined) ?? [],
      ]),
  ) as Partial<Record<BuildScalingAxis, readonly ScalingRule[]>>;

const EMPTY_TOTALS: BuildScalingTotals = { byAxis: {} };
const cache = new WeakMap<GameState, { version: number; totals: BuildScalingTotals }>();

export function aggregateBuildScaling(state: GameState): BuildScalingTotals {
  const totals: BuildScalingTotals = { byAxis: {} };
  for (const relic of cfg.relics.relics) {
    const stacks = state.relicStacks[relic.id] ?? 0;
    if (!(stacks > 0)) continue;
    for (const effect of relic.effects) {
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

function runtimeScalingFor(state: GameState, axis: BuildScalingAxis): number {
  const total = modifierTotal(state, axis);
  return total.add + (total.mul - 1);
}

/** A multi-tag card takes the strongest matching tag total for an axis, never their sum. */
export function scalingFor(totals: BuildScalingTotals, def: CardDef, axis: BuildScalingAxis): number {
  const byTag = totals.byAxis[axis];
  if (!byTag) return 0;
  return def.synergyTags.reduce((best, tag) => Math.max(best, byTag[tag] ?? 0), 0);
}

function scaleNumber(original: number, value: number, rule: ScalingRule): number {
  let next = rule.mode === 'add' ? original + value : original * (1 + value);
  if (rule.integer) next = Math.max(original, value > 0 ? Math.ceil(next) : Math.round(next));
  if (rule.cap !== undefined) next = Math.min(rule.cap, next);
  return next;
}

function scaleEffects(
  state: GameState,
  effects: EffectDef[],
  trigger: Trigger | undefined,
  totals: BuildScalingTotals,
  def: CardDef,
  affixScaling: Partial<Record<BuildScalingAxis, number>>,
): void {
  for (const effect of effects) {
    // 词条/遗物缩放按 (atom, param) 规则原地改写数值，天然是跨原子的泛型遍历——
    // 这里取契约参数的松散视图，改写的仍是同一个对象引用。
    if (!effect.params) continue;
    const params = effectParams(effect);
    for (const [axis, rules] of Object.entries(BUILD_SCALING_RULES) as [BuildScalingAxis, readonly ScalingRule[]][]) {
      const value = scalingFor(totals, def, axis)
        + runtimeScalingFor(state, axis)
        + (affixScaling[axis] ?? 0);
      if (value === 0) continue;
      for (const rule of rules) {
        if (rule.atom !== effect.atom || typeof params[rule.param] !== 'number') continue;
        params[rule.param] = scaleNumber(params[rule.param] as number, value, rule);
      }
    }

    // This exception is scoped by binding trigger, not by the generic burstDamage parameter name.
    if (trigger === 'onBreach' && effect.atom === 'burstDamage' && typeof params.damageMul === 'number') {
      const value = scalingFor(totals, def, 'retaliationMul')
        + runtimeScalingFor(state, 'retaliationMul')
        + (affixScaling.retaliationMul ?? 0);
      if (value !== 0) params.damageMul = (params.damageMul as number) * (1 + value);
    }

    if (Array.isArray(params.effects)) {
      scaleEffects(state, params.effects as EffectDef[], trigger, totals, def, affixScaling);
    }
  }
}

export function applyBuildScalingToBindings(
  state: GameState,
  def: CardDef,
  bindings: BindingDef[],
  affixCardType?: string,
): BindingDef[] {
  const totals = currentTotals(state);
  const affixScaling = affixCardType ? cardAffixScaling(state, affixCardType) : {};
  const hasRuntimeScaling = Object.keys(BUILD_SCALING_RULES)
    .some(axis => runtimeScalingFor(state, axis as BuildScalingAxis) !== 0);
  if (!hasScaling(totals) && !hasRuntimeScaling && Object.keys(affixScaling).length === 0) return bindings;
  for (const binding of bindings) {
    scaleEffects(state, binding.effects, binding.trigger, totals, def, affixScaling);
  }
  return bindings;
}

export function applyBuildScalingToTier(state: GameState, def: CardDef, tier: ConsumableTierDef): ConsumableTierDef {
  const totals = currentTotals(state);
  const hasRuntimeScaling = Object.keys(BUILD_SCALING_RULES)
    .some(axis => runtimeScalingFor(state, axis as BuildScalingAxis) !== 0);
  if (!hasScaling(totals) && !hasRuntimeScaling) return tier;
  const areaValue = scalingFor(totals, def, 'areaScaleMul') + runtimeScalingFor(state, 'areaScaleMul');
  if (areaValue !== 0) {
    if (typeof tier.radius === 'number') tier.radius *= 1 + areaValue;
    if (typeof tier.duration === 'number') tier.duration *= 1 + areaValue;
  }
  scaleEffects(state, tier.effects, undefined, totals, def, {});
  return tier;
}

/** Global bridge multiplier: the strongest tagged total applies once to every damage source. */
export function controlledDamageTakenBonus(state: GameState): number {
  const byTag = currentTotals(state).byAxis.controlledDamageTakenMul;
  const relic = byTag ? Math.max(0, ...Object.values(byTag).map(value => value ?? 0)) : 0;
  const equippedAffix = state.equipment.reduce((sum, card) => (
    card && !card.provisional
      ? sum + (cardAffixScaling(state, card.type).controlledDamageTakenMul ?? 0)
      : sum
  ), 0);
  return relic + equippedAffix + runtimeScalingFor(state, 'controlledDamageTakenMul');
}
