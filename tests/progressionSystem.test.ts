import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import {
  addXp,
  applyRelic,
  rollRelicChoices,
} from '../src/core/systems/progressionSystem';
import type { GameState, Rng } from '../src/core/types';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

function seeded(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function withThreeGods(): GameState {
  const state = freshState();
  state.godPool.mainGod = 'storm';
  state.godPool.subGods = ['winter', 'inferno'];
  state.godPool.focusGod = 'storm';
  return state;
}

beforeEach(resetTestEnv);

describe('经验阈值与遗物决策队列', () => {
  it('一次跨越多个累计阈值时逐项排队且选项不覆盖', () => {
    const state = withThreeGods();
    const events = addXp(state, 40, seeded(42));

    expect(state.level).toBe(4);
    expect(state.xp).toBe(40);
    expect(state.xpNeed).toBe(62);
    expect(events.filter(event => event.type === 'relicOffered')).toHaveLength(3);
    expect(state.decisions.current).toMatchObject({ kind: 'relic', relicIndex: 0 });
    expect(state.decisions.pending.map(decision => decision.kind)).toEqual(['relic', 'relic']);
    const offers = [
      state.decisions.current,
      ...state.decisions.pending,
    ].map(decision => decision?.kind === 'relic' ? [...decision.options] : []);

    for (let index = 0; index < 3; index++) {
      const current = state.decisions.current;
      expect(current?.kind).toBe('relic');
      if (current?.kind !== 'relic') throw new Error('expected relic decision');
      expect(current.options).toEqual(offers[index]);
      const resolved = resolveCurrentDecision(state, createDefaultConfig(), seeded(index + 1), current.options[0]);
      expect(resolved).toContainEqual(expect.objectContaining({ type: 'relicSelected', relicId: current.options[0] }));
    }
    expect(state.decisions).toEqual({ current: null, pending: [] });
    expect(state.buildState.relicHistory).toHaveLength(3);
  });

  it('阈值表耗尽后自然封顶 8 个', () => {
    const state = withThreeGods();
    addXp(state, 100_000, seeded(7));
    expect(state.level).toBe(9);
    expect([state.decisions.current, ...state.decisions.pending]).toHaveLength(8);
    expect(addXp(state, 100_000, seeded(8))).toEqual([]);
  });
});

describe('遗物候选与品质节奏', () => {
  it('固定 seed 可复现，且候选只来自已选神与中立', () => {
    const first = withThreeGods();
    const second = withThreeGods();
    const left = rollRelicChoices(first, seeded(20260724), 4);
    const right = rollRelicChoices(second, seeded(20260724), 4);
    expect(left).toEqual(right);
    expect(left).toHaveLength(cfg.progression.relicChoices);
    for (const id of left) {
      const relic = cfg.relics.relics.find(item => item.id === id)!;
      expect(relic.god === undefined || ['storm', 'winter', 'inferno'].includes(relic.god)).toBe(true);
      expect(relic.god).not.toBe('bulwark');
      expect(relic.god).not.toBe('plenty');
    }
  });

  it('前两个固定 seed 选择为 common，后段权重可抽到 epic', () => {
    const early = withThreeGods();
    addXp(early, cfg.progression.xpThresholds[1], constRng(0));
    for (let index = 0; index < 2; index++) {
      const decision = early.decisions.current;
      if (decision?.kind !== 'relic') throw new Error('expected relic decision');
      const selected = cfg.relics.relics.find(relic => relic.id === decision.options[0])!;
      expect(selected.rarity).toBe('common');
      resolveCurrentDecision(early, createDefaultConfig(), constRng(0), selected.id);
    }

    const late = rollRelicChoices(withThreeGods(), constRng(0.99), 7)
      .map(id => cfg.relics.relics.find(relic => relic.id === id)!.rarity);
    expect(late).toContain('epic');
  });

  it('配置中不存在 stat 升级，且每条遗物静态覆盖至少 3 张卡', () => {
    const forbidden = new Set(['heal', 'maxHp', 'rangePct', 'damagePct', 'fireRatePct', 'xpGainPct']);
    for (const relic of cfg.relics.relics) {
      expect(relic.effects.every(effect => effect.kind === 'buildScaling')).toBe(true);
      expect(relic.effects.some(effect => forbidden.has((effect as unknown as { stat?: string }).stat ?? ''))).toBe(false);
      const covered = cfg.skills.cards.filter(card => (
        card.synergyTags.some(tag => relic.targetTags.includes(tag))
      ));
      expect(covered.length, relic.id).toBeGreaterThanOrEqual(3);
    }
    expect(() => validateGodConfig(cfg)).not.toThrow();
  });
});

describe('选择遗物后的按神导流', () => {
  it('神 affinity +1、掉落袋重建，并设置该神 pity', () => {
    const state = withThreeGods();
    state.normalDropDirector.roleBag = ['build'];
    state.bountyDirector.rewardBag = ['pierce'];
    addXp(state, cfg.progression.xpThresholds[0], constRng(0));
    const decision = state.decisions.current;
    if (decision?.kind !== 'relic') throw new Error('expected relic decision');
    const stormRelic = decision.options.find(id => cfg.relics.relics.find(relic => relic.id === id)?.god === 'storm');
    expect(stormRelic).toBeDefined();

    resolveCurrentDecision(state, createDefaultConfig(), constRng(0), stormRelic!);
    expect(state.buildState.godAffinity.storm).toBe(1);
    expect(state.normalDropDirector.roleBag).toEqual([]);
    expect(state.bountyDirector.rewardBag).toEqual([]);
    expect(state.buildState.dropPity).toEqual({ god: 'storm', remaining: 2 });
  });

  it('非当前候选遗物不能应用', () => {
    const state = withThreeGods();
    addXp(state, 10, constRng(0));
    expect(applyRelic(state, 'bulwark_revenge_edict')).toEqual([]);
    expect(state.buildState.relicHistory).toEqual([]);
  });
});
