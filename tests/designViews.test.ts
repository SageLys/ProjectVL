import skillsJson from '../src/config/base/skills.json';
import godsJson from '../src/config/base/gods.json';
import recipesJson from '../src/config/base/evolutionRecipes.json';
import textsJson from '../src/data/texts.json';
import type { EvolutionRecipesConfig, GodsConfig, SkillsConfig } from '../src/config/types';
import { analyzeAtomUsage, countAllEffectInstances } from '../src/design/crossViews/atomUsage';
import { analyzeCopyCompleteness, COPY_COLUMNS } from '../src/design/crossViews/copyCompleteness';
import { analyzeBranchHomogeneity } from '../src/design/crossViews/homogeneity';
import type { DescribeContext } from '../src/design/describe';

const skills = skillsJson as unknown as SkillsConfig;
const texts = textsJson as unknown as Record<string, unknown>;
const ctx: DescribeContext = {
  texts,
  gods: godsJson as unknown as GodsConfig,
  recipes: recipesJson as unknown as EvolutionRecipesConfig,
};

describe('design cross-view analysis', () => {
  it('finds no copied branch summaries after the v4 full rewrite', () => {
    const entries = analyzeBranchHomogeneity(skills.cards, ctx);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some(entry => entry.sameSummary)).toBe(false);
  });

  it('keeps the copy matrix dimensions aligned with the card library', () => {
    const rows = analyzeCopyCompleteness(skills.cards, texts);
    expect(rows).toHaveLength(skills.cards.length);
    expect(rows.every(row => row.cells.length === COPY_COLUMNS.length)).toBe(true);
    expect(rows.flatMap(row => row.cells).some(cell => cell.status === 'placeholder')).toBe(true);
  });

  it('counts every top-level and nested effect instance exactly once', () => {
    const usage = analyzeAtomUsage(skills.cards);
    expect(usage.reduce((sum, row) => sum + row.instanceCount, 0)).toBe(countAllEffectInstances(skills.cards));
  });
});
