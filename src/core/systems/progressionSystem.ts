import { cfg } from '../../config';
import type { GodId, RelicDef } from '../../config/types';
import type { Config, GameEvent, GameState, Rng, RunDecision } from '../types';
import {
  enqueueDecision,
  registerDecisionResolver,
} from './decisionQueueSystem';
import { getSelectedGods } from './godPoolSystem';

type RelicRarity = RelicDef['rarity'];

function weightedPick<T>(values: readonly T[], weightOf: (value: T) => number, rng: Rng): T | undefined {
  if (!values.length) return undefined;
  const total = values.reduce((sum, value) => sum + Math.max(0, weightOf(value)), 0);
  if (total <= 0) return values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
  let roll = rng() * total;
  for (const value of values) {
    roll -= Math.max(0, weightOf(value));
    if (roll < 0) return value;
  }
  return values[values.length - 1];
}

function rarityWeights(relicIndex: number): Partial<Record<RelicRarity, number>> {
  const schedule = cfg.progression.rarityByRelicIndex;
  return schedule[Math.min(relicIndex, schedule.length - 1)] ?? { common: 1 };
}

function pickForScope(
  candidates: RelicDef[],
  relicIndex: number,
  rng: Rng,
): RelicDef | undefined {
  if (!candidates.length) return undefined;
  const weights = rarityWeights(relicIndex);
  const rarities = (['common', 'rare', 'epic'] as const).filter(rarity => (weights[rarity] ?? 0) > 0);
  const rarity = weightedPick(rarities, item => weights[item] ?? 0, rng);
  const matching = rarity ? candidates.filter(relic => relic.rarity === rarity) : [];
  return weightedPick(matching.length ? matching : candidates, () => 1, rng);
}

function chooseScopeGods(state: GameState, rng: Rng): Array<GodId | undefined> {
  const selected = getSelectedGods(state);
  const focus = state.godPool.focusGod && selected.includes(state.godPool.focusGod)
    ? state.godPool.focusGod
    : selected[0];
  const other = selected.filter(god => god !== focus);
  const second = other.length
    ? other[Math.min(other.length - 1, Math.floor(rng() * other.length))]
    : undefined;
  const thirdGods = other.filter(god => god !== second);
  const third = thirdGods.length && rng() >= 0.5
    ? thirdGods[Math.min(thirdGods.length - 1, Math.floor(rng() * thirdGods.length))]
    : undefined;
  return [focus, second, third];
}

/**
 * Slot 1 supports the current focus god, slot 2 another selected god, and slot 3
 * is neutral or the remaining selected god. Missing slots fall back within the
 * legal selected-three-gods + neutral pool without duplicating an option.
 */
export function rollRelicChoices(state: GameState, rng: Rng, relicIndex = state.level - 1): string[] {
  const selected = new Set(getSelectedGods(state));
  const queued = [state.decisions.current, ...state.decisions.pending];
  const eligible = cfg.relics.relics.filter(relic => (
    (relic.god === undefined || selected.has(relic.god))
    && (state.relicStacks[relic.id] ?? 0)
      + queued.filter(decision => decision?.kind === 'relic' && decision.options.includes(relic.id)).length
      < relic.maxStacks
  ));
  const choices: RelicDef[] = [];
  const remaining = (filter: (relic: RelicDef) => boolean) => eligible.filter(
    relic => !choices.some(choice => choice.id === relic.id) && filter(relic),
  );
  const scopes = chooseScopeGods(state, rng);
  scopes.forEach((god, slot) => {
    const scoped = remaining(relic => slot === 2 && god === undefined
      ? relic.god === undefined
      : relic.god === god);
    const picked = pickForScope(scoped, relicIndex, rng)
      ?? pickForScope(remaining(() => true), relicIndex, rng);
    if (picked) choices.push(picked);
  });
  while (choices.length < Math.min(cfg.progression.relicChoices, eligible.length)) {
    const picked = pickForScope(remaining(() => true), relicIndex, rng);
    if (!picked) break;
    choices.push(picked);
  }
  return choices.slice(0, cfg.progression.relicChoices).map(relic => relic.id);
}

export function registerRelicDecisionResolver(): void {
  registerDecisionResolver('relic', relicDecisionResolver);
}

/** Settles one explicit cumulative XP threshold and queues its own immutable offer. */
export function levelUp(state: GameState, rng: Rng): GameEvent[] {
  const relicIndex = state.level - 1;
  if (relicIndex >= cfg.progression.xpThresholds.length) return [];
  const options = rollRelicChoices(state, rng, relicIndex);
  state.level++;
  state.xpNeed = cfg.progression.xpThresholds[state.level - 1]
    ?? cfg.progression.xpThresholds[cfg.progression.xpThresholds.length - 1];
  if (!options.length) return [{ type: 'levelUp' }];
  const decision: Extract<RunDecision, { kind: 'relic' }> = { kind: 'relic', relicIndex, options };
  registerRelicDecisionResolver();
  return [
    { type: 'levelUp' },
    { type: 'relicOffered', relicIndex, options: [...options] },
    ...enqueueDecision(state, decision),
  ];
}

/** XP is cumulative; thresholds are exhausted after the eighth relic offer. */
export function addXp(state: GameState, amount: number, rng: Rng): GameEvent[] {
  const events: GameEvent[] = [];
  state.xp += amount;
  while (state.level - 1 < cfg.progression.xpThresholds.length
    && state.xp >= cfg.progression.xpThresholds[state.level - 1]) {
    events.push(...levelUp(state, rng));
  }
  return events;
}

/** Applies only a relic from the current relic decision. Queue advancement is owned by C1. */
export function applyRelic(state: GameState, relicId: string): GameEvent[] {
  const decision = state.decisions.current;
  if (decision?.kind !== 'relic' || !decision.options.includes(relicId)) return [];
  const relic = cfg.relics.relics.find(item => item.id === relicId);
  if (!relic || (state.relicStacks[relicId] ?? 0) >= relic.maxStacks) return [];

  state.relicStacks[relicId] = (state.relicStacks[relicId] ?? 0) + 1;
  state.buildState.relicHistory.push(relicId);
  state.buildState.scalingVersion++;
  if (relic.god !== undefined) {
    state.buildState.godAffinity[relic.god] = (state.buildState.godAffinity[relic.god] ?? 0) + 1;
    state.normalDropDirector.roleBag.length = 0;
    state.bountyDirector.rewardBag.length = 0;
    const pityDrops = Math.max(0, Math.round(relic.poolInfluence?.pityDrops ?? 0));
    state.buildState.dropPity = pityDrops > 0
      ? { god: relic.god, remaining: pityDrops }
      : undefined;
  }
  return [{
    type: 'relicSelected',
    relicId,
    rarity: relic.rarity,
    ...(relic.god === undefined ? {} : { god: relic.god }),
  }];
}

function relicDecisionResolver(
  state: GameState,
  _config: Config,
  _rng: Rng,
  decision: RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'relic') return [];
  return applyRelic(state, choice);
}
