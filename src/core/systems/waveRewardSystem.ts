import { cfg } from '../../config';
import type { WaveChoiceStatKind } from '../../config/types';
import { maxAttackRange, permanentRange, reconcileMaxHp } from '../stats';
import type { Config, GameEvent, GameState, RunDecision, WaveRewardGrant } from '../types';
import { enqueueDecision, registerDecisionResolver } from './decisionQueueSystem';

type RunBaseRewardEffect = {
  stat: WaveChoiceStatKind;
  add: number;
};

export function applyRunBaseReward(
  state: GameState,
  effect: RunBaseRewardEffect,
): void {
  switch (effect.stat) {
    case 'damageAdd':
      state.runBaseStats.damageAdd += effect.add;
      break;
    case 'fireRateAdd':
      state.runBaseStats.fireRateAdd += effect.add;
      break;
    case 'rangeAdd':
      state.runBaseStats.rangeAdd += effect.add;
      break;
    case 'multiAdd':
      state.runBaseStats.multiAdd += effect.add;
      break;
    case 'maxHpAdd':
      state.baseMaxHp += effect.add;
      reconcileMaxHp(state);
      break;
    case 'heal':
      state.hp = Math.min(state.maxHp, state.hp + effect.add);
      break;
    // Sole percentage-based exception: reward-point gain has no additive base-stat form.
    case 'xpGainPct':
      state.rewardMeter.pointGainBonus += effect.add;
      break;
  }
}

function defaultRuntimeConfig(): Config {
  return {
    ...cfg.combat.defaults,
    ...cfg.economy.defaults,
    ...cfg.enemies.defaults,
  };
}

function rangeIsCapped(state: GameState): boolean {
  return permanentRange(state, defaultRuntimeConfig()) >= maxAttackRange();
}

/**
 * Settles the automatic floor once per wave. Moving the cursor before applying
 * effects makes duplicate hooks and restored settle frames idempotent.
 */
export function grantFloorRewards(state: GameState, wave: number): GameEvent[] {
  if (wave <= 0 || state.waveRewardsClaimedWave >= wave) return [];
  state.waveRewardsClaimedWave = wave;

  const granted: WaveRewardGrant[] = [];
  for (const def of cfg.waveRewards.floor) {
    if (def.stat === 'rangeAdd' && rangeIsCapped(state)) continue;
    applyRunBaseReward(state, def);
    granted.push({ id: def.id, stat: def.stat, add: def.add });
  }

  return granted.length ? [{ type: 'waveRewardsGranted', wave, granted }] : [];
}

/** Builds the fixed menu without consuming RNG; capped options remain visible. */
export function buildWaveChoiceMenu(state: GameState): { candidates: string[]; capped: string[] } {
  const capped = rangeIsCapped(state)
    ? cfg.waveRewards.choice.filter(def => def.stat === 'rangeAdd').map(def => def.id)
    : [];
  const cappedSet = new Set(capped);
  return {
    candidates: cfg.waveRewards.choice.map(def => def.id).filter(id => !cappedSet.has(id)),
    capped,
  };
}

export function applyWaveChoice(
  state: GameState,
  _config: Config,
  optionId: string,
  wave = state.intermission.afterWave,
): GameEvent[] {
  const option = cfg.waveRewards.choice.find(def => def.id === optionId);
  if (!option) return [];
  applyRunBaseReward(state, option);
  return [{
    type: 'waveBaseRewardChosen',
    wave,
    stat: option.stat,
    add: option.add,
  }];
}

function waveBaseRewardResolver(
  state: GameState,
  config: Config,
  _rng: () => number,
  decision: RunDecision,
  choice: string,
): GameEvent[] {
  if (decision.kind !== 'waveBaseReward') return [];
  const events = applyWaveChoice(state, config, choice, decision.wave);
  const option = cfg.waveRewards.choice.find(def => def.id === choice);
  if (option && state.intermission.active && state.intermission.afterWave === decision.wave) {
    state.intermission.selectedReward = { id: option.id, stat: option.stat, add: option.add };
  }
  return events;
}

export function registerWaveBaseRewardDecisionResolver(): void {
  registerDecisionResolver('waveBaseReward', waveBaseRewardResolver);
}

/**
 * Offers one deterministic choice per wave. The independent offered cursor is
 * advanced even if every option is capped and no decision can be queued.
 */
export function enqueueWaveBaseRewardDecision(state: GameState, wave: number): GameEvent[] {
  if (wave <= 0 || (state.waveChoiceOfferedWave ?? 0) >= wave) return [];
  state.waveChoiceOfferedWave = wave;

  const menu = buildWaveChoiceMenu(state);
  if (!menu.candidates.length) return [];
  const decision: Extract<RunDecision, { kind: 'waveBaseReward' }> = {
    kind: 'waveBaseReward',
    wave,
    candidates: menu.candidates,
    capped: menu.capped,
  };
  registerWaveBaseRewardDecisionResolver();
  return [
    { type: 'waveBaseRewardOffered', wave, candidates: [...menu.candidates] },
    ...enqueueDecision(state, decision),
  ];
}

// Also support resolving a persisted current decision before any new offer is built.
registerWaveBaseRewardDecisionResolver();
