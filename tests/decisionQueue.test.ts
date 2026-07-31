import { beforeEach, describe, expect, it } from 'vitest';
import { updateGame } from '../src/core/updateGame';
import { clearDecisionResolvers, enqueueDecision, registerDecisionResolver, resolveCurrentDecision } from '../src/core/systems/decisionQueueSystem';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => { resetTestEnv(); clearDecisionResolvers(); });
describe('decision queue', () => {
  it('queues and resolves choices in order', () => {
    const state = freshState();
    registerDecisionResolver('godFocus', () => []);
    registerDecisionResolver('godFocus', () => []);
    expect(enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm', 'winter'] })).toEqual([{ type: 'decisionOffered', kind: 'godFocus' }]);
    enqueueDecision(state, { kind: 'godFocus', wave: 3, candidates: ['inferno'] });
    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'storm')).toContainEqual({ type: 'decisionOffered', kind: 'godFocus' });
    expect(resolveCurrentDecision(state, createDefaultConfig(), constRng(0), 'inferno')).toContainEqual({ type: 'decisionResolved', kind: 'godFocus', choice: 'inferno' });
    expect(state.decisions.current).toBeNull();
  });
  it('pauses updates for decisions but not reward celebrations', () => {
    const state = freshState(); state.mode = 'playing';
    enqueueDecision(state, { kind: 'godFocus', wave: 2, candidates: ['storm'] });
    expect(updateGame(state, createDefaultConfig(), constRng(0), 1)).toEqual([]);
    state.decisions.current = null; state.paused = false;
    state.rewardMeter.currentReceipt = { rewardId: 'x', activationIndex: 0, result: {} };
    const before = state.time;
    updateGame(state, createDefaultConfig(), constRng(0), 0.25);
    expect(state.time).toBeGreaterThan(before);
  });
});
