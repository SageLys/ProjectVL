// @vitest-environment happy-dom
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
import { createIntermissionPanel } from '../src/ui/intermissionPanel';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
const runtime = createDefaultConfig();

function enterFreeStep(state: ReturnType<typeof freshState>, freeSeconds: number): void {
  cfg.waves.intermission.settleSeconds = 0;
  cfg.waves.intermission.freeSeconds.selection = freeSeconds;
  beginIntermission(state);
  updateGame(state, runtime, constRng(0), 0); // enqueue wave base reward choice
  const decision = state.decisions.current;
  expect(decision?.kind).toBe('waveBaseReward');
  if (decision?.kind !== 'waveBaseReward') throw new Error('expected waveBaseReward');
  resolveCurrentDecision(state, runtime, constRng(0), decision.candidates[0]);
  updateGame(state, runtime, constRng(0), 0); // rewardChoice -> settle
  updateGame(state, runtime, constRng(0), 0); // settle -> godDecision
  updateGame(state, runtime, constRng(0), 0); // godDecision -> free
  expect(state.intermission.step).toBe('free');
}

describe('正式波间阶段', () => {
  it('按强化选择、结算、神池决策、自由整备的顺序推进', () => {
    const state = freshState();
    state.wave = 3;
    state.godPool.mainGod = cfg.gods.gods[0].id;
    state.godPool.subGods = [cfg.gods.gods[1].id, cfg.gods.gods[2].id];
    cfg.waves.intermission.settleSeconds = 0;
    beginIntermission(state);

    const frames: Array<{ step: string; decision: string | null; events: string[] }> = [];
    const tick = (): ReturnType<typeof updateGame> => {
      const events = updateGame(state, runtime, constRng(0), 0);
      frames.push({
        step: state.intermission.step,
        decision: state.decisions.current?.kind ?? null,
        events: events.map(event => event.type),
      });
      return events;
    };

    tick();
    expect(frames[frames.length - 1]).toMatchObject({ step: 'rewardChoice', decision: 'waveBaseReward' });
    const rewardDecision = state.decisions.current;
    if (rewardDecision?.kind !== 'waveBaseReward') throw new Error('expected waveBaseReward');
    const selected = rewardDecision.candidates[0];
    resolveCurrentDecision(state, runtime, constRng(0), selected);
    expect(state.intermission.selectedReward?.id).toBe(selected);

    tick(); // rewardChoice -> settle
    tick(); // settle -> godDecision
    tick(); // offer godFocus
    expect(frames[frames.length - 1]).toMatchObject({ step: 'godDecision', decision: 'godFocus' });
    const godDecision = state.decisions.current;
    if (godDecision?.kind !== 'godFocus') throw new Error('expected godFocus');
    resolveCurrentDecision(state, runtime, constRng(0), godDecision.candidates[0]);
    tick(); // godDecision -> free

    expect(frames.map(frame => `${frame.step}:${frame.decision ?? '-'}`)).toEqual([
      'rewardChoice:waveBaseReward',
      'settle:-',
      'godDecision:-',
      'godDecision:godFocus',
      'free:-',
    ]);
    const rewardFrame = frames.findIndex(frame => frame.events.includes('waveBaseRewardOffered'));
    const godFrame = frames.findIndex(frame => frame.events.includes('godOffer'));
    expect(rewardFrame).toBeGreaterThanOrEqual(0);
    expect(godFrame).toBeGreaterThan(rewardFrame);
  });

  it('仅在 settle 与 free 阶段显示结算面板', () => {
    document.body.replaceChildren();
    const arena = document.createElement('div');
    document.body.append(arena);
    const panel = createIntermissionPanel(arena, { onReady() {} });
    const state = freshState();
    state.wave = 3;
    beginIntermission(state);
    const root = arena.querySelector<HTMLElement>('.intermission-panel');

    for (const [step, hidden] of [
      ['rewardChoice', true],
      ['settle', false],
      ['godDecision', true],
      ['free', false],
    ] as const) {
      state.intermission.step = step;
      panel.render(state);
      expect(root?.hidden).toBe(hidden);
    }
  });

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
    enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm'] });
    enqueueDecision(state, { kind: 'godFocus', wave: 3, candidates: ['winter'] });

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
