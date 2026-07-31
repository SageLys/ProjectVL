import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { GodId } from '../src/config/types';

function combinations<T>(values: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), count - 1).map(rest => [value, ...rest]));
}

describe('25-recipe roster topology reachability', () => {
  it('exhaustively matches the approved 7,500-state distribution', () => {
    const gods = cfg.gods.gods;
    const distribution = new Map<number, number>();
    const recipeHits = new Map(cfg.evolutionRecipes.recipes.map(recipe => [recipe.id, 0]));
    let states = 0;
    let withCross = 0;
    let withSame = 0;
    let withBoth = 0;
    let recoveryFallbacks = 0;

    for (const main of gods) {
      const otherGodPairs = combinations(gods.filter(god => god.id !== main.id), 2);
      for (const subGods of otherGodPairs) {
        for (const mainVariables of combinations(main.variableCardIds, 3)) {
          for (const firstSubVariable of subGods[0].variableCardIds) {
            for (const secondSubVariable of subGods[1].variableCardIds) {
              states++;
              const selectedGods = new Set<GodId>([main.id, subGods[0].id, subGods[1].id]);
              const roster = new Set([
                ...main.anchorCardIds,
                ...mainVariables,
                ...subGods[0].anchorCardIds,
                firstSubVariable,
                ...subGods[1].anchorCardIds,
                secondSubVariable,
              ]);
              const recipes = cfg.evolutionRecipes.recipes.filter(recipe =>
                roster.has(recipe.ingredientVariable.cardId)
                && roster.has(recipe.ingredientAnchor.cardId));
              if (!recipes.length) recoveryFallbacks++;
              distribution.set(recipes.length, (distribution.get(recipes.length) ?? 0) + 1);
              for (const recipe of recipes) recipeHits.set(recipe.id, (recipeHits.get(recipe.id) ?? 0) + 1);
              const cross = recipes.some(recipe => recipe.recipeType === 'crossGod');
              const same = recipes.some(recipe => recipe.recipeType === 'sameGod');
              if (cross) withCross++;
              if (same) withSame++;
              if (cross && same) withBoth++;

              // Every compatible recipe remains inside the three selected gods.
              expect(recipes.every(recipe =>
                selectedGods.has(recipe.variableGod) && selectedGods.has(recipe.anchorGod))).toBe(true);
            }
          }
        }
      }
    }

    expect(states).toBe(7_500);
    expect(recoveryFallbacks).toBe(0);
    expect(Object.fromEntries(distribution)).toEqual({ 1: 360, 2: 1800, 3: 3090, 4: 1980, 5: 270 });
    expect([...distribution].reduce((sum, [count, occurrences]) => sum + count * occurrences, 0) / states).toBe(3);
    expect(withCross / states).toBeCloseTo(0.964, 10);
    expect(withSame / states).toBeCloseTo(0.744, 10);
    expect(withBoth / states).toBeCloseTo(0.708, 10);

    for (const recipe of cfg.evolutionRecipes.recipes) {
      const expected = recipe.recipeType === 'sameGod' ? 1500 : 750;
      expect(recipeHits.get(recipe.id), recipe.id).toBe(expected);
    }
  });
});
