import { cfg } from '../../config';
import type { BuildScalingAxis, CardAffixCandidateDef, CardStatKind, RunBaseStatKind } from '../../config/types';
import { createCardInstance } from '../createInitialState';
import type { Card, CardAffixRoll, CardType, GameEvent, GameState, Rng, RuntimeStatModifier } from '../types';

export type { CardAffixRoll } from '../types';

const RUN_BASE_STATS = new Set<CardStatKind>([
  'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
]);

function rollIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.max(0, Math.floor(rng() * length)));
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function rollValue(candidate: CardAffixCandidateDef, rng: Rng): number {
  const stepCount = Math.max(0, Math.floor((candidate.max - candidate.min) / candidate.step + 1e-9));
  const value = candidate.min + rollIndex(stepCount + 1, rng) * candidate.step;
  const precision = Math.max(
    decimalPlaces(candidate.min),
    decimalPlaces(candidate.max),
    decimalPlaces(candidate.step),
  );
  return Number(Math.min(candidate.max, value).toFixed(precision));
}

function weightedCandidate(
  candidates: CardAffixCandidateDef[],
  rng: Rng,
): CardAffixCandidateDef {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rng() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll < 0) return candidate;
  }
  return candidates[candidates.length - 1];
}

/** Rolls and locks one card-type template for the run. */
export function ensureAffixTemplate(
  state: GameState,
  rng: Rng,
  type: CardType,
): CardAffixRoll[] {
  if (Object.prototype.hasOwnProperty.call(state.runBuild.cardAffixRolls, type)) {
    return state.runBuild.cardAffixRolls[type].map(roll => ({ ...roll }));
  }

  const pool = cfg.skills.cards.find(card => card.id === type)?.affixPool;
  if (!pool || pool.count <= 0 || pool.candidates.length === 0) {
    state.runBuild.cardAffixRolls[type] = [];
    return [];
  }

  const remaining = [...pool.candidates];
  const rolls: CardAffixRoll[] = [];
  while (remaining.length && rolls.length < pool.count) {
    const candidate = weightedCandidate(remaining, rng);
    remaining.splice(remaining.indexOf(candidate), 1);
    rolls.push({
      stat: candidate.stat,
      value: rollValue(candidate, rng),
      consumableDuration: candidate.consumableDuration,
    });
  }
  state.runBuild.cardAffixRolls[type] = rolls.map(roll => ({ ...roll }));
  return rolls.map(roll => ({ ...roll }));
}

export function affixTemplateFor(state: GameState, type: CardType): CardAffixRoll[] {
  return (state.runBuild.cardAffixRolls[type] ?? []).map(roll => ({ ...roll }));
}

/** Runtime card factory: every real run card receives a display copy of its run template. */
export function createCardWithAffixes(
  state: GameState,
  rng: Rng,
  type: CardType,
  star: number,
): { card: Card; events: GameEvent[] } {
  const firstRoll = !Object.prototype.hasOwnProperty.call(state.runBuild.cardAffixRolls, type);
  const affixes = ensureAffixTemplate(state, rng, type);
  const card = createCardInstance(state.nextCardId++, type, star);
  card.affixes = affixes.map(roll => ({ ...roll }));
  return {
    card,
    events: firstRoll && affixes.length
      ? [{ type: 'affixRolled', cardType: type, affixes: affixes.map(roll => ({ ...roll })) }]
      : [],
  };
}

export function isRunBaseAffix(stat: CardStatKind): stat is RunBaseStatKind {
  return RUN_BASE_STATS.has(stat);
}

export function equipmentAffixAdd(state: GameState, stat: RunBaseStatKind): number {
  let total = 0;
  for (const card of state.equipment) {
    if (!card || card.provisional) continue;
    for (const roll of state.runBuild.cardAffixRolls[card.type] ?? []) {
      if (roll.stat === stat) total += roll.value;
    }
  }
  return total;
}

/** Per-card scaling used only while that card is equipped. */
export function cardAffixScaling(
  state: GameState,
  type: CardType,
): Partial<Record<BuildScalingAxis, number>> {
  const result: Partial<Record<BuildScalingAxis, number>> = {};
  for (const roll of state.runBuild.cardAffixRolls[type] ?? []) {
    if (isRunBaseAffix(roll.stat)) continue;
    result[roll.stat] = (result[roll.stat] ?? 0) + roll.value;
  }
  return result;
}

export function affixOperation(stat: CardStatKind): RuntimeStatModifier['operation'] {
  return stat.endsWith('Add') ? 'add' : 'mul';
}

/** Activates the run template as global, time-limited modifiers after consumption. */
export function activateConsumableAffixes(state: GameState, type: CardType): RuntimeStatModifier[] {
  const activated = affixTemplateFor(state, type).map<RuntimeStatModifier>(roll => {
    const operation = affixOperation(roll.stat);
    return {
      sourceId: `affix:${type}`,
      stat: roll.stat,
      operation,
      value: operation === 'mul' ? 1 + roll.value : roll.value,
      remaining: roll.consumableDuration,
    };
  });
  state.statModifiers.push(...activated);
  return activated;
}
