import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { enqueueDecision, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import {
  createGodDraftDecision,
  createGodFocusDecision,
  getSelectedGods,
  registerGodPoolDecisionResolvers,
} from '../src/core/systems/godPoolSystem';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { selectNormalEnemyDropType } from '../src/core/systems/dropTypePolicy';
import type { GameState, Rng } from '../src/core/types';
import { createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function chooseDraft(
  state: GameState,
  role: 'main' | 'sub',
  wave: number,
  rng: Rng,
): string {
  registerGodPoolDecisionResolvers();
  const decision = createGodDraftDecision(state, role, wave, rng);
  if (!decision) throw new Error('expected god draft');
  const choice = decision.candidates[0];
  enqueueDecision(state, decision);
  resolveCurrentDecision(state, createDefaultConfig(), rng, choice);
  return choice;
}

function selectThreeGods(state: GameState, rng: Rng): void {
  chooseDraft(state, 'main', 1, rng);
  chooseDraft(state, 'sub', 2, rng);
  chooseDraft(state, 'sub', 3, rng);
}

describe('godPoolSystem', () => {
  it('主神与两位副神锁定后生成固定 11 张本局名册', () => {
    const state = freshState();
    const rng = createSeededRng(3103);
    selectThreeGods(state, rng);

    expect(state.godPool.mainGod).not.toBeNull();
    expect(state.godPool.subGods).toHaveLength(2);
    expect(getSelectedGods(state)).toHaveLength(3);
    expect(state.godPool.runRoster).toHaveLength(11);
    expect(new Set(state.godPool.runRoster).size).toBe(11);

    const before = structuredClone(state.godPool.runRoster);
    const focus = createGodFocusDecision(state, 4, 2, rng)!;
    enqueueDecision(state, focus);
    resolveCurrentDecision(state, createDefaultConfig(), rng, focus.candidates[0]);
    expect(state.godPool.runRoster).toEqual(before);
  });

  it('主神固定 5 张、副神固定 3 张，并包含各自配置锚点', () => {
    const state = freshState();
    selectThreeGods(state, createSeededRng(88));

    const main = cfg.gods.gods.find(god => god.id === state.godPool.mainGod)!;
    expect(state.godPool.rosterByGod[main.id]).toHaveLength(5);
    expect(state.godPool.rosterByGod[main.id]).toEqual(expect.arrayContaining(main.anchorCardIds));
    for (const id of state.godPool.subGods) {
      const sub = cfg.gods.gods.find(god => god.id === id)!;
      expect(state.godPool.rosterByGod[id]).toHaveLength(3);
      expect(state.godPool.rosterByGod[id]).toEqual(expect.arrayContaining(sub.anchorCardIds));
    }
  });

  it('相同初始状态与固定 seed 重现神候选和冻结名册', () => {
    const first = freshState();
    const second = freshState();
    selectThreeGods(first, createSeededRng(20260724));
    selectThreeGods(second, createSeededRng(20260724));

    expect(second.godPool.mainGod).toBe(first.godPool.mainGod);
    expect(second.godPool.subGods).toEqual(first.godPool.subGods);
    expect(second.godPool.rosterByGod).toEqual(first.godPool.rosterByGod);
    expect(second.godPool.runRoster).toEqual(first.godPool.runRoster);
  });

  it('连续两次未进入重点候选的神下一次必定入选', () => {
    const state = freshState();
    selectThreeGods(state, createSeededRng(4));
    const selected = getSelectedGods(state);
    const droughtGod = selected[2];
    state.godPool.offerDrought[droughtGod] = 2;

    const offer = createGodFocusDecision(state, 6, 2, createSeededRng(99))!;

    expect(offer.candidates).toContain(droughtGod);
  });

  it('bootstrapForcedDrops=0 makes the first post-sub-god drop use the role bag', () => {
    cfg.economy.normalDropTypePolicy.bootstrapForcedDrops = 0;
    const state = freshState();
    const rng = createSeededRng(904);
    chooseDraft(state, 'main', 1, rng);
    chooseDraft(state, 'sub', 2, rng);

    expect(state.godPool.bootstrapDropsRemaining).toBe(0);
    expect(state.normalDropDirector.roleBag).toEqual([]);
    selectNormalEnemyDropType(state, rng);
    expect(state.normalDropDirector.roleBag).toHaveLength(cfg.economy.normalDropTypePolicy.roleBagSize - 1);
    expect(state.normalDropDirector.ordinaryDropCount).toBe(1);
  });

  it('keeps the default nine forced post-sub-god drops', () => {
    const state = freshState();
    const rng = createSeededRng(905);
    chooseDraft(state, 'main', 1, rng);
    chooseDraft(state, 'sub', 2, rng);
    const queuedFirst = state.godPool.bootstrapQueue[0];

    expect(cfg.economy.normalDropTypePolicy.bootstrapForcedDrops).toBe(9);
    expect(state.godPool.bootstrapDropsRemaining).toBe(9);
    expect(selectNormalEnemyDropType(state, rng)).toBe(queuedFirst);
    expect(state.godPool.bootstrapDropsRemaining).toBe(8);
    expect(state.normalDropDirector.roleBag).toEqual([]);
    expect(state.normalDropDirector.ordinaryDropCount).toBe(1);
  });
});
