import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { deriveMetrics } from '../src/ui/derivedMetrics';

describe('Budget derived event estimate', () => {
  function tuned() {
    const game = buildConfig([]); game.waves.spawnMode = 'budget'; game.waves.totalWaves = 3;
    game.waves.enemyCountBase = 24; game.waves.enemyCountPerWave = 0; game.waves.budget.targetOnScreen = { base: 4, perWave: 0 };
    game.waves.budget.checkInterval = .5; game.waves.budget.batchMax = 4; game.waves.budget.maxAlive = 10;
    game.waves.budget.waveEndSprint = { window: 0, multiplier: 2 }; return game;
  }
  it('responds to check cadence, batch capacity, cap and sprint without mutation', () => {
    const game = tuned(); const runtime = createDefaultConfig(); const before = structuredClone(game);
    const base = deriveMetrics(game, runtime);
    const slowChecks = structuredClone(game); slowChecks.waves.budget.checkInterval = 2;
    expect(deriveMetrics(slowChecks, runtime).waveDurations[0]).toBeGreaterThanOrEqual(base.waveDurations[0]);
    const smallBatch = structuredClone(game); smallBatch.waves.budget.batchMax = 1;
    expect(deriveMetrics(smallBatch, runtime).waveDurations[0]).toBeGreaterThanOrEqual(base.waveDurations[0]);
    const capped = structuredClone(game); capped.waves.budget.maxAlive = 2;
    expect(deriveMetrics(capped, runtime).budget!.projections[0].peakOnScreen).toBeLessThanOrEqual(2);
    const sprint = structuredClone(game); sprint.waves.budget.waveEndSprint = { window: 10, multiplier: 2 };
    expect(deriveMetrics(sprint, runtime).budget!.projections[0].sprintTriggered).toBe(true);
    expect(game).toEqual(before);
  });
  it('is globally self-consistent and counts boss guaranteed drops', () => {
    const game = tuned(); game.waves.betweenWaves = 3; game.waves.bossWaves = [2]; const metrics = deriveMetrics(game, createDefaultConfig());
    expect(metrics.totalDuration).toBeCloseTo(metrics.waveDurations.reduce((a, b) => a + b, 0) + 6, 10);
    expect(metrics.expectedDrops).toBeGreaterThan(0);
  });

  it('keeps a live Budget duration projection and responds to every admission control', () => {
    const game = tuned(); const runtime = createDefaultConfig();
    game.waves.spawnMode = 'interval';
    game.waves.budget.waveQuota = { base: 30, perWave: 5 };
    game.waves.budget.targetOnScreen = { base: 4, perWave: 1 };
    game.waves.budget.checkInterval = .7;
    game.waves.budget.batchMax = 3;
    game.waves.budget.maxAlive = 10;
    game.waves.budget.waveEndSprint = { window: 3, multiplier: 1.5 };
    const baseline = deriveMetrics(game, runtime).budget!;
    const cases: Array<(copy: typeof game) => void> = [
      copy => { copy.waves.budget.checkInterval = 1.3; },
      copy => { copy.waves.budget.targetOnScreen.base = 2; },
      copy => { copy.waves.budget.targetOnScreen.perWave = 0; },
      copy => { copy.waves.budget.batchMax = 1; },
      copy => { copy.waves.budget.maxAlive = 3; },
      copy => { copy.waves.budget.waveEndSprint.window = 8; },
      copy => { copy.waves.budget.waveEndSprint.multiplier = 2; },
    ];
    for (const change of cases) {
      const copy = structuredClone(game); change(copy);
      expect(deriveMetrics(copy, runtime).budget!.totalDuration).not.toBe(baseline.totalDuration);
    }
  });
});
