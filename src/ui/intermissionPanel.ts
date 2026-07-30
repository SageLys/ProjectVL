import { cfg } from '../config';
import type { CardType, GameState } from '../core/types';
import { texts } from '../data';
import type { RunBaseStatKind } from '../config/types';
import { cardDisplayName } from './cardMeta';

export interface IntermissionPanel {
  render(state: GameState): void;
}

function commitment(state: GameState, cardType: CardType): number {
  return Math.min(16, [...state.cards, ...state.equipment]
    .filter(card => card?.type === cardType && !card.provisional)
    .reduce((sum, card) => sum + 2 ** ((card?.star ?? 1) - 1), 0));
}

/** Wave intermission is display-only for recipes; execution exists exclusively on card-to-card drag. */
export function createIntermissionPanel(
  arena: HTMLElement,
  hooks: { onReady(): void },
): IntermissionPanel {
  const root = document.createElement('section');
  const title = document.createElement('h2');
  const status = document.createElement('p');
  const countdown = document.createElement('strong');
  const rewards = document.createElement('div');
  const rewardsTitle = document.createElement('span');
  const rewardsList = document.createElement('ul');
  const ready = document.createElement('button');
  const recipes = document.createElement('div');
  root.className = 'intermission-panel';
  root.hidden = true;
  ready.className = 'btn primary';
  ready.textContent = texts.intermission.ready;
  ready.addEventListener('click', hooks.onReady);
  rewards.className = 'intermission-rewards';
  rewards.dataset.testid = 'intermission-rewards';
  rewardsTitle.textContent = texts.intermission.rewardsTitle;
  rewards.append(rewardsTitle, rewardsList);
  recipes.className = 'intermission-recipes recipe-progress-only';
  recipes.dataset.testid = 'recipe-panel';
  root.append(title, status, countdown, rewards, recipes, ready);
  arena.append(root);

  const rewardLabels: Record<RunBaseStatKind, string> = texts.intermission.rewardStats;

  return {
    render(state): void {
      const intermission = state.intermission;
      root.hidden = !intermission.active || intermission.afterWave === 0;
      if (root.hidden) return;
      title.textContent = texts.intermission.title.replace('{wave}', String(intermission.afterWave));
      status.textContent = texts.intermission.steps[intermission.step];
      const remaining = intermission.step === 'settle'
        ? intermission.settleRemaining
        : intermission.step === 'free' ? intermission.freeRemaining : 0;
      countdown.textContent = intermission.step === 'decide'
        ? texts.intermission.waiting
        : texts.intermission.countdown.replace('{seconds}', String(Math.ceil(remaining)));
      ready.hidden = intermission.step !== 'free';
      ready.disabled = intermission.readyConfirmed;
      rewards.hidden = intermission.rewardsGranted.length === 0;
      rewardsList.replaceChildren(...intermission.rewardsGranted.map(reward => {
        const item = document.createElement('li');
        item.dataset.waveReward = reward.id;
        item.textContent = `${rewardLabels[reward.stat]} +${reward.add}`;
        return item;
      }));

      const compatible = state.recipes.compatibleRecipeIds
        .map(id => cfg.evolutionRecipes.recipes.find(recipe => recipe.id === id))
        .filter(recipe => recipe !== undefined);
      recipes.hidden = compatible.length === 0;
      recipes.replaceChildren(...compatible.map(recipe => {
        const row = document.createElement('article');
        row.className = 'recipe-row recipe-progress-row';
        row.dataset.recipeId = recipe.id;
        if (state.recipes.pinnedRecipeId === recipe.id) row.classList.add('pinned');
        if (state.recipes.readyRecipeIds.includes(recipe.id)) row.classList.add('ready');
        row.textContent = `${cardDisplayName(recipe.ingredientVariable.cardId)} ${commitment(state, recipe.ingredientVariable.cardId)}/16 + ${cardDisplayName(recipe.ingredientAnchor.cardId)} ${commitment(state, recipe.ingredientAnchor.cardId)}/16 → ${cardDisplayName(recipe.outputCardId)}`;
        return row;
      }));
      ready.classList.toggle(
        'auto-ready-highlight',
        cfg.waves.intermission.autoReadyHighlight
          && intermission.step === 'free'
          && intermission.freeRemaining <= 5,
      );
    },
  };
}
