import { cfg } from '../../config';
import type { GameEvent, GameState, Rng } from '../types';
import { stageForWave } from '../runStage';
import { enqueueWaveBaseRewardDecision, grantFloorRewards } from './waveRewardSystem';
import { enqueueGodPoolDecisionForIntermission } from './godPoolSystem';
import { recomputeRecipeReadiness } from './recipeEvolutionSystem';

export interface IntermissionTickResult {
  events: GameEvent[];
  complete: boolean;
}

export const VALIDATION_REWARD_SETTLE_SECONDS = 12;

export function beginValidationRewardSettle(state: GameState): GameEvent[] {
  clearCombatTransients(state);
  state.wavePhase = 'validationRewardSettle';
  state.validationRewardSettleRemaining = VALIDATION_REWARD_SETTLE_SECONDS;
  state.validationRewardSettleConfirmed = false;
  return [{
    type: 'validationRewardSettleStarted',
    wave: state.wave,
    seconds: VALIDATION_REWARD_SETTLE_SECONDS,
  }];
}

export function tickValidationRewardSettle(state: GameState, dt: number): void {
  if (state.wavePhase !== 'validationRewardSettle') return;
  state.validationRewardSettleRemaining = Math.max(0, state.validationRewardSettleRemaining - dt);
}

export function confirmValidationRewardSettle(state: GameState): GameEvent[] {
  if (state.wavePhase !== 'validationRewardSettle' || state.validationRewardSettleConfirmed) return [];
  state.validationRewardSettleConfirmed = true;
  return [];
}

function freeSecondsFor(afterWave: number): number {
  const plan = cfg.waves.stagePlan;
  const stage = stageForWave(afterWave, cfg.waves.totalWaves, plan);
  if (stage === 'selection') return cfg.waves.intermission.freeSeconds.selection;
  if (stage === 'validation') return cfg.waves.intermission.freeSeconds.validation;
  return afterWave <= plan.selectionWaves + 3
    ? cfg.waves.intermission.freeSeconds.buildEarly
    : cfg.waves.intermission.freeSeconds.buildLate;
}

function clearCombatTransients(state: GameState): void {
  state.bullets.length = 0;
  state.beams.length = 0;
  state.vfx.length = 0;
  state.zones = state.zones.filter(zone => zone.remaining > 0);
}

/** 正常波结束入口。settle 与 decide 各保留独立钩子帧。 */
export function beginIntermission(state: GameState): GameEvent[] {
  clearCombatTransients(state);
  state.wavePhase = 'between';
  state.intermission = {
    active: true,
    afterWave: state.wave,
    step: 'rewardChoice',
    settleRemaining: Math.max(0, cfg.waves.intermission.settleSeconds),
    freeRemaining: 0,
    readyConfirmed: false,
    rewardsGranted: [],
    selectedReward: null,
  };
  return [{ type: 'waveCleared', wave: state.wave }];
}

/** 开局 mini 波间：只经过 decide；C3 将在该帧加入主神决策。 */
export function beginOpeningIntermission(state: GameState): GameEvent[] {
  state.wavePhase = 'between';
  state.intermission = {
    active: true,
    afterWave: 0,
    step: 'godDecision',
    settleRemaining: 0,
    freeRemaining: 0,
    readyConfirmed: false,
    rewardsGranted: [],
    selectedReward: null,
  };
  return [];
}

export function confirmIntermissionReady(state: GameState): GameEvent[] {
  if (!state.intermission.active || state.intermission.step !== 'free' || state.intermission.readyConfirmed) return [];
  state.intermission.readyConfirmed = true;
  return [{ type: 'intermissionReady', wave: state.intermission.afterWave, automatic: false }];
}

/** 只推进波间状态；真正开下一波由 waveSystem 在 complete 后执行。 */
export function tickIntermission(
  state: GameState,
  dt: number,
  rng: Rng = () => 0,
): IntermissionTickResult {
  const intermission = state.intermission;
  if (!intermission.active) return { events: [], complete: false };

  if (intermission.step === 'rewardChoice') {
    const events = enqueueWaveBaseRewardDecision(state, intermission.afterWave);
    if (events.length) return { events, complete: false };
    if (state.decisions.current || state.decisions.pending.length) {
      return { events: [], complete: false };
    }
    intermission.step = 'settle';
    return { events: [], complete: false };
  }

  if (intermission.step === 'settle') {
    const events = grantFloorRewards(state, intermission.afterWave);
    const granted = events.find(event => event.type === 'waveRewardsGranted');
    if (granted?.type === 'waveRewardsGranted') {
      intermission.rewardsGranted = granted.granted.map(reward => ({ ...reward }));
    }
    intermission.settleRemaining = Math.max(0, intermission.settleRemaining - dt);
    if (intermission.settleRemaining <= 0) intermission.step = 'godDecision';
    return { events, complete: false };
  }

  if (intermission.step === 'godDecision') {
    const godEvents = enqueueGodPoolDecisionForIntermission(state, rng);
    if (godEvents.length) return { events: godEvents, complete: false };
    if (state.decisions.current || state.decisions.pending.length) {
      return { events: [], complete: false };
    }
    // 开局只含 decide，不进入自由整备。
    if (intermission.afterWave === 0) return { events: [], complete: true };
    intermission.step = 'free';
    intermission.freeRemaining = Math.max(0, freeSecondsFor(intermission.afterWave));
    return {
      events: recomputeRecipeReadiness(state),
      complete: false,
    };
  }

  if (!intermission.readyConfirmed) {
    intermission.freeRemaining = Math.max(0, intermission.freeRemaining - dt);
    if (intermission.freeRemaining <= 0) {
      intermission.readyConfirmed = true;
      return {
        events: [{ type: 'intermissionReady', wave: intermission.afterWave, automatic: true }],
        complete: true,
      };
    }
  }
  return { events: [], complete: intermission.readyConfirmed };
}

export function endIntermission(state: GameState): void {
  state.intermission = {
    active: false,
    afterWave: 0,
    step: 'godDecision',
    settleRemaining: 0,
    freeRemaining: 0,
    readyConfirmed: false,
    rewardsGranted: [],
    selectedReward: null,
  };
}
