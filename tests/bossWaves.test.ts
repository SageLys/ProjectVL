import { beforeEach, describe, expect, it } from 'vitest';
import { applyVariants, buildConfig, cfg, normalizeBossWaves, parseBossWavesInput } from '../src/config';
import { determineType } from '../src/core/systems/enemySystem';
import { advanceWavePhase, tickSpawns } from '../src/core/systems/waveSystem';
import { formatBossWaves, migratePresetValues, tunerParam } from '../src/ui/tunerSchema';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('explicit end-of-wave Boss configuration', () => {
  it('keeps regular quota type selection free of bosses', () => {
    cfg.waves.bossWaves = [1, 2, 3];
    for (const wave of [1, 2, 3]) expect(determineType(wave, 0.99, 1)).toBe('normal');
    const state = freshState();
    state.wave = 1; state.spawnLeft = 1; state.spawnTimer = 0;
    tickSpawns(state, constRng(0.99), 0);
    expect(state.enemies[0].type).not.toBe('boss');
    expect(state.enemies[0].spawnKind).toBe('regular');
  });

  it('spawns exactly one extra Boss only after the regular field clears', () => {
    cfg.waves.bossWaves = [1];
    const state = freshState();
    state.wave = 1; state.spawnLeft = 0;
    const blocker = { id: 99, spawnKind: 'regular' as const };
    state.enemies = [blocker as never];
    expect(advanceWavePhase(state, createDefaultConfig(), constRng(0))).toEqual([]);
    state.enemies = [];
    expect(advanceWavePhase(state, createDefaultConfig(), constRng(0))).toEqual([{ type: 'waveBossSpawned', wave: 1 }]);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]).toMatchObject({ type: 'boss', spawnKind: 'waveBoss' });
    expect(state.waveBossId).toBe(state.enemies[0].id);
    expect(advanceWavePhase(state, createDefaultConfig(), constRng(0))).toEqual([]);
  });

  it('normalizes input, migrates presets, and updates dev-short defaults', () => {
    expect(parseBossWavesInput('5, 3, 3, 1', 10)).toEqual({ values: [1, 3, 5], invalid: [] });
    expect(normalizeBossWaves([3, 5, 8, 10], 6)).toEqual([3, 5]);
    expect(formatBossWaves([5, 3, 3])).toBe('3, 5');
    expect(migratePresetValues({ 'waves.bossWave': 5 })['waves.bossWaves']).toBe('5');
    const config = buildConfig(['dev-short']);
    expect(config.waves.totalWaves).toBe(3);
    expect(config.waves.bossWaves).toEqual([1, 2, 3]);
    expect(tunerParam('waves.bossWaves')).toMatchObject({ type: 'text', applyPolicy: 'waveDeferred' });
    applyVariants([]);
  });
});
