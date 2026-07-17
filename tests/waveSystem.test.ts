import { beforeEach, describe, expect, it } from 'vitest';
import { moveEnemies } from '../src/core/systems/enemySystem';
import { advanceWavePhase, enemyCountFor, jumpToWave, startNextWave } from '../src/core/systems/waveSystem';
import { constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
const config = createDefaultConfig();

describe('wave phase machine', () => {
  it('preserves regular quota math and resets phase state on wave start/jump', () => {
    expect(enemyCountFor(1)).toBe(8);
    const state = freshState();
    state.wavePhase = 'boss'; state.waveBossId = 4; state.waveBossSpawnedAt = 10;
    startNextWave(state, config, constRng(0));
    expect(state).toMatchObject({ wave: 1, wavePhase: 'regular', waveBossId: null, waveBossSpawnedAt: null });
    jumpToWave(state, config, constRng(0), 4);
    expect(state).toMatchObject({ wave: 4, wavePhase: 'regular', waveBossId: null });
  });

  it('expires unaccepted offers when entering Boss phase', () => {
    const state = freshState();
    state.wave = 1; state.spawnLeft = 0;
    state.bountyOffers = [{ id: 7 } as never, { id: 8 } as never];
    const events = advanceWavePhase(state, config, constRng(0));
    expect(events.slice(0, 2)).toEqual([
      { type: 'bountyOfferExpired', offerId: 7 },
      { type: 'bountyOfferExpired', offerId: 8 },
    ]);
    expect(state.bountyOffers).toEqual([]);
    expect(state.wavePhase).toBe('boss');
  });

  it('waits for accepted Bounty encounters before entering Boss phase', () => {
    const state = freshState();
    state.wave = 1; state.spawnLeft = 0;
    state.bountyEncounters = [{ status: 'spawning' } as never];
    expect(advanceWavePhase(state, config, constRng(0))).toEqual([]);
    expect(state.wavePhase).toBe('regular');
  });

  it('does not begin between-wave rest while the Boss survives', () => {
    const state = freshState(); state.wave = 1; state.spawnLeft = 0;
    advanceWavePhase(state, config, constRng(0));
    expect(advanceWavePhase(state, config, constRng(0))).toEqual([]);
    expect(state.between).toBe(0);
  });

  it('keeps a surviving Boss in the phase after a breakthrough', () => {
    const state = freshState(); state.wave = 1; state.spawnLeft = 0;
    advanceWavePhase(state, config, constRng(0));
    const boss = state.enemies[0];
    boss.x = 270; boss.y = 365; boss.damage = 1;
    moveEnemies(state, config, constRng(0), 0);
    expect(state.mode).toBe('playing');
    expect(state.wavePhase).toBe('boss');
    expect(state.enemies).toContain(boss);
    expect(state.waveBossId).toBe(boss.id);
  });

  it('keeps HP-zero defeat behavior and creates a failure summary', () => {
    const state = freshState(); state.wave = 3; state.hp = 10;
    state.enemies = [enemy({ x: 270, y: 365, type: 'boss', spawnKind: 'waveBoss', hp: 100, maxHp: 100, speed: 12, r: 35, damage: 28, xp: 5 })];
    const events = moveEnemies(state, config, constRng(0), 0.016);
    expect(events).toContainEqual({ type: 'gameEnd', win: false });
    expect(state.runSummary).toMatchObject({ win: false, clearedWaves: 2, score: { win: 0 } });
  });
});
