import { describe, expect, it } from 'vitest';
import { buildCardDetailViewModel } from '../src/ui/cardDetailModel';

describe('card detail view model', () => {
  it('uses resolved current effects and marks the selected 3★/5★ routes', () => {
    const model = buildCardDetailViewModel({
      id: 10,
      type: 'chainLightning',
      star: 5,
      evolutionPath: ['3:chainLightningA', '5:chainLightningB2'],
    }, 'cards');
    expect(model.consume.blocks[0].lines.length).toBeGreaterThan(0);
    expect(model.equip.blocks.length).toBeGreaterThan(1);
    expect(model.currentRoute).toContain('长链');
    const node3 = model.tree.nodes.find(node => node.star === 3);
    const node5 = model.tree.nodes.find(node => node.star === 5);
    const node6 = model.tree.nodes.find(node => node.star === 6);
    expect(node3?.options?.find(option => option.id === 'chainLightningA')?.selected).toBe(true);
    expect(node5?.options?.find(option => option.id === 'chainLightningB2')?.selected).toBe(true);
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

  it('renders recipe-only cards as recipes instead of a normal tree', () => {
    const model = buildCardDetailViewModel({ id: 12, type: 'frozenThunder', star: 6 }, 'equipment');
    expect(model.tree.nodes).toHaveLength(0);
    expect(model.tree.recipe?.notice).toContain('不可通过普通合成');
    expect(model.tree.recipe?.ingredientA).toContain('≥5★');
  });
});
