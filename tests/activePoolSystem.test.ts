import { beforeEach, describe, expect, it } from 'vitest';
import { enqueueDecision, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import {
  generateActivePool,
  getGodRoster,
} from '../src/core/systems/activePoolSystem';
import {
  createGodDraftDecision,
  registerGodPoolDecisionResolvers,
} from '../src/core/systems/godPoolSystem';
import { selectNormalEnemyDropType } from '../src/core/systems/dropTypePolicy';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import type { GameState, Rng } from '../src/core/types';
import { card, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

function draft(state: GameState, role: 'main' | 'sub', wave: number, rng: Rng): string {
  registerGodPoolDecisionResolvers();
  const decision = createGodDraftDecision(state, role, wave, rng)!;
  const choice = decision.candidates[0];
  enqueueDecision(state, decision);
  resolveCurrentDecision(state, createDefaultConfig(), rng, choice);
  return choice;
}

function selectedState(seed = 73): { state: GameState; rng: Rng } {
  const state = freshState();
  const rng = createSeededRng(seed);
  draft(state, 'main', 1, rng);
  draft(state, 'sub', 2, rng);
  draft(state, 'sub', 3, rng);
  return { state, rng };
}

describe('activePoolSystem', () => {
  it('第 1 波等于主神 5 张名册，后续池去重且不超过 7', () => {
    const state = freshState();
    const rng = createSeededRng(12);
    draft(state, 'main', 1, rng);

    expect(generateActivePool(state, 1, rng)).toEqual(
      state.godPool.rosterByGod[state.godPool.mainGod!],
    );
    draft(state, 'sub', 2, rng);
    const wave2 = generateActivePool(state, 2, rng);
    expect(wave2.length).toBeLessThanOrEqual(7);
    expect(new Set(wave2).size).toBe(wave2.length);
  });

  it('上波休眠的装备/高星保护链在本波强制回池', () => {
    const { state, rng } = selectedState();
    const protectedType = state.godPool.runRoster[0];
    state.equipment[0] = card(protectedType, 3);
    state.godPool.activePool = state.godPool.runRoster.filter(type => type !== protectedType).slice(0, 6);
    state.godPool.focusGod = state.godPool.subGods[0];

    expect(generateActivePool(state, 5, rng)).toContain(protectedType);
  });

  it('第 7 波起不加入转向卡，第 8 波不首次激活新卡', () => {
    const { state, rng } = selectedState(99);
    state.godPool.focusGod = state.godPool.subGods[0];
    const focus = new Set(getGodRoster(state, state.godPool.focusGod));
    const protectedType = getGodRoster(state, state.godPool.mainGod)[0];
    state.equipment[0] = card(protectedType, 3);
    state.godPool.activePoolHistory = [protectedType, ...focus];

    const wave7 = generateActivePool(state, 7, rng);
    expect(wave7.every(type => focus.has(type) || type === protectedType)).toBe(true);
    const history = new Set(state.godPool.activePoolHistory);
    const wave8 = generateActivePool(state, 8, rng);
    expect(wave8.every(type => history.has(type))).toBe(true);
  });

  it('新副神三张卡在之后九次普通掉落内各展示至少一次', () => {
    const state = freshState();
    const rng = createSeededRng(123);
    draft(state, 'main', 1, rng);
    const sub = draft(state, 'sub', 2, rng);
    const subRoster = getGodRoster(state, sub);
    generateActivePool(state, 2, rng);

    const shown = Array.from({ length: 9 }, () => selectNormalEnemyDropType(state, rng));

    expect(shown).toEqual(expect.arrayContaining(subRoster));
    expect(subRoster.every(type => state.normalDropDirector.typeStats[type].ordinaryShown >= 1)).toBe(true);
  });
});
