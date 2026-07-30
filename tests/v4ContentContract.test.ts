import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { ATOM_NAMES } from '../src/core/effects/atomContract';
import type { EffectDef } from '../src/core/effects/defs';
import { resolveCardBindings, resolveConsumableTier } from '../src/core/effects/interpreter';
import { texts } from '../src/data';

const OLD_PRODUCTS = [
  'frozenThunder', 'solarLance', 'avalanche',
  'pyrestorm', 'crownOfThorns', 'goldenIdol',
];

function walk(effects: readonly EffectDef[]): EffectDef[] {
  return effects.flatMap(effect => {
    const nested = (effect.params as Record<string, unknown> | undefined)?.effects;
    return [effect, ...(Array.isArray(nested) ? walk(nested as EffectDef[]) : [])];
  });
}

describe('v4 full-card matrix contract', () => {
  it('loads exactly 35 base cards plus 25 B0 recipe products and rejects every retired product', () => {
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

  it('binds each B0 output to one recipe and only the approved graybox payload', () => {
    const referenceCount = new Map<string, number>();
    for (const recipe of cfg.evolutionRecipes.recipes) {
      referenceCount.set(recipe.outputCardId, (referenceCount.get(recipe.outputCardId) ?? 0) + 1);
    }
    for (const product of cfg.skills.cards.filter(card => card.recipeOnly)) {
      expect(Object.keys(product.stars), product.id).toEqual(['6']);
      expect(product.evolutionTree, product.id).toBeUndefined();
      expect(product.primaryGod, product.id).toBeTruthy();
      expect(product.sourceGods?.length, product.id).toBeGreaterThanOrEqual(1);
      expect(referenceCount.get(product.id), product.id).toBe(1);
      expect(product.stars['6'].equip, product.id).toEqual([
        expect.objectContaining({
          trigger: 'interval',
          triggerParams: { seconds: 2.5 },
          effects: [expect.objectContaining({ atom: 'burstDamage' })],
        }),
        expect.objectContaining({
          trigger: 'passive',
          effects: [expect.objectContaining({ atom: 'statBuff' })],
        }),
      ]);
    }
  });
});
