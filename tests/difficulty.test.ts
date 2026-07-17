import { afterEach, describe, expect, it } from 'vitest';
import { cfg, buildConfig } from '../src/config';
import type { DifficultyConfig, DifficultyId } from '../src/config/types';
import { validateDifficultyConfig } from '../src/config/difficultyValidator';
import { createInitialState, createDefaultConfig } from '../src/core/createInitialState';
import { difficultyMultiplierAtWave, difficultyMultipliersFor } from '../src/core/difficulty';
import { createEnemy, resyncEnemyStats, spawnEnemy } from '../src/core/systems/enemySystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import type { EnemyType } from '../src/core/types';
import { registerSkillDefs, resetTestEnv } from './helpers';
import { createSeededRng } from '../src/debug/exposeDebugApi';
import { deriveMetrics } from '../src/ui/derivedMetrics';

const IDS: DifficultyId[] = ['relaxed', 'standard', 'hard', 'hell'];
const TYPES: EnemyType[] = ['normal', 'fast', 'tank', 'boss'];

afterEach(resetTestEnv);

describe('difficulty curves and enemy stats', () => {
  it('keeps hell exactly identical to the original enemy formulas at every wave', () => {
    for (const type of TYPES) for (let wave = 1; wave <= cfg.waves.totalWaves; wave++) {
      const state = createInitialState('hell');
      const enemy = createEnemy(state, type, wave, { x: 1, y: 2 });
      const def = cfg.enemies.types[type];
      expect(enemy.maxHp).toBe(def.hpBase + wave * def.hpPerWave);
      expect(enemy.speed).toBe(def.speedBase + wave * def.speedPerWave);
      expect(enemy.damage).toBe(def.damage);
    }
  });

  it('hits endpoints, clamps progress, and uses end when totalWaves is one', () => {
    const curve = { start: 0.45, end: 0.85, power: 1.65 };
    expect(difficultyMultiplierAtWave(curve, 1, 8)).toBe(curve.start);
    expect(difficultyMultiplierAtWave(curve, 8, 8)).toBe(curve.end);
    expect(difficultyMultiplierAtWave(curve, -99, 8)).toBe(curve.start);
    expect(difficultyMultiplierAtWave(curve, 99, 8)).toBe(curve.end);
    expect(difficultyMultiplierAtWave(curve, 1, 1)).toBe(curve.end);
  });

  it('is monotonic and power > 1 makes later per-wave growth steeper', () => {
    const curve = { start: 0.5, end: 1, power: 2 };
    const values = Array.from({ length: 9 }, (_, index) => difficultyMultiplierAtWave(curve, index + 1, 9));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    expect(values[8] - values[7]).toBeGreaterThan(values[1] - values[0]);
  });

  it('orders relaxed ≤ standard ≤ hard ≤ hell throughout the run', () => {
    for (let wave = 1; wave <= cfg.waves.totalWaves; wave++) for (const type of TYPES) {
      const values = IDS.map(id => difficultyMultipliersFor(id, type, wave));
      for (const stat of ['hp', 'damage', 'speed'] as const) {
        for (let i = 1; i < values.length; i++) expect(values[i][stat]).toBeGreaterThanOrEqual(values[i - 1][stat]);
      }
    }
    const wave1 = IDS.map(id => difficultyMultipliersFor(id, 'normal', 1));
    for (const stat of ['hp', 'damage'] as const) {
      for (let i = 1; i < wave1.length; i++) expect(wave1[i][stat]).toBeGreaterThan(wave1[i - 1][stat]);
    }
  });

  it('loads the specified wave-one values, final endpoints, and standard UI default', () => {
    expect(cfg.difficulty.defaultDifficulty).toBe('standard');
    expect(IDS.map(id => difficultyMultipliersFor(id, 'normal', 1).hp)).toEqual([0.45, 0.65, 0.82, 1]);
    expect(IDS.map(id => difficultyMultipliersFor(id, 'normal', 1).damage)).toEqual([0.35, 0.55, 0.75, 1]);
    expect(IDS.map(id => difficultyMultipliersFor(id, 'normal', cfg.waves.totalWaves).hp)).toEqual([0.85, 0.95, 1, 1]);
    expect(IDS.map(id => difficultyMultipliersFor(id, 'normal', cfg.waves.totalWaves).damage)).toEqual([0.75, 0.9, 1, 1]);
    expect(createInitialState().difficultyId).toBe('hell');
  });

  it('makes relaxed wave-one projected TTK 45% of hell and reaches configured final values', () => {
    const runtime = createDefaultConfig();
    const relaxedTtk = deriveMetrics(cfg, runtime, 'relaxed').cells.normal[0].ttk;
    const hellTtk = deriveMetrics(cfg, runtime, 'hell').cells.normal[0].ttk;
    expect(relaxedTtk / hellTtk).toBeCloseTo(0.45, 12);
    expect(difficultyMultipliersFor('relaxed', 'normal', cfg.waves.totalWaves)).toEqual({ hp: 0.85, damage: 0.75, speed: 1 });
  });

  it('does not change xp or radius across difficulties', () => {
    for (const type of TYPES) {
      const values = IDS.map(id => createEnemy(createInitialState(id), type, 1, { x: 0, y: 0 }));
      expect(values.map(enemy => enemy.xp)).toEqual(values.map(() => cfg.enemies.types[type].xp));
      expect(values.map(enemy => enemy.r)).toEqual(values.map(() => cfg.enemies.types[type].r));
    }
  });

  it('applies boss overrides only to boss enemies', () => {
    const enemyHp = cfg.difficulty.profiles.relaxed.enemy.hp.start;
    cfg.difficulty.profiles.relaxed.boss!.hp = { start: 0.5, end: 0.5, power: 1 };
    expect(difficultyMultipliersFor('relaxed', 'boss', 1).hp).toBe(0.5);
    for (const type of ['normal', 'fast', 'tank'] as EnemyType[]) {
      expect(difficultyMultipliersFor('relaxed', type, 1).hp).toBe(enemyHp);
    }
  });

  it('multiplies Bounty modifiers after difficulty and stores external modifiers', () => {
    cfg.difficulty.profiles.relaxed.enemy.hp = { start: 0.5, end: 0.5, power: 1 };
    const state = createInitialState('relaxed');
    const enemy = createEnemy(state, 'normal', 1, { x: 0, y: 0 }, { hpMul: 1.8, speedMul: 1.2, damageMul: 1.4 });
    const def = cfg.enemies.types.normal;
    expect(enemy.maxHp).toBe((def.hpBase + def.hpPerWave) * 0.5 * 1.8);
    expect(enemy.statMods).toEqual({ hpMul: 1.8, speedMul: 1.2, damageMul: 1.4 });
  });

  it('resync preserves difficulty, external modifiers, and current HP ratio', () => {
    cfg.difficulty.profiles.relaxed.enemy.hp = { start: 0.5, end: 0.5, power: 1 };
    const state = createInitialState('relaxed');
    state.wave = 2;
    const enemy = createEnemy(state, 'normal', state.wave, { x: 0, y: 0 }, { hpMul: 1.8 });
    enemy.hp = enemy.maxHp * 0.4;
    cfg.enemies.types.normal.hpBase += 10;
    resyncEnemyStats(enemy, state, 'hpBase');
    const def = cfg.enemies.types.normal;
    expect(enemy.maxHp).toBe((def.hpBase + state.wave * def.hpPerWave) * 0.5 * 1.8);
    expect(enemy.hp / enemy.maxHp).toBeCloseTo(0.4, 12);
  });
});

describe('difficulty configuration boundaries', () => {
  function invalid(mutate: (config: DifficultyConfig) => void): DifficultyConfig {
    const config = structuredClone(cfg.difficulty);
    mutate(config);
    return config;
  }

  it.each([
    ['start <= 0', (c: DifficultyConfig) => { c.profiles.relaxed.enemy.hp.start = 0; }],
    ['end < start', (c: DifficultyConfig) => { c.profiles.relaxed.enemy.hp = { start: 1, end: 0.5, power: 1 }; }],
    ['hell non-identity', (c: DifficultyConfig) => { c.profiles.hell.enemy.damage.end = 0.9; }],
    ['illegal profile key', (c: DifficultyConfig) => { (c.profiles.relaxed as unknown as Record<string, unknown>).xp = 2; }],
  ] as Array<[string, (config: DifficultyConfig) => void]>)('rejects %s', (_name, mutate) => {
    expect(() => validateDifficultyConfig(invalid(mutate))).toThrow(/difficulty-config/);
  });

  it('rejects a defaultDifficulty that is not a profile key', () => {
    expect(() => validateDifficultyConfig(invalid(c => { c.defaultDifficulty = 'missing' as DifficultyId; }))).toThrow(/difficulty-config/);
  });

  it('does not mutate protected configuration domains', () => {
    const base = buildConfig();
    const protectedDomains = structuredClone({ waves: base.waves, economy: base.economy, progression: base.progression, skills: base.skills });
    for (const id of IDS) {
      createInitialState(id);
      for (const type of TYPES) difficultyMultipliersFor(id, type, 1);
    }
    expect({ waves: cfg.waves, economy: cfg.economy, progression: cfg.progression, skills: cfg.skills }).toEqual(protectedDomains);
  });
});

describe('difficulty RNG isolation', () => {
  it('selecting a difficulty does not change RNG consumption at wave start', () => {
    registerSkillDefs([]);
    const callsFor = (id: DifficultyId) => {
      let calls = 0;
      const rng = () => { calls++; return 0.5; };
      const state = createInitialState(id);
      startNextWave(state, createDefaultConfig(), rng);
      return calls;
    };
    expect(callsFor('relaxed')).toBe(callsFor('hell'));
  });

  it('keeps fixed-seed type and position sequences identical in all four profiles', () => {
    const sequences = IDS.map(id => {
      const state = createInitialState(id);
      state.wave = 1;
      state.spawnLeft = 12;
      const rng = createSeededRng(42);
      for (let i = 0; i < 12; i++) spawnEnemy(state, rng);
      return state.enemies.map(enemy => ({ type: enemy.type, x: enemy.x, y: enemy.y }));
    });
    for (const sequence of sequences.slice(1)) expect(sequence).toEqual(sequences[0]);
  });
});
