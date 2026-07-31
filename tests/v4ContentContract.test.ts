import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { ATOM_NAMES, nestedEffectsOf } from '../src/core/effects/atomContract';
import type { EffectDef } from '../src/core/effects/defs';
import { resolveCardBindings, resolveConsumableTier } from '../src/core/effects/interpreter';
import { texts } from '../src/data';

const OLD_PRODUCTS = [
  'frozenThunder', 'solarLance', 'avalanche',
  'pyrestorm', 'crownOfThorns', 'goldenIdol',
];

function walk(effects: readonly EffectDef[]): EffectDef[] {
  return effects.flatMap(effect => {
    const nested = nestedEffectsOf(effect) as EffectDef[];
    const fanout = (effect as EffectDef & { forEach?: { effects?: EffectDef[] } }).forEach?.effects ?? [];
    return [effect, ...walk([...nested, ...fanout])];
  });
}

function baseCard(id: string) {
  const card = cfg.skills.cards.find(item => item.id === id && !item.recipeOnly);
  expect(card, id).toBeDefined();
  return card!;
}

function branch(cardId: string, star: 3 | 5, optionId: string) {
  const checkpoint = baseCard(cardId).evolutionTree!.checkpoints.find(item => item.star === star);
  const option = checkpoint?.options.find(item => item.id === optionId);
  expect(option, `${cardId}:${star}:${optionId}`).toBeDefined();
  return option!;
}

function effectParams(cardId: string, star: 3 | 5, optionId: string, atom: string) {
  const effect = branch(cardId, star, optionId).equip
    .flatMap(binding => walk(binding.effects))
    .find(item => item.atom === atom);
  expect(effect, `${cardId}:${star}:${optionId}:${atom}`).toBeDefined();
  return effect!.params as Record<string, unknown>;
}

describe('v4 full-card matrix contract', () => {
  it('loads exactly 35 base cards plus 25 formal recipe products and rejects every retired product', () => {
    const base = cfg.skills.cards.filter(card => !card.recipeOnly);
    const products = cfg.skills.cards.filter(card => card.recipeOnly);
    expect(base).toHaveLength(35);
    expect(products).toHaveLength(25);
    expect(cfg.evolutionRecipes.recipes).toHaveLength(25);
    expect(cfg.skills.cards.some(card => OLD_PRODUCTS.includes(card.id))).toBe(false);
    expect(cfg.evolutionRecipes.recipes.some(recipe => OLD_PRODUCTS.includes(recipe.id))).toBe(false);
  });

  it('passes the hard V1–V14 content rules and the complete 25-recipe graph validator', () => {
    expect(() => validateSkillsConfig(cfg.skills)).not.toThrow();
    expect(() => validateGodConfig(cfg)).not.toThrow();
  });

  it('gives every base card a complete 3/4/5/6 tree and three distinct interface roles', () => {
    for (const card of cfg.skills.cards.filter(item => !item.recipeOnly)) {
      expect(card.identityContract.trim(), card.id).not.toBe('');
      expect(card.evolutionTree?.checkpoints.map(point => [point.star, point.options.length]), card.id)
        .toEqual([[3, 3], [5, 3]]);
      expect(card.evolutionTree?.sharedNodes.map(node => node.star), card.id).toEqual([4, 6]);
      const five = card.evolutionTree!.checkpoints.find(point => point.star === 5)!;
      expect(five.options.map(option => option.interfaceRole).sort(), card.id)
        .toEqual(['convert', 'payoff', 'spread']);
      const cardText = (texts.evolution as unknown as Record<string, Record<string, { summary?: string }>>)[card.id];
      const summaries = five.options.map(option => cardText?.[option.id]?.summary?.trim());
      expect(summaries.every(Boolean), card.id).toBe(true);
      expect(new Set(summaries).size, card.id).toBe(3);
    }
  });

  it('resolves all nine branch combinations and every consumable star without unknown atoms', () => {
    const known = new Set<string>(ATOM_NAMES);
    for (const card of cfg.skills.cards.filter(item => !item.recipeOnly)) {
      const three = card.evolutionTree!.checkpoints.find(point => point.star === 3)!.options;
      const five = card.evolutionTree!.checkpoints.find(point => point.star === 5)!.options;
      for (const left of three) for (const right of five) {
        const path = [`3:${left.id}`, `5:${right.id}`];
        for (const star of [5, 6]) {
          const effects = resolveCardBindings(card, path, star).flatMap(binding => walk(binding.effects));
          expect(effects.length, `${card.id} ${path.join('/')} ${star}★`).toBeGreaterThan(0);
          expect(effects.every(effect => known.has(effect.atom)), card.id).toBe(true);
        }
      }
      for (let star = 1; star <= 6; star++) {
        expect(resolveConsumableTier(card, star).effects.length, `${card.id} ${star}★ consume`).toBeGreaterThan(0);
      }
    }
  });

  it('binds every output to one formal, distinct recipe payload with complete copy', () => {
    const expected: Record<string, string[]> = {
      stormLattice: ['pierce', 'groundZone', 'chain'], glacialEpoch: ['groundZone', 'freeze', 'knockback'],
      volcanoCore: ['groundZone', 'mortarMorph', 'charge'], aegisCitadel: ['summon', 'breachReduction'],
      goldenGrove: ['summon', 'summonBuff', 'extraDrop'], thunderRime: ['aura', 'burstDamage', 'freeze'],
      emberSpark: ['dot', 'chain', 'groundZone'], voltBastion: ['shield', 'charge', 'aura'],
      ampereFlow: ['dropRateMul', 'vulnerable', 'extraDrop'], rimeShell: ['freeze', 'split', 'dot'],
      tombSpire: ['thorns', 'summon', 'freeze'], stasisLedger: ['mergePulse', 'slow', 'extraDrop'],
      emberMoat: ['shield', 'aura', 'novaOnBreak'], emberYield: ['dot', 'extraDrop', 'statBuff'],
      rootLoom: ['mergePulse', 'summon', 'summonBuff'], crystalRelay: ['chain', 'summon', 'slow'],
      solarPiercer: ['pierce', 'groundZone', 'dot'], pylonCircuit: ['summon', 'chain', 'vulnerable'],
      midasChain: ['chain', 'extraDrop'], steamBurst: ['aura', 'dot', 'knockback'],
      glacialEffigy: ['mortarMorph', 'summon', 'freeze'], frostDew: ['aura', 'restore', 'extraDrop'],
      wrathMortar: ['charge', 'mortarMorph', 'groundZone'], pyreBrand: ['dot', 'focusPriority', 'burstDamage'],
      fortuneThorns: ['thorns', 'charge', 'extraDrop'],
    };
    const referenceCount = new Map<string, number>();
    const fingerprints = new Set<string>();
    for (const recipe of cfg.evolutionRecipes.recipes) {
      referenceCount.set(recipe.outputCardId, (referenceCount.get(recipe.outputCardId) ?? 0) + 1);
    }
    for (const product of cfg.skills.cards.filter(card => card.recipeOnly)) {
      expect(Object.keys(product.stars), product.id).toEqual(['6']);
      expect(product.evolutionTree, product.id).toBeUndefined();
      expect(product.primaryGod, product.id).toBeTruthy();
      expect(product.sourceGods?.length, product.id).toBeGreaterThanOrEqual(1);
      expect(referenceCount.get(product.id), product.id).toBe(1);
      const atoms = new Set<string>(product.stars['6'].equip.flatMap(binding => walk(binding.effects)).map(effect => effect.atom));
      for (const atom of expected[product.id]) expect(atoms.has(atom), `${product.id}:${atom}`).toBe(true);
      const fingerprint = JSON.stringify(product.stars['6'].equip);
      expect(fingerprints.has(fingerprint), product.id).toBe(false);
      fingerprints.add(fingerprint);
      expect(product.affixPool?.count, product.id).toBe(2);
      expect(product.consumable.anchors['1'], product.id).toEqual(product.consumable.anchors['6']);
      const playerCopy = (texts.cards as Record<string, unknown>)[product.id];
      expect(`${JSON.stringify(product)}${JSON.stringify(playerCopy)}`, product.id).not.toMatch(/灰盒|占位|B0/);
    }
  });

  it('preserves explicit source-table carrier values, timers, and consumable anchors', () => {
    expect(effectParams('aegis', 3, 'aegisA', 'shield')).toMatchObject({ absorbHits: 2 });
    expect(effectParams('aegis', 3, 'aegisB', 'shield')).toMatchObject({ absorbHits: 1, regenSeconds: 8 });
    expect(branch('aegis', 3, 'aegisC').equip[0].triggerParams).toMatchObject({ seconds: 9 });

    expect(branch('chainLightning', 3, 'chainLightningC').equip[0].triggerParams)
      .toMatchObject({ seconds: 2.2 });
    expect(effectParams('chainLightning', 3, 'chainLightningC', 'chain'))
      .toMatchObject({ targets: 3 });
    expect(branch('chainLightning', 5, 'chainLightning3x').equip[0].triggerParams)
      .toMatchObject({ requiresStatus: 'vulnerable', cooldownSeconds: 1.5 });

    const chainSix = baseCard('chainLightning').evolutionTree!.sharedNodes.find(node => node.star === 6)!;
    const chainSixEquip = chainSix.equip!;
    expect(chainSixEquip[0].triggerParams).toMatchObject({ seconds: 1.2 });
    expect(chainSixEquip[0].effects).toEqual([
      expect.objectContaining({ atom: 'chain', params: expect.objectContaining({ targets: 3 }) }),
    ]);

    expect(effectParams('arcSplitter', 3, 'arcSplitterA', 'split')).toMatchObject({ count: 2 });
    expect(effectParams('arcSplitter', 3, 'arcSplitterB', 'split')).toMatchObject({ count: 4 });
    expect(effectParams('frost', 3, 'frostC', 'freeze')).toMatchObject({ stacksToTrigger: 3 });
    expect(branch('frost', 3, 'frostC').equip[0].triggerParams).toMatchObject({ seconds: 2.5 });

    const chainConsume = baseCard('chainLightning').consumable.anchors;
    expect([chainConsume['1'].radius, chainConsume['3'].radius, chainConsume['6'].radius])
      .toEqual([120, 140, 160]);
    expect([
      (chainConsume['1'].effects[0].params as Record<string, unknown>)?.bounces,
      (chainConsume['3'].effects[0].params as Record<string, unknown>)?.bounces,
      (chainConsume['6'].effects[0].params as Record<string, unknown>)?.bounces,
    ]).toEqual([4, 7, 12]);

    const aegisConsume = baseCard('aegis').consumable.anchors;
    expect([
      (aegisConsume['1'].effects[0].params as Record<string, unknown>)?.absorbHits,
      (aegisConsume['3'].effects[0].params as Record<string, unknown>)?.absorbHits,
      (aegisConsume['6'].effects[0].params as Record<string, unknown>)?.absorbHits,
    ]).toEqual([2, 4, 6]);
  });
});
