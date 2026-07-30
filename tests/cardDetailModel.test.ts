import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { buildCardDetailViewModel } from '../src/ui/cardDetailModel';

describe('card detail view model', () => {
  it('uses resolved current effects and marks the selected 3★/5★ routes', () => {
    const model = buildCardDetailViewModel({
      id: 10,
      type: 'chainLightning',
      star: 5,
      evolutionPath: ['3:chainLightningA', '5:chainLightning2x'],
    }, 'cards');
    expect(model.consume.blocks[0].lines.length).toBeGreaterThan(0);
    expect(model.equip.blocks.length).toBeGreaterThan(0);
    expect(model.currentRoute).toContain('链弧');
    const node3 = model.tree.nodes.find(node => node.star === 3);
    const node5 = model.tree.nodes.find(node => node.star === 5);
    const node6 = model.tree.nodes.find(node => node.star === 6);
    expect(node3?.options?.find(option => option.id === 'chainLightningA')?.selected).toBe(true);
    expect(node5?.options?.find(option => option.id === 'chainLightning2x')?.selected).toBe(true);
    expect(node6?.locked).toBe(true);
  });

  it('explains unsupported instant and scoped timed affixes separately', () => {
    const model = buildCardDetailViewModel({
      id: 11,
      type: 'chainLightning',
      star: 3,
      evolutionPath: ['3:chainLightningA'],
      affixes: [
        { stat: 'heal', value: 10, consumableDuration: 0 },
        { stat: 'effectDamageMul', value: 0.1, consumableDuration: 5 },
      ],
    }, 'equipment');
    expect(model.affixes[0].equipment).toContain('不生效');
    expect(model.affixes[0].consumable).toContain('立即结算');
    expect(model.affixes[1].equipment).toContain('只提高这张卡');
    expect(model.affixes[1].consumable).toContain('持续 5 秒');
  });

  it('renders recipe-only cards as an accurate terminal form without a material formula', () => {
    const model = buildCardDetailViewModel({ id: 12, type: 'stormLattice', star: 6 }, 'equipment');
    expect(model.currentRoute).toBe('终极形态');
    expect(model.tree.nodes).toHaveLength(1);
    expect(model.tree.nodes[0].label).toBe('终极形态效果');
    expect(model.tree.nodes[0].exactEffects?.length).toBeGreaterThan(0);
  });

  it('does not expose partner or output recipes from ordinary card details', () => {
    expect(cfg.evolutionRecipes.recipes).toHaveLength(25);
    for (const recipe of cfg.evolutionRecipes.recipes) {
      const model = buildCardDetailViewModel({ id: 100, type: recipe.ingredientVariable.cardId, star: 1 }, 'cards');
      expect(JSON.stringify(model.tree)).not.toContain(recipe.ingredientAnchor.cardId);
      expect(JSON.stringify(model.tree)).not.toContain(recipe.outputCardId);
    }
  });
});
