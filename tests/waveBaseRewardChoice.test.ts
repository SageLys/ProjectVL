// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cfg } from '../src/config';
import { totalFireRate } from '../src/core/stats';
import {
  clearDecisionResolvers,
  enqueueDecision,
  resolveCurrentDecision,
} from '../src/core/systems/decisionQueueSystem';
import {
  buildWaveChoiceMenu,
  enqueueWaveBaseRewardDecision,
} from '../src/core/systems/waveRewardSystem';
import { updateGame } from '../src/core/updateGame';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import {
  card,
  constRng,
  createDefaultConfig,
  freshState,
  resetTestEnv,
} from './helpers';

const runtime = createDefaultConfig();

beforeEach(() => {
  resetTestEnv();
  clearDecisionResolvers();
});

function offerAndChoose(optionId: string) {
  const state = freshState();
  state.wave = 1;
  enqueueWaveBaseRewardDecision(state, 1);
  const events = resolveCurrentDecision(state, runtime, constRng(0), optionId);
  return { state, events };
}

describe('waveBaseReward choice', () => {
  it('每波入队恰好一个固定五选一且不消耗 RNG', () => {
    const state = freshState();
    const random = vi.spyOn(Math, 'random');

    const menu = buildWaveChoiceMenu(state);
    const events = enqueueWaveBaseRewardDecision(state, 1);

    expect(random).not.toHaveBeenCalled();
    expect(menu).toEqual({
      candidates: ['optDamage', 'optFireRate', 'optMaxHp', 'optRange', 'optXpGain'],
      capped: [],
    });
    expect(state.decisions.current).toEqual({
      kind: 'waveBaseReward',
      wave: 1,
      candidates: menu.candidates,
      capped: [],
    });
    expect(events).toContainEqual({
      type: 'waveBaseRewardOffered',
      wave: 1,
      candidates: menu.candidates,
    });
    expect(enqueueWaveBaseRewardDecision(state, 1)).toEqual([]);
    expect(state.decisions.pending).toHaveLength(0);
  });

  it('射程触顶时 optRange 保留为 capped，但不在 candidates 且无法 resolve', () => {
    const state = freshState();
    state.runBaseStats.rangeAdd = 60;

    enqueueWaveBaseRewardDecision(state, 1);
    const decision = state.decisions.current;
    expect(decision).toMatchObject({
      kind: 'waveBaseReward',
      capped: ['optRange'],
    });
    if (decision?.kind !== 'waveBaseReward') throw new Error('expected waveBaseReward');
    expect(decision.candidates).not.toContain('optRange');
    expect(resolveCurrentDecision(state, runtime, constRng(0), 'optRange')).toEqual([]);
    expect(state.decisions.current).toBe(decision);
  });

  it('装备倍率把有效射程顶满时 optRange 仍可选择', () => {
    const state = freshState();
    state.runBuild.cardAffixRolls.pierce = [
      { stat: 'rangeMul', value: 0.4, consumableDuration: 5 },
    ];
    state.equipment[0] = card('pierce', 3);

    const menu = buildWaveChoiceMenu(state);
    expect(menu.capped).toEqual([]);
    expect(menu.candidates).toContain('optRange');
  });

  it('选择射速、心防上限、经验取得分别只加算被选一项', () => {
    const fireRate = offerAndChoose('optFireRate');
    expect(totalFireRate(fireRate.state, runtime)).toBe(runtime.fireRate + 0.15);
    expect(fireRate.state.maxHp).toBe(100);
    expect(fireRate.state.rewardMeter.pointGainBonus).toBe(0);

    const maxHp = offerAndChoose('optMaxHp');
    expect(maxHp.state.maxHp).toBe(110);
    expect(maxHp.state.hp).toBe(110);
    expect(maxHp.state.runBaseStats.fireRateAdd).toBe(0);

    const xp = offerAndChoose('optXpGain');
    expect(xp.state.rewardMeter.pointGainBonus).toBe(0.08);
    expect(xp.state.runBaseStats.damageAdd).toBe(0);
    expect(xp.events).toContainEqual({
      type: 'waveBaseRewardChosen',
      wave: 1,
      stat: 'xpGainPct',
      add: 0.08,
    });
  });

  it('升级决策保持当前项，波末选择排在其后且互不覆盖', () => {
    const state = freshState();
    enqueueDecision(state, { kind: 'godFocus', wave: 1, candidates: ['storm'] });
    enqueueWaveBaseRewardDecision(state, 1);

    expect(state.decisions.current?.kind).toBe('godFocus');
    expect(state.decisions.pending.map(item => item.kind)).toEqual(['waveBaseReward']);
  });

  it('决策存在时 updateGame 不推进时间或战斗', () => {
    const state = freshState();
    enqueueWaveBaseRewardDecision(state, 1);
    state.paused = false;
    const before = state.time;

    expect(updateGame(state, runtime, constRng(0), 1)).toEqual([]);
    expect(state.time).toBe(before);
  });

  it('记录 offered/resolved 遥测', () => {
    const state = freshState();
    state.wave = 3;
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 42,
      getPresetName: () => 'test',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });

    telemetry.recordGameEvents(enqueueWaveBaseRewardDecision(state, 3));
    telemetry.recordGameEvents(resolveCurrentDecision(state, runtime, constRng(0), 'optDamage'));

    expect(telemetry.getSession().events).toContainEqual(expect.objectContaining({
      type: 'wave_base_reward_offered',
      wave: 3,
      candidates: ['optDamage', 'optFireRate', 'optMaxHp', 'optRange', 'optXpGain'],
    }));
    expect(telemetry.getSession().events).toContainEqual(expect.objectContaining({
      type: 'wave_base_reward_resolved',
      wave: 3,
      waveRewardStat: 'damageAdd',
      waveRewardAdd: 2,
    }));
  });
});
