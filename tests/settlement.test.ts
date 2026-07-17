import { beforeEach, describe, expect, it } from 'vitest';
import { buildRunSummary } from '../src/core/settlement';
import { endGame } from '../src/core/endGame';
import { card, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('run settlement', () => {
  it('computes every score bucket exactly and picks stable build highlights', () => {
    const state = freshState();
    state.wave = 4; state.kills = 10; state.hp = 50; state.maxHp = 100;
    state.cards[0] = card('pierce', 2);
    state.equipment[0] = card('frost', 3);
    state.wildcards[1] = 2; state.wildcards[3] = 1;
    state.buildState.affinity.projectile = 2;
    state.buildState.affinity.control = 2;
    const summary = buildRunSummary(state, false);
    expect(summary).toMatchObject({
      win: false,
      clearedWaves: 3,
      topLane: 'projectile',
      highestCard: { type: 'frost', star: 3 },
      score: { win: 0, waves: 120, kills: 20, hp: 0, build: 130, wildcards: 130, total: 400 },
    });
  });

  it('awards victory and HP score, while all-zero affinity has no top lane', () => {
    const state = freshState(); state.hp = 50; state.maxHp = 100;
    const summary = buildRunSummary(state, true);
    expect(summary.clearedWaves).toBe(8);
    expect(summary.topLane).toBeNull();
    expect(summary.score).toMatchObject({ win: 500, waves: 320, hp: 100, total: 920 });
  });

  it('endGame stores both victory and failure summaries', () => {
    const state = freshState(); state.wave = 2;
    expect(endGame(state, false)).toEqual([{ type: 'gameEnd', win: false }]);
    expect(state.runSummary).toMatchObject({ win: false, clearedWaves: 1 });
  });
});
