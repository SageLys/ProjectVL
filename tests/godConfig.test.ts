import { describe, expect, it } from 'vitest';
import { buildConfig } from '../src/config';
import { validateGodConfig } from '../src/config/godValidator';
import { validateSkillsConfig } from '../src/config/skillValidator';
import { createCardInstance } from '../src/core/createInitialState';

describe('神池构筑 C0 数据契约', () => {
  it('加载 5 个神，且 11 张旧卡都有合法神归属', () => {
    const config = buildConfig();
    const godIds = new Set(config.gods.gods.map(god => god.id));

    expect(config.gods.gods).toHaveLength(5);
    expect(config.skills.cards).toHaveLength(11);
    expect(config.skills.cards.every(card => card.god !== undefined && godIds.has(card.god))).toBe(true);
    expect(config.relics.relics.length).toBeGreaterThanOrEqual(20);
    expect(config.evolutionRecipes.recipes).toEqual([]);
    expect(config.waveRewards.floor).toHaveLength(3);
    expect(config.waveRewards.choice).toHaveLength(5);
  });

  it('拒绝卡牌引用不存在的神', () => {
    const invalid = structuredClone(buildConfig());
    invalid.skills.cards[0].god = 'missing';

    expect(() => validateGodConfig(invalid)).toThrow(/skills\.cards\[0\]\.god/);
  });

  it('拒绝神配置引用不存在的卡', () => {
    const invalid = structuredClone(buildConfig());
    invalid.gods.gods[0].variableCardIds.push('missingCard');

    expect(() => validateGodConfig(invalid)).toThrow(/不存在的卡: missingCard/);
  });

  it('拒绝 2 星进化检查点', () => {
    const invalid = structuredClone(buildConfig().skills);
    const equip = structuredClone(invalid.cards[0].stars['3'].equip);
    invalid.cards[0].evolutionTree = {
      checkpoints: [{
        star: 2,
        options: [0, 1, 2].map(index => ({
          id: `option${index}`,
          textKey: `cards.test.option${index}`,
          equip: structuredClone(equip),
        })),
      }],
      sharedNodes: [],
    };

    expect(() => validateSkillsConfig(invalid)).toThrow(/evolutionTree.*star.*只能为 3 或 5/);
  });

  it('空的新配置域按兼容层通过校验', () => {
    const compatible = structuredClone(buildConfig());
    compatible.gods.gods = [];
    compatible.relics.relics = [];
    compatible.evolutionRecipes.recipes = [];

    expect(() => validateGodConfig(compatible)).not.toThrow();
  });

  it('新建卡实例为后续进化与词条字段写入空默认值', () => {
    expect(createCardInstance(1, 'pierce', 1)).toEqual({
      id: 1,
      type: 'pierce',
      star: 1,
      evolutionPath: [],
      affixes: [],
    });
  });
});
