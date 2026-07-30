import { cfg } from '../config';
import type { GameState } from '../core/types';
import { recipeProgress } from '../core/systems/recipeEvolutionSystem';
import { cardDisplayName } from './cardMeta';

export interface RecipeGraph {
  render(state: GameState): void;
}

function recipeLabel(recipeId: string): string {
  const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === recipeId);
  return recipe
    ? `${cardDisplayName(recipe.ingredientVariable.cardId)} + ${cardDisplayName(recipe.ingredientAnchor.cardId)} → ${cardDisplayName(recipe.outputCardId)}`
    : recipeId;
}

export function createRecipeGraph(
  parent: HTMLElement,
  hooks: { onPin(recipeId: string): void },
): RecipeGraph {
  const root = document.createElement('aside');
  root.className = 'recipe-graph';
  root.hidden = true;
  parent.append(root);

  return {
    render(state): void {
      root.hidden = state.recipes.compatibleRecipeIds.length === 0;
      if (root.hidden) return;
      const compatible = new Set(state.recipes.compatibleRecipeIds);
      const anchorCounts = new Map<string, number>();
      for (const recipe of cfg.evolutionRecipes.recipes.filter(item => compatible.has(item.id))) {
        const type = recipe.ingredientAnchor.cardId;
        anchorCounts.set(type, (anchorCounts.get(type) ?? 0) + 1);
      }
      const heading = document.createElement('header');
      heading.textContent = `本局进化图谱 · ${state.recipes.completedRecipeIds.length}/${cfg.economy.evolution.maxRecipeCompletions}`;
      const list = document.createElement('div');
      list.className = 'recipe-graph-list';
      for (const [index, recipeId] of state.recipes.compatibleRecipeIds.entries()) {
        const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === recipeId);
        if (!recipe) continue;
        const [variable, anchor] = recipeProgress(state, recipeId);
        const row = document.createElement('article');
        row.className = 'recipe-graph-row';
        row.style.setProperty('--recipe-hue', String((index * 73) % 360));
        row.dataset.recipeId = recipeId;
        if (state.recipes.pinnedRecipeId === recipeId) row.classList.add('pinned');
        if (state.recipes.readyRecipeIds.includes(recipeId)) row.classList.add('ready');
        if (state.recipes.completedRecipeIds.includes(recipeId)) row.classList.add('completed');
        const label = document.createElement('strong');
        label.textContent = recipeLabel(recipeId);
        const progress = document.createElement('span');
        progress.textContent = `${variable}/16 · ${anchor}/16${state.recipes.readyRecipeIds.includes(recipeId) ? ' · 就绪' : ''}`;
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.textContent = state.recipes.pinnedRecipeId === recipeId ? '已钉选' : '钉选';
        pin.disabled = state.recipes.pinnedRecipeId === recipeId;
        pin.addEventListener('click', () => hooks.onPin(recipeId));
        row.append(label, progress, pin);
        if ((anchorCounts.get(recipe.ingredientAnchor.cardId) ?? 0) > 1) {
          const warning = document.createElement('small');
          warning.textContent = '共享锚点：用于其中一条后，另一条将无法完成';
          row.append(warning);
        }
        list.append(row);
      }
      const compendium = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '全局配方图鉴（25）';
      compendium.append(summary, ...cfg.evolutionRecipes.recipes.map(recipe => {
        const item = document.createElement('p');
        item.textContent = `${recipeLabel(recipe.id)}${compatible.has(recipe.id) ? '' : ' · 本局材料未入池'}`;
        if (!compatible.has(recipe.id)) item.className = 'unavailable';
        return item;
      }));
      root.replaceChildren(heading, list, compendium);
    },
  };
}
