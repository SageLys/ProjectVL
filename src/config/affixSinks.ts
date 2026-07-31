import type { CardAffixStatKind } from './types';
import type { AtomName, Trigger } from '../core/effects/defs';

export interface AffixScalingTarget {
  atom: AtomName;
  param: string;
  mode?: 'mul' | 'add';
  integer?: boolean;
  cap?: number;
  trigger?: Trigger;
}

export interface AffixSinkContract {
  operation: 'add' | 'mul';
  settlement: 'instant' | 'timed';
  equipment: 'global' | 'scoped' | 'unsupported';
  /** Named consumer used by global equipment or time-limited runtime settlement. */
  globalConsumer?: string;
  scalingTargets?: readonly AffixScalingTarget[];
}

/**
 * One authoritative contract for rolling, settlement, equipment support and
 * observable scaling sinks. Keep this exhaustive when CardAffixStatKind changes.
 */
export const AFFIX_SINKS: Record<CardAffixStatKind, AffixSinkContract> = {
  damageMul: {
    operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalDamage',
  },
  fireRateMul: {
    operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalFireRate',
  },
  rangeMul: {
    operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalRange',
  },
  maxHpMul: {
    operation: 'mul', settlement: 'timed', equipment: 'global', globalConsumer: 'totalMaxHp',
  },
  effectDamageMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
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
  },
  quantityAdd: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
      { atom: 'pierce', param: 'count', mode: 'add', integer: true },
      { atom: 'chain', param: 'bounces', mode: 'add', integer: true },
      { atom: 'split', param: 'count', mode: 'add', integer: true },
      { atom: 'ricochet', param: 'bounces', mode: 'add', integer: true },
    ],
  },
  controlPotencyMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
      { atom: 'slow', param: 'ratio', cap: 0.8 },
      { atom: 'freeze', param: 'duration' },
      { atom: 'stun', param: 'duration' },
      { atom: 'knockback', param: 'distance' },
      { atom: 'vulnerable', param: 'ratio' },
    ],
  },
  controlledDamageTakenMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'global',
    globalConsumer: 'controlledDamageTakenBonus',
  },
  areaScaleMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
      { atom: 'aura', param: 'radius' },
      { atom: 'aura', param: 'radiusRatioOfRange' },
      { atom: 'groundZone', param: 'radius' },
      { atom: 'groundZone', param: 'duration' },
    ],
  },
  dotDamageMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [{ atom: 'dot', param: 'damageRatio' }],
  },
  defenseDurabilityMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
      { atom: 'shield', param: 'absorbHits', integer: true },
      { atom: 'summon', param: 'hp' },
    ],
  },
  retaliationMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'runtimeScalingFor',
    scalingTargets: [
      { atom: 'novaOnBreak', param: 'damage' },
      { atom: 'thorns', param: 'ratio' },
      { atom: 'burstDamage', param: 'damageMul', trigger: 'onBreach' },
    ],
  },
  dropRateMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'getModifiers.dropRateMul',
    scalingTargets: [{ atom: 'dropRateMul', param: 'mul' }],
  },
  dropLifetimeMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'getModifiers.dropLifetimeMul',
    scalingTargets: [{ atom: 'dropLifetimeMul', param: 'mul' }],
  },
  xpMul: {
    operation: 'mul',
    settlement: 'timed',
    equipment: 'scoped',
    globalConsumer: 'getModifiers.xpMul',
    scalingTargets: [{ atom: 'xpMul', param: 'mul' }],
  },
};
