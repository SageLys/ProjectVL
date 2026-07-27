// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { collectDrop, spawnGroundDrop } from '../src/core/systems/dropSystem';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import { constRng, createDefaultConfig, freshState, resetTestEnv } from './helpers';

beforeEach(() => {
  resetTestEnv();
  document.body.innerHTML = '';
});

describe('god pool telemetry', () => {
  it('records offers, selections, pools, shown cards and collected cards by god', () => {
    const state = freshState();
    state.wave = 4;
    state.godPool.mainGod = 'storm';
    state.godPool.subGods = ['winter', 'inferno'];
    state.godPool.focusGod = 'storm';
    state.godPool.rosterByGod.storm = ['pierce', 'chainLightning'];
    state.godPool.rosterByGod.winter = ['frost'];
    state.godPool.rosterByGod.inferno = ['scorch'];
    state.godPool.runRoster = ['pierce', 'chainLightning', 'frost', 'scorch'];
    state.godPool.activePool = ['pierce', 'chainLightning'];
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 3,
      getPresetName: () => 'test',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });

    telemetry.recordGameEvents([
      { type: 'godOffer', wave: 4, role: 'focus', candidates: ['storm', 'winter'] },
      { type: 'godSelected', wave: 4, role: 'focus', god: 'storm' },
      { type: 'runRosterCreated', cardTypes: [...state.godPool.runRoster] },
      {
        type: 'activePoolCreated',
        wave: 4,
        focusGod: 'storm',
        cardTypes: [...state.godPool.activePool],
      },
      { type: 'relicOffered', relicIndex: 0, options: ['proj_damage', 'neutral_calibrator'] },
      { type: 'relicSelected', relicId: 'proj_damage', rarity: 'common', god: 'storm' },
    ]);
    spawnGroundDrop(state, createDefaultConfig(), constRng(0), 10, 10, 'pierce', 1, 'normalKill');
    telemetry.beforeUpdate();
    telemetry.afterUpdate();
    telemetry.recordGameEvents(collectDrop(
      state,
      createDefaultConfig(),
      constRng(0),
      state.groundDrops[0],
    ));

    const types = telemetry.getSession().events.map(event => event.type);
    expect(types).toEqual(expect.arrayContaining([
      'god_offer',
      'god_selected',
      'run_roster_created',
      'active_pool_created',
      'card_shown_by_god',
      'card_collected_by_god',
      'relic_offered',
      'relic_selected',
    ]));
  });
});
