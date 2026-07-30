// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { AFFIX_SINKS } from '../src/config/affixSinks';
import type { CardStatKind } from '../src/config/types';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { registerSkillDefs, resolveCardBindings } from '../src/core/effects/interpreter';
import { tickEffects } from '../src/core/effects/runtime';
import { reconcileMaxHp, totalMaxHp } from '../src/core/stats';
import { applyBuildScalingToBindings } from '../src/core/systems/buildModifierSystem';
import { consumeCard, moveOrSwap } from '../src/core/systems/equipmentSystem';
import { applyRunBaseReward } from '../src/core/systems/waveRewardSystem';
import type { GameState } from '../src/core/types';
import type { DomRefs } from '../src/ui/domRefs';
import { renderHud } from '../src/ui/renderHud';
import {
  card,
  constRng,
  createDefaultConfig,
  freshState,
  resetTestEnv,
} from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
  cfg.economy.equipSwappable = true;
});
afterEach(resetTestEnv);

function maxHpState(hp: number, value = 10): GameState {
  const state = freshState();
  state.hp = hp;
  state.runBuild.cardAffixRolls.aegis = [
    { stat: 'maxHpAdd', value, consumableDuration: 5 },
  ];
  state.cards[0] = card('aegis', 3);
  return state;
}

function equipAndUnequip(state: GameState): void {
  moveOrSwap(state, config, rng, 'cards', 0, 'equipment', 0);
  moveOrSwap(state, config, rng, 'equipment', 0, 'cards', 0);
}

function textNode(): HTMLElement {
  return document.createElement('span');
}

function hudRefs(): DomRefs {
  return {
    hpText: textNode(),
    maxHpText: textNode(),
    hpBar: textNode(),
    rewardPointsText: textNode(),
    rewardThresholdText: textNode(),
    rewardBar: textNode(),
    waveText: textNode(),
    godPoolText: textNode(),
    statModifierText: null,
    damageStat: null,
    rateStat: null,
    multiStat: null,
    equipmentHint: textNode(),
    dropTelemetry: textNode(),
    cardsHint: textNode(),
  } as DomRefs;
}

describe('derived maximum HP reconciliation', () => {
  it('equips and removes maxHpAdd with totalMaxHp kept in sync', () => {
    const state = maxHpState(100, 15);

    moveOrSwap(state, config, rng, 'cards', 0, 'equipment', 0);
    expect(state.maxHp).toBe(115);
    expect(state.hp).toBe(115);
    expect(totalMaxHp(state)).toBe(115);

    moveOrSwap(state, config, rng, 'equipment', 0, 'cards', 0);
    expect(state.maxHp).toBe(100);
    expect(state.hp).toBe(100);
    expect(totalMaxHp(state)).toBe(100);
  });

  it.each([
    { label: 'full', hp: 100, equippedHp: 110, restoredHp: 100 },
    { label: 'damaged', hp: 70, equippedHp: 80, restoredHp: 70 },
    { label: 'near death', hp: 1, equippedHp: 11, restoredHp: 1 },
  ])('preserves missing HP for $label state', ({ hp, equippedHp, restoredHp }) => {
    const state = maxHpState(hp);
    moveOrSwap(state, config, rng, 'cards', 0, 'equipment', 0);
    expect(state).toMatchObject({ hp: equippedHp, maxHp: 110 });
    moveOrSwap(state, config, rng, 'equipment', 0, 'cards', 0);
    expect(state).toMatchObject({ hp: restoredHp, maxHp: 100 });
  });

  it('cannot farm healing by repeatedly equipping and removing the same affix', () => {
    const state = maxHpState(37);
    for (let i = 0; i < 8; i++) equipAndUnequip(state);
    expect(state).toMatchObject({ hp: 37, maxHp: 100 });
  });

  it('settles instant heal without a timer and expires timed maxHpAdd exactly', () => {
    const healed = freshState();
    healed.hp = 40;
    healed.runBuild.cardAffixRolls.pierce = [
      { stat: 'heal', value: 12, consumableDuration: 5 },
    ];
    healed.cards[0] = card('pierce', 1);
    consumeCard(healed, config, rng, 0, 100, 100);
    expect(healed.hp).toBe(52);
    expect(healed.statModifiers).toHaveLength(0);

    const timed = freshState();
    timed.hp = 70;
    timed.runBuild.cardAffixRolls.pierce = [
      { stat: 'maxHpAdd', value: 10, consumableDuration: 5 },
    ];
    timed.cards[0] = card('pierce', 1);
    consumeCard(timed, config, rng, 0, 100, 100);
    expect(timed).toMatchObject({ hp: 80, maxHp: 110 });
    expect(timed.statModifiers).toContainEqual(expect.objectContaining({
      stat: 'maxHpAdd', operation: 'add', value: 10, remaining: 5,
    }));

    tickEffects(timed, config, rng, 5);
    expect(timed).toMatchObject({ hp: 70, maxHp: 100 });
    expect(timed.statModifiers).toHaveLength(0);
  });

  it('stacks permanent rewards with derived equipment without double counting', () => {
    const state = maxHpState(70);
    moveOrSwap(state, config, rng, 'cards', 0, 'equipment', 0);
    applyRunBaseReward(state, { stat: 'maxHpAdd', add: 20 });

    expect(state.baseMaxHp).toBe(120);
    expect(totalMaxHp(state)).toBe(130);
    expect(state).toMatchObject({ hp: 100, maxHp: 130 });

    moveOrSwap(state, config, rng, 'equipment', 0, 'cards', 0);
    expect(state).toMatchObject({ baseMaxHp: 120, hp: 90, maxHp: 120 });
  });

  it('uses the playing floor when a maximum reduction exceeds current HP', () => {
    const state = maxHpState(1, 50);
    state.equipment[0] = state.cards[0];
    state.cards[0] = null;
    reconcileMaxHp(state);
    state.hp = 1;
    state.equipment[0] = null;
    reconcileMaxHp(state);
    expect(state).toMatchObject({ hp: 1, maxHp: 100 });
  });
});

describe('affix contracts, discrete scaling and HUD', () => {
  it('declares settlement for every CardStatKind and validates all formal pools', () => {
    const allStats: CardStatKind[] = [
      'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
      'effectDamageMul', 'quantityAdd', 'controlPotencyMul', 'controlledDamageTakenMul',
      'areaScaleMul', 'dotDamageMul', 'defenseDurabilityMul', 'retaliationMul',
      'dropRateMul', 'dropLifetimeMul', 'xpMul',
    ];
    expect(Object.keys(AFFIX_SINKS).sort()).toEqual([...allStats].sort());
    expect(() => validateSkillsConfig(structuredClone(cfg.skills))).not.toThrow();
  });

  it('rejects unsupported equipment heal and card-scoped affixes without a sink', () => {
    const heal = structuredClone(cfg.skills) as any;
    heal.cards[0].affixPool.candidates[0].stat = 'heal';
    expect(() => validateSkillsConfig(heal)).toThrow(/heal.*does not support persistent equipment/);

    const missing = structuredClone(cfg.skills) as any;
    const overcharge = missing.cards.find((item: any) => item.id === 'overcharge');
    overcharge.affixPool.candidates[0].stat = 'xpMul';
    expect(() => validateSkillsConfig(missing)).toThrow(/xpMul.*no reachable equipment/);
  });

  it('makes the minimum defenseDurabilityMul roll the source-table two-hit shield up to three', () => {
    const state = freshState();
    state.runBuild.cardAffixRolls.aegis = [
      { stat: 'defenseDurabilityMul', value: 0.1, consumableDuration: 5 },
    ];
    state.equipment[0] = card('aegis', 3);
    const def = cfg.skills.cards.find(item => item.id === 'aegis')!;
    const raw = resolveCardBindings(def, state.equipment[0]!.evolutionPath ?? [], 3);
    const scaled = applyBuildScalingToBindings(state, def, structuredClone(raw), 'aegis');
    const shield = scaled.flatMap(binding => binding.effects).find(effect => effect.atom === 'shield');
    expect(shield?.params?.absorbHits).toBe(3);
  });

  it('renders current and maximum HP together', () => {
    const state = freshState();
    state.hp = 73.4;
    state.baseMaxHp = 125;
    reconcileMaxHp(state);
    state.hp = 73.4;
    const refs = hudRefs();
    renderHud(refs, state, config);
    expect(refs.hpText.textContent).toBe('73');
    expect(refs.maxHpText.textContent).toBe('125');
    expect(refs.hpBar.style.width).toBe(`${(73.4 / 125) * 100}%`);
  });
});
