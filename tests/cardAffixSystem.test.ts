// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs } from '../src/core/effects/interpreter';
import { tickEffects } from '../src/core/effects/runtime';
import { totalDamage, totalFireRate } from '../src/core/stats';
import {
  createCardWithAffixes,
  ensureAffixTemplate,
} from '../src/core/systems/cardAffixSystem';
import { autoMergeCards } from '../src/core/systems/cardSystem';
import { consumeCard } from '../src/core/systems/equipmentSystem';
import { createDevTelemetry } from '../src/telemetry/devTelemetry';
import { createCardElement } from '../src/ui/slotFactory';
import { card, createDefaultConfig, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();

function seededRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
  document.body.innerHTML = '';
});
afterEach(resetTestEnv);

describe('run-scoped card affix templates', () => {
  it('shares one copied template per card type and reproduces fixed seeds', () => {
    const first = freshState();
    const firstRng = seededRng(42);
    const firstCreated = createCardWithAffixes(first, firstRng, 'pierce', 1);
    const secondCreated = createCardWithAffixes(first, firstRng, 'pierce', 2);
    const a = firstCreated.card;
    const b = secondCreated.card;
    expect(a.affixes).toEqual(b.affixes);
    expect(a.affixes).not.toBe(b.affixes);
    expect(firstCreated.events).toHaveLength(1);
    expect(secondCreated.events).toHaveLength(0);

    const replay = freshState();
    const changed = freshState();
    expect(ensureAffixTemplate(replay, seededRng(42), 'pierce')).toEqual(a.affixes);
    expect(ensureAffixTemplate(changed, seededRng(43), 'pierce')).not.toEqual(a.affixes);
  });

  it('rolls unique candidates within configured ranges on exact steps', () => {
    const state = freshState();
    const rolls = ensureAffixTemplate(state, seededRng(7), 'frost');
    const pool = cfg.skills.cards.find(def => def.id === 'frost')!.affixPool!;
    expect(rolls).toHaveLength(pool.count);
    expect(new Set(rolls.map(roll => roll.stat)).size).toBe(rolls.length);
    for (const roll of rolls) {
      const candidate = pool.candidates.find(item => item.stat === roll.stat)!;
      expect(candidate).toBeDefined();
      expect(roll.value).toBeGreaterThanOrEqual(candidate.min);
      expect(roll.value).toBeLessThanOrEqual(candidate.max);
      expect((roll.value - candidate.min) / candidate.step).toBeCloseTo(
        Math.round((roll.value - candidate.min) / candidate.step),
      );
    }
  });

  it('applies equipped add affixes immediately and removes them with the equipment', () => {
    const state = freshState();
    state.runBuild.cardAffixRolls.pierce = [
      { stat: 'damageAdd', value: 2, consumableDuration: 5 },
      { stat: 'fireRateAdd', value: 0.2, consumableDuration: 5 },
    ];
    state.equipment[0] = card('pierce', 3);

    expect(totalDamage(state, config)).toBe(config.damage + 2);
    expect(totalFireRate(state, config)).toBeCloseTo(config.fireRate + 0.2);
    state.equipment[0] = null;
    expect(totalDamage(state, config)).toBe(config.damage);
    expect(totalFireRate(state, config)).toBe(config.fireRate);
  });

  it('turns consumed affixes into expiring global modifiers without conflicting with equipment', () => {
    const state = freshState();
    state.runBuild.cardAffixRolls.pierce = [
      { stat: 'damageAdd', value: 2, consumableDuration: 5 },
      { stat: 'effectDamageMul', value: 0.1, consumableDuration: 5 },
    ];
    state.runBuild.cardAffixRolls.frost = [
      { stat: 'damageAdd', value: 1, consumableDuration: 5 },
    ];
    state.cards[0] = card('pierce', 1);
    state.equipment[0] = card('frost', 3);

    expect(totalDamage(state, config)).toBe(config.damage + 1);
    consumeCard(state, config, seededRng(1), 0, 100, 100);
    expect(state.statModifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'affix:pierce', stat: 'damageAdd', operation: 'add', value: 2, remaining: 5 }),
      expect.objectContaining({ sourceId: 'affix:pierce', stat: 'effectDamageMul', operation: 'mul', value: 1.1, remaining: 5 }),
    ]));
    expect(totalDamage(state, config)).toBe(config.damage + 3);

    tickEffects(state, config, seededRng(1), 5);
    expect(state.statModifiers).toHaveLength(0);
    expect(totalDamage(state, config)).toBe(config.damage + 1);
  });

  it('keeps the run template through automatic 2★ + 2★ merging', () => {
    const state = freshState();
    const rng = seededRng(3);
    const first = createCardWithAffixes(state, rng, 'pierce', 2).card;
    const second = createCardWithAffixes(state, rng, 'pierce', 2).card;
    state.cards[0] = first;
    state.cards[1] = second;
    const template = structuredClone(first.affixes);

    autoMergeCards(state, config, rng);
    const result = state.cards.find(item => item?.type === 'pierce');
    expect(result).toMatchObject({ star: 3 });
    expect(result?.affixes).toEqual(template);
    expect(state.runBuild.cardAffixRolls.pierce).toEqual(template);
  });

  it('emits one affix_rolled telemetry entry per rolled stat and renders compact affix rows', () => {
    const state = freshState();
    const created = createCardWithAffixes(state, seededRng(12), 'pierce', 1);
    const telemetry = createDevTelemetry({
      getState: () => state,
      getConfig: () => cfg,
      getSeed: () => 12,
      getPresetName: () => 'test',
      getRange: () => 100,
      getDifficultyId: () => state.difficultyId,
    });
    telemetry.recordGameEvents(created.events);

    const rolled = telemetry.getSession().events.filter(event => event.type === 'affix_rolled');
    expect(rolled).toHaveLength(created.card.affixes!.length);
    expect(rolled.every(event => event.cardType === 'pierce'
      && event.affixStat !== undefined
      && event.affixValue !== undefined)).toBe(true);

    const element = createCardElement(created.card, 'cards', 0, { dragStart() {} });
    expect(element.querySelector('.card-skill-section')).toBeNull();
    expect(element.querySelector('.card-affix-section')).toBeNull();
    expect(element.querySelector('.card-affix-compact')).not.toBeNull();
    expect(element.querySelectorAll('.card-affix')).toHaveLength(Math.min(2, created.card.affixes!.length));
  });
});
