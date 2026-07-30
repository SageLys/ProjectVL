import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { updateGame } from '../src/core/updateGame';
import { advanceWavePhase, jumpToWave } from '../src/core/systems/waveSystem';
import { enqueueDecision, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import {
  beginIntermission,
  beginOpeningIntermission,
  confirmIntermissionReady,
} from '../src/core/systems/intermissionSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
const runtime = createDefaultConfig();

function enterFreeStep(state: ReturnType<typeof freshState>, freeSeconds: number): void {
  cfg.waves.intermission.settleSeconds = 0;
  cfg.waves.intermission.freeSeconds.selection = freeSeconds;
  beginIntermission(state);
  updateGame(state, runtime, constRng(0), 0); // settle -> decide
  updateGame(state, runtime, constRng(0), 0); // enqueue wave base reward choice
  const decision = state.decisions.current;
  expect(decision?.kind).toBe('waveBaseReward');
  if (decision?.kind !== 'waveBaseReward') throw new Error('expected waveBaseReward');
  resolveCurrentDecision(state, runtime, constRng(0), decision.candidates[0]);
  updateGame(state, runtime, constRng(0), 0); // decide -> free
  expect(state.intermission.step).toBe('free');
}

describe('正式波间阶段', () => {
  it('freeRemaining 仍大于 0 时不开波，显式准备完成后才开下一波', () => {
    const state = freshState();
    state.wave = 1;
    enterFreeStep(state, 10);

    expect(updateGame(state, runtime, constRng(0), 1)).toEqual([]);
    expect(state.wave).toBe(1);
    expect(state.intermission.freeRemaining).toBe(9);
    expect(confirmIntermissionReady(state)).toEqual([
      { type: 'intermissionReady', wave: 1, automatic: false },
    ]);
    expect(updateGame(state, runtime, constRng(0), 0)).toContainEqual({ type: 'waveStart', wave: 2 });
    expect(state.intermission.active).toBe(false);
  });

  it('free 倒计时归零会自动准备完成并开波', () => {
    const state = freshState();
    state.wave = 1;
    enterFreeStep(state, 1);

    const events = updateGame(state, runtime, constRng(0), 1);
    expect(events).toContainEqual({ type: 'intermissionReady', wave: 1, automatic: true });
    expect(events).toContainEqual({ type: 'waveStart', wave: 2 });
  });

  it('开局 mini 波间先完成主神选择，再开始第 1 波', () => {
    const state = freshState();
    state.mode = 'playing';
    beginOpeningIntermission(state);

    expect(updateGame(state, runtime, constRng(0), 0)).toContainEqual({
      type: 'decisionOffered',
      kind: 'godDraft',
    });
    const decision = state.decisions.current;
    expect(decision?.kind).toBe('godDraft');
    if (decision?.kind !== 'godDraft') throw new Error('expected godDraft');
    resolveCurrentDecision(state, runtime, constRng(0), decision.candidates[0]);
    expect(updateGame(state, runtime, constRng(0), 0)).toContainEqual({ type: 'waveStart', wave: 1 });
    expect(state.intermission.active).toBe(false);
  });

  it('jumpToWave 清空波间与全部构筑决策', () => {
    const state = freshState();
    state.wave = 2;
    beginIntermission(state);
    enqueueDecision(state, { kind: 'relic', relicIndex: 0, options: ['r1'] });
    enqueueDecision(state, { kind: 'recipePin', candidates: ['recipe1'] });

    jumpToWave(state, runtime, constRng(0), 6);
    expect(state.wave).toBe(6);
    expect(state.intermission.active).toBe(false);
    expect(state.decisions).toEqual({ current: null, pending: [] });
    expect(state.paused).toBe(false);
  });

  it('第 10 波结束直接胜利结算，不产生第 11 波间段', () => {
    const state = freshState();
    state.wave = cfg.waves.totalWaves;
    state.spawnLeft = 0;
    state.enemies.length = 0;
    state.wavePhase = 'regular';
    cfg.waves.bossWaves = [];

    expect(advanceWavePhase(state, runtime, constRng(0))).toEqual([{ type: 'gameEnd', win: true }]);
    expect(state.mode).toBe('ended');
    expect(state.wave).toBe(10);
    expect(state.intermission.active).toBe(false);
  });
});
