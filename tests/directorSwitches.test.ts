import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { createDefaultConfig } from '../src/core/createInitialState';
import { resolveActiveWavePlan, resolveWavePlan } from '../src/core/runStage';
import { rollDropOnKill, tickOrdinaryDropBudget } from '../src/core/systems/dropSystem';
import { constRng, enemy, freshState, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('wave-stage and ordinary-drop switches', () => {
  it('keeps time-based drop credit active when only the stage director is disabled', () => {
    cfg.waves.stagePlan.enabled = false;
    cfg.economy.ordinaryDropRate.enabled = true;
    const state = freshState();
    state.wave = 1;

    const plan = resolveActiveWavePlan(cfg, 1);
    expect(plan.quota).toBe(cfg.waves.budget.waveQuota.base + cfg.waves.budget.waveQuota.perWave);

    tickOrdinaryDropBudget(state, 1);
    expect(state.ordinaryDrop.credit).toBeGreaterThan(0);
  });

  it('keeps the stage director active when ordinary drops use legacy chance rolls', () => {
    cfg.waves.stagePlan.enabled = true;
    cfg.economy.ordinaryDropRate.enabled = false;
    const state = freshState();
    state.wave = 1;
    const runtime = createDefaultConfig();
    runtime.dropChance = 1;

    expect(resolveActiveWavePlan(cfg, 1)).toEqual(resolveWavePlan(1, cfg.waves.totalWaves, cfg.waves.stagePlan));

    rollDropOnKill(state, runtime, constRng(0), enemy());
    expect(state.groundDrops).toHaveLength(1);
    expect(state.ordinaryDrop.credit).toBe(0);
  });
});
