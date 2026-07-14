import { beforeEach, describe, expect, it } from 'vitest';
import { applyVariants, buildConfig, normalizeBossWaves, parseBossWavesInput, cfg } from '../src/config';
import { determineType } from '../src/core/systems/enemySystem';
import { tickSpawns } from '../src/core/systems/waveSystem';
import { constRng, freshState } from './helpers';
import { BUDGET_TUNER_PARAMS, formatBossWaves, migratePresetValues } from '../src/ui/tunerSchema';
import { resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('multiple boss waves', () => {
  it('uses the final slot only for configured boss waves', () => {
    cfg.waves.bossWaves = [5]; // base 焙入后默认 [3,5,8]；本用例专测单一 boss 波语义
    expect(cfg.waves.bossWaves).toEqual([5]);
    expect(determineType(5, 0.8, 1)).toBe('boss');
    for (const wave of [1, 2, 3, 4]) expect(determineType(wave, 0.8, 1)).not.toBe('boss');
    cfg.waves.bossWaves = [2, 4, 5];
    for (const wave of [2, 4, 5]) expect(determineType(wave, 0.8, 1)).toBe('boss');
    for (const wave of [1, 3]) expect(determineType(wave, 0.8, 1)).not.toBe('boss');
    expect(determineType(4, 0.8, 2)).not.toBe('boss');
    cfg.waves.bossWaves = [];
    expect(determineType(5, 0.8, 1)).not.toBe('boss');
  });

  it('normalizes input and removes unreachable waves', () => {
    expect(parseBossWavesInput('5, 3, 3, 1', 10)).toEqual({ values: [1, 3, 5], invalid: [] });
    expect(parseBossWavesInput('3，5，8', 10).values).toEqual([3, 5, 8]);
    expect(parseBossWavesInput('', 10)).toEqual({ values: [], invalid: [] });
    for (const input of ['0', '-1', '1.5', 'abc', '11']) expect(parseBossWavesInput(input, 10).invalid).toHaveLength(1);
    expect(normalizeBossWaves([3, 5, 8, 10], 6)).toEqual([3, 5]);
  });

  it('replaces arrays in the dev-short variant', () => {
    const config = buildConfig(['dev-short']);
    expect(config.waves.totalWaves).toBe(3);
    expect(config.waves.bossWaves).toEqual([3]);
    applyVariants([]);
  });

  it('migrates old presets and compares boss waves by value', () => {
    expect(formatBossWaves([5, 3, 3])).toBe('3, 5');
    expect(migratePresetValues({ 'waves.bossWave': 5 })['waves.bossWaves']).toBe('5');
    expect(migratePresetValues({ 'waves.bossWave': 5, 'waves.bossWaves': '3, 5' })['waves.bossWaves']).toBe('3, 5');
  });

  it('generates the final Boss slot in interval and budget modes', () => {
    expect(BUDGET_TUNER_PARAMS).toHaveLength(9);
    for (const mode of ['interval', 'budget'] as const) {
      cfg.waves.spawnMode = mode;
      cfg.waves.bossWaves = [5];
      if (mode === 'budget') {
        cfg.waves.budget.targetOnScreen = { base: 10, perWave: 0 };
        cfg.waves.budget.batchMax = 10;
      }
      const state = freshState();
      state.wave = 5;
      state.spawnLeft = 2;
      state.spawnTimer = 0;
      tickSpawns(state, constRng(0.8), 0);
      if (mode === 'interval') tickSpawns(state, constRng(0.8), 10);
      expect(state.enemies[state.enemies.length - 1]?.type).toBe('boss');
    }
  });
});
