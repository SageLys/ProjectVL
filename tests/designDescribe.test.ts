import skillsJson from '../src/config/base/skills.json';
import godsJson from '../src/config/base/gods.json';
import recipesJson from '../src/config/base/evolutionRecipes.json';
import textsJson from '../src/data/texts.json';
import { ATOM_CONTRACT, ATOM_NAMES } from '../src/core/effects/atomContract';
import type { EffectDef } from '../src/core/effects/defs';
import type { EvolutionRecipesConfig, GodsConfig, SkillsConfig } from '../src/config/types';
import { describeCard, describeEffect, type DescribeContext } from '../src/design/describe';

const skills = skillsJson as unknown as SkillsConfig;
const ctx: DescribeContext = {
  texts: textsJson as unknown as Record<string, unknown>,
  gods: godsJson as unknown as GodsConfig,
  recipes: recipesJson as unknown as EvolutionRecipesConfig,
};

describe('design describe layer', () => {
  it('recursively separates nested effects from ordinary params', () => {
    const view = describeEffect({
      atom: 'groundZone',
      params: {
        radius: 80,
        effects: [{ atom: 'dot', params: { damageRatio: 0.2, duration: 3 } }],
      },
    });

    expect(view.nested).toHaveLength(1);
    expect(view.nested[0].label).toBe('灼烧');
    expect(view.params.some(param => param.key === 'effects')).toBe(false);
    expect(view.params.find(param => param.key === 'radius')?.value).toBe('80');
  });

  it('describes the full checkpoint and shared-node route for chainLightning', () => {
    const card = skills.cards.find(item => item.id === 'chainLightning');
    expect(card).toBeTruthy();
    const view = describeCard(card!, ctx);

    expect(view.tiers.find(tier => tier.star === 3)?.options).toHaveLength(3);
    expect(view.tiers.find(tier => tier.star === 5)?.options).toHaveLength(3);
    expect(view.tiers.find(tier => tier.star === 4)?.kind).toBe('amplify');
    expect(view.tiers.find(tier => tier.star === 6)?.kind).toBe('shared');
    expect(view.tiers.find(tier => tier.star === 3)?.activeBindings?.length).toBeGreaterThan(0);
  });

  it('branches recipeOnly cards into one fixed 6-star tier with recipe provenance', () => {
    const recipe = recipesJson.recipes[0];
    const card = skills.cards.find(item => item.id === recipe.outputCardId);
    expect(card).toBeTruthy();
    const view = describeCard(card!, ctx);

    expect(view.tiers).toHaveLength(1);
    expect(view.tiers[0]).toMatchObject({ star: 6, kind: 'fixed', options: [] });
    expect(view.tiers.some(tier => tier.kind === 'checkpoint')).toBe(false);
    expect(view.recipe).toMatchObject({ id: recipe.id, outputStar: 6 });
  });

  it('describes every atom contract entry without throwing or losing its label', () => {
    for (const atom of ATOM_NAMES) {
      const params = Object.fromEntries(Object.entries(ATOM_CONTRACT[atom].params)
        .flatMap(([key, spec]) => spec.default === undefined ? [] : [[key, spec.default]]));
      const effect = { atom, params } as EffectDef;
      expect(() => describeEffect(effect), atom).not.toThrow();
      expect(describeEffect(effect).label, atom).toBeTruthy();
      expect(describeEffect(effect).label, `${atom} 应由 labels.ts 翻成中文`).not.toBe(atom);
    }
  });
});
