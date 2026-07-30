import { beforeEach, describe, expect, it } from 'vitest';
import { updateGame } from '../src/core/updateGame';
import { clearDecisionResolvers, enqueueDecision, registerDecisionResolver, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => { resetTestEnv(); clearDecisionResolvers(); });
describe('decision queue', () => {
  it('queues and resolves choices in order', () => {
    const state = freshState();
    registerDecisionResolver('godFocus', () => []);
    registerDecisionResolver('recipePin', () => []);
    expect(enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm', 'winter'] })).toEqual([{ type: 'decisionOffered', kind: 'godFocus' }]);
    enqueueDecision(state, { kind: 'recipePin', candidates: ['recipe1'] });
    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'storm')).toContainEqual({ type: 'decisionOffered', kind: 'recipePin' });
    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'recipe1')).toContainEqual({ type: 'decisionResolved', kind: 'recipePin', choice: 'recipe1' });
    expect(state.decisions.current).toBeNull();
  });
  it('pauses updates for decisions and reward receipts', () => {
    const state = freshState(); state.mode = 'playing';
    enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm'] });
    expect(updateGame(state, createDefaultConfig(), constRng(0), 1)).toEqual([]);
    state.decisions.current = null; state.paused = false;
    state.rewardMeter.currentReceipt = { rewardId: 'x', activationIndex: 0, result: {} };
    expect(updateGame(state, createDefaultConfig(), constRng(0), 1)).toEqual([]);
  });
});
