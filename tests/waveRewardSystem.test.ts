// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { totalDamage, totalFireRate, totalMulti, totalRange } from '../src/core/stats';
import { beginIntermission, tickIntermission } from '../src/core/systems/intermissionSystem';
import { advanceWavePhase, jumpToWave } from '../src/core/systems/waveSystem';
import { grantWaveRewards } from '../src/core/systems/waveRewardSystem';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import { createIntermissionPanel } from '../src/ui/intermissionPanel';
import {
  constRng,
  createDefaultConfig,
  freshState,
  resetTestEnv,
} from './helpers';

beforeEach(() => {
  resetTestEnv();
  document.body.innerHTML = '';
});

describe('waveRewardSystem', () => {
  it('第 2 波同时结算伤害、治疗和血上限奖励', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    state.hp = 50;

    const events = grantWaveRewards(state, 2);

    expect(events).toEqual([{
      type: 'waveRewardsGranted',
      wave: 2,
      granted: [
        { id: 'waveDamage', stat: 'damageAdd', add: 2 },
        { id: 'waveHeal', stat: 'heal', add: 8 },
        { id: 'maxHpMilestone', stat: 'maxHpAdd', add: 10 },
      ],
    }]);
    expect(state.maxHp).toBe(110);
    expect(state.hp).toBe(68);
    expect(state.runBaseStats.damageAdd).toBe(2);
    expect(totalDamage(state, runtime)).toBe(runtime.damage + 2);
  });

  it('同一波只发一次；跳到第 5 波只结算第 5 波奖励', () => {
    const state = freshState();
    const runtime = createDefaultConfig();

    expect(grantWaveRewards(state, 2)).toHaveLength(1);
    const snapshot = structuredClone({
      hp: state.hp,
      maxHp: state.maxHp,
      runBaseStats: state.runBaseStats,
    });
    expect(grantWaveRewards(state, 2)).toEqual([]);
    expect({
      hp: state.hp,
      maxHp: state.maxHp,
      runBaseStats: state.runBaseStats,
    }).toEqual(snapshot);

    const jumped = freshState();
    jumpToWave(jumped, runtime, constRng(0), 5);
    expect(jumped.waveRewardsClaimedWave).toBe(4);
    cfg.waves.bossWaves = [];
    jumped.spawnLeft = 0;
    jumped.enemies.length = 0;
    advanceWavePhase(jumped, runtime, constRng(0));
    const settled = tickIntermission(jumped, 0).events;

    expect(settled).toContainEqual(expect.objectContaining({
      type: 'waveRewardsGranted',
      wave: 5,
    }));
    expect(jumped.runBaseStats).toEqual({
      damageAdd: 2,
      fireRateAdd: 0,
      rangeAdd: 0,
      multiAdd: 1,
    });
    expect(jumped.maxHp).toBe(110);
    expect(jumped.waveRewardsClaimedWave).toBe(5);
  });

  it('所有最终属性公式读取 RunBaseStats，rangeAdd 使用像素基数', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    runtime.damage = 10;
    runtime.fireRate = 2;
    runtime.range = 100;
    state.damageBonus = 5;
    state.fireRateBonus = 0.5;
    state.rangeBonus = 0.1;
    state.multi = 2;
    state.runBaseStats = {
      damageAdd: 3,
      fireRateAdd: 0.25,
      rangeAdd: 8,
      multiAdd: 1,
    };
    state.buffs = [
      { kind: 'damageMul', mul: 2, remaining: 10 },
      { kind: 'fireRateMul', mul: 1.5, remaining: 10 },
    ];

    expect(totalDamage(state, runtime)).toBe(36);
    expect(totalFireRate(state, runtime)).toBe(4.125);
    expect(totalRange(state, runtime)).toBe(118);
    expect(totalMulti(state)).toBe(3);
  });

  it('治疗不溢出上限，maxHpAdd 同步增加当前生命', () => {
    const state = freshState();
    state.hp = 99;

    grantWaveRewards(state, 2);

    expect(state.maxHp).toBe(110);
    expect(state.hp).toBe(110);
  });

  it('配置校验拒绝百分比型永久成长条目', () => {
    const invalid = structuredClone(cfg) as any;
    invalid.waveRewards.rewards[0].effect.stat = 'damagePct';

    expect(() => validateGodConfig(invalid)).toThrow(/waveRewards.*非法基础属性/);
  });

  it('波间面板展示本波实际结算的逐项汇总', () => {
    const arena = document.createElement('div');
    document.body.append(arena);
    const panel = createIntermissionPanel(arena, { onReady() {} });
    const state = freshState();
    state.wave = 2;
    beginIntermission(state);
    tickIntermission(state, 0);

    panel.render(state);

    const summary = arena.querySelector<HTMLElement>('[data-testid="intermission-rewards"]')!;
    expect(summary.hidden).toBe(false);
    expect(summary.querySelectorAll('[data-wave-reward]')).toHaveLength(3);
    expect(summary.textContent).toContain('基础伤害 +2');
    expect(summary.textContent).toContain('恢复心防 +8');
    expect(summary.textContent).toContain('心防上限 +10');
  });

  it('记录 wave_rewards_granted 遥测及逐项奖励', () => {
    const state = freshState();
    state.wave = 2;
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 42,
      getPresetName: () => 'test',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });

    telemetry.recordGameEvents(grantWaveRewards(state, 2));

    expect(telemetry.getSession().events).toContainEqual(expect.objectContaining({
      type: 'wave_rewards_granted',
      wave: 2,
      waveRewards: [
        { id: 'waveDamage', stat: 'damageAdd', add: 2 },
        { id: 'waveHeal', stat: 'heal', add: 8 },
        { id: 'maxHpMilestone', stat: 'maxHpAdd', add: 10 },
      ],
    }));
  });
});
