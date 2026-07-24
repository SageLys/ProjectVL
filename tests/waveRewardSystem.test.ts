// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { totalDamage, totalFireRate, totalMulti, totalRange } from '../src/core/stats';
import { beginIntermission, tickIntermission } from '../src/core/systems/intermissionSystem';
import { advanceWavePhase, jumpToWave } from '../src/core/systems/waveSystem';
import { grantFloorRewards } from '../src/core/systems/waveRewardSystem';
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

describe('waveRewardSystem floor', () => {
  it('每波自动精确结算回血、基础伤害和未触顶射程', () => {
    const state = freshState();
    const runtime = createDefaultConfig();
    state.hp = 50;

    const events = grantFloorRewards(state, 2);

    expect(events).toEqual([{
      type: 'waveRewardsGranted',
      wave: 2,
      granted: [
        { id: 'floorHeal', stat: 'heal', add: 8 },
        { id: 'floorDamage', stat: 'damageAdd', add: 1 },
        { id: 'floorRange', stat: 'rangeAdd', add: 4 },
      ],
    }]);
    expect(state.maxHp).toBe(100);
    expect(state.hp).toBe(58);
    expect(totalDamage(state, runtime)).toBe(runtime.damage + 1);
    expect(totalRange(state, runtime)).toBe(runtime.range + 4);
  });

  it('治疗不溢出，射程达到 210 后保底不再加射程', () => {
    const state = freshState();
    state.hp = 99;
    state.runBaseStats.rangeAdd = 60;

    const events = grantFloorRewards(state, 1);

    expect(state.hp).toBe(100);
    expect(state.runBaseStats.rangeAdd).toBe(60);
    expect(events[0]).toMatchObject({
      granted: [
        { id: 'floorHeal' },
        { id: 'floorDamage' },
      ],
    });
  });

  it('同一波只发一次；跳到第 5 波只结算第 5 波保底', () => {
    const runtime = createDefaultConfig();
    const state = freshState();

    expect(grantFloorRewards(state, 2)).toHaveLength(1);
    const snapshot = structuredClone({
      hp: state.hp,
      runBaseStats: state.runBaseStats,
    });
    expect(grantFloorRewards(state, 2)).toEqual([]);
    expect({ hp: state.hp, runBaseStats: state.runBaseStats }).toEqual(snapshot);

    const jumped = freshState();
    jumpToWave(jumped, runtime, constRng(0), 5);
    expect(jumped.waveRewardsClaimedWave).toBe(4);
    expect(jumped.waveChoiceOfferedWave).toBe(4);
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
      damageAdd: 1,
      fireRateAdd: 0,
      rangeAdd: 4,
      multiAdd: 0,
    });
    expect(jumped.waveRewardsClaimedWave).toBe(5);
  });

  it('读档恢复到已结算的 settle 帧不会重复发放', () => {
    const state = freshState();
    state.wave = 3;
    beginIntermission(state);
    tickIntermission(state, 0);
    const restored = structuredClone(state);
    const before = structuredClone({
      hp: restored.hp,
      runBaseStats: restored.runBaseStats,
    });

    expect(tickIntermission(restored, 0).events).toEqual([]);
    expect({
      hp: restored.hp,
      runBaseStats: restored.runBaseStats,
    }).toEqual(before);
  });

  it('所有最终属性公式仍读取 RunBaseStats，乘法 buff 语义不变', () => {
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

  it('校验器禁止保底 pct，仅允许 choice 的 xpGainPct 例外', () => {
    const floorPct = structuredClone(cfg) as any;
    floorPct.waveRewards.floor[0].stat = 'damagePct';
    expect(() => validateGodConfig(floorPct)).toThrow(/floor.*禁止百分比/);

    const choicePct = structuredClone(cfg) as any;
    choicePct.waveRewards.choice[0].stat = 'damagePct';
    expect(() => validateGodConfig(choicePct)).toThrow(/choice.*仅允许 xpGainPct/);

    expect(() => validateGodConfig(structuredClone(cfg))).not.toThrow();
  });

  it('校验器要求固定五项菜单', () => {
    const invalid = structuredClone(cfg);
    invalid.waveRewards.choice.pop();
    expect(() => validateGodConfig(invalid)).toThrow(/必须恰好包含 5 项/);
  });

  it('波间面板只展示本波实际结算的保底汇总', () => {
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
    expect(summary.textContent).toContain('基础伤害 +1');
    expect(summary.textContent).toContain('恢复心防 +8');
    expect(summary.textContent).toContain('基础射程 +4');
  });

  it('记录 wave_rewards_granted 保底遥测及逐项奖励', () => {
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

    telemetry.recordGameEvents(grantFloorRewards(state, 2));

    expect(telemetry.getSession().events).toContainEqual(expect.objectContaining({
      type: 'wave_rewards_granted',
      wave: 2,
      waveRewards: [
        { id: 'floorHeal', stat: 'heal', add: 8 },
        { id: 'floorDamage', stat: 'damageAdd', add: 1 },
        { id: 'floorRange', stat: 'rangeAdd', add: 4 },
      ],
    }));
  });
});
