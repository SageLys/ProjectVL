import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { updateGame } from '../src/core/updateGame';
import { restartWave, startNextWave } from '../src/core/systems/waveSystem';
import { constRng, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);
describe('spawn-mode wave boundary lifecycle', () => {
  it('keeps active Interval unchanged and applies pending Budget before the next wave begins', () => {
    const state = freshState(); const runtime = createDefaultConfig(); cfg.waves.spawnMode = 'interval'; cfg.waves.firstSpawnDelay = 0; cfg.waves.bossWaves = [];
    cfg.waves.spawnInterval = { base: 5, perWave: 0, min: 5 }; cfg.waves.enemyCountBase = 4; cfg.waves.enemyCountPerWave = 0;
    startNextWave(state, runtime, constRng(.5)); updateGame(state, runtime, constRng(.5), 0);
    expect(state.enemies).toHaveLength(1); // actual active mode is interval
    cfg.waves.budget.targetOnScreen = { base: 4, perWave: 0 }; cfg.waves.budget.batchMax = 4; cfg.waves.budget.maxAlive = 4; cfg.waves.budget.checkInterval = .5;
    let pending: 'budget' | null = 'budget';
    cfg.waves.betweenWaves = .01; state.spawnLeft = 0; state.enemies.length = 0;
    updateGame(state, runtime, constRng(.5), .02, () => { if (pending) { cfg.waves.spawnMode = pending; pending = null; } });
    updateGame(state, runtime, constRng(.5), 0);
    expect(cfg.waves.spawnMode).toBe('budget'); expect(state.enemies).toHaveLength(4);
  });
  it('restart begins from the configuration committed immediately before it', () => {
    const state = freshState(); const runtime = createDefaultConfig(); cfg.waves.spawnMode = 'budget'; cfg.waves.firstSpawnDelay = 0;
    cfg.waves.budget.targetOnScreen = { base: 4, perWave: 0 }; cfg.waves.budget.batchMax = 4; cfg.waves.budget.maxAlive = 4;
    restartWave(state, runtime, constRng(.5)); updateGame(state, runtime, constRng(.5), 0);
    expect(state.enemies).toHaveLength(4);
  });
});
