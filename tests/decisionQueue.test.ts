import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { updateGame } from '../src/core/updateGame';
import {
  clearDecisionResolvers,
  enqueueDecision,
  registerDecisionResolver,
  resolveCurrentDecision,
} from '../src/core/systems/decisionQueueSystem';
import { applyPerk } from '../src/core/systems/progressionSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => {
  resetTestEnv();
  clearDecisionResolvers();
});

describe('统一构筑决策队列', () => {
  it('入队即暂停，后续决策排队且 resolve 后自动弹出下一项', () => {
    const state = freshState();
    expect(enqueueDecision(state, { kind: 'relic', options: ['r1', 'r2'] })).toEqual([
      { type: 'decisionOffered', kind: 'relic' },
    ]);
    expect(enqueueDecision(state, { kind: 'recipeEvolution', recipeId: 'recipe1' })).toEqual([]);
    expect(state.paused).toBe(true);
    expect(state.decisions.current).toMatchObject({ kind: 'relic' });
    expect(state.decisions.pending).toHaveLength(1);

    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'r2')).toEqual([
      { type: 'decisionResolved', kind: 'relic', choice: 'r2' },
      { type: 'decisionOffered', kind: 'recipeEvolution' },
    ]);
    expect(state.decisions.current).toMatchObject({ kind: 'recipeEvolution' });
    expect(state.paused).toBe(true);

    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'recipe1')).toEqual([
      { type: 'decisionResolved', kind: 'recipeEvolution', choice: 'recipe1' },
    ]);
    expect(state.decisions).toEqual({ current: null, pending: [] });
    expect(state.paused).toBe(false);
  });

  it('队列非空时 updateGame 不推进战斗时间或敌人', () => {
    const state = freshState();
    state.enemies.push({ id: 1 } as never);
    enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm', 'winter'] });

    expect(updateGame(state, createDefaultConfig(), constRng(0.5), 1)).toEqual([]);
    expect(state.time).toBe(0);
    expect(state.enemies).toEqual([{ id: 1 }]);
  });

  it('注册 resolver 只收到注入 rng，非法 choice 不消费当前决策', () => {
    const state = freshState();
    const rng = constRng(0.375);
    let sampled = -1;
    registerDecisionResolver('relic', (_state, _config, injectedRng) => {
      sampled = injectedRng();
      return [];
    });
    enqueueDecision(state, { kind: 'relic', options: ['valid'] });

    expect(resolveCurrentDecision(state, createDefaultConfig(), rng, 'invalid')).toEqual([]);
    expect(sampled).toBe(-1);
    expect(resolveCurrentDecision(state, createDefaultConfig(), rng, 'valid')).toContainEqual(
      { type: 'decisionResolved', kind: 'relic', choice: 'valid' },
    );
    expect(sampled).toBe(0.375);
  });

  it('升级三选一优先清空，随后保留决策暂停且不死锁', () => {
    const state = freshState();
    const perkId = cfg.progression.perks[0].id;
    state.pendingLevelUps = 1;
    state.offeredPerks = [perkId];
    state.paused = true;
    enqueueDecision(state, { kind: 'relic', options: ['afterUpgrade'] });

    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'afterUpgrade')).toEqual([]);
    expect(state.decisions.current).toMatchObject({ kind: 'relic' });
    applyPerk(state, createDefaultConfig(), perkId, constRng(0));
    expect(state.pendingLevelUps).toBe(0);
    expect(state.offeredPerks).toEqual([]);
    expect(state.decisions.current).toMatchObject({ kind: 'relic' });
    expect(state.paused).toBe(true);

    resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'afterUpgrade');
    expect(state.paused).toBe(false);
    expect(state.decisions.current).toBeNull();
  });
});
