import { texts } from '../data';
import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { RunBaseStatKind } from '../config/types';
import { availableRecipes } from '../core/systems/recipeEvolutionSystem';
import { cardDisplayName } from './cardMeta';

export interface IntermissionPanel {
  render(state: GameState): void;
}

export function createIntermissionPanel(
  arena: HTMLElement,
  hooks: { onReady(): void; onRecipe?(recipeId: string, aCardId: number, bCardId: number): void },
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
  let recipeSignature = '';
  root.className = 'intermission-panel';
  root.hidden = true;
  ready.className = 'btn primary';
  ready.textContent = texts.intermission.ready;
  ready.addEventListener('click', hooks.onReady);
  rewards.className = 'intermission-rewards';
  rewards.dataset.testid = 'intermission-rewards';
  rewardsTitle.textContent = texts.intermission.rewardsTitle;
  rewards.append(rewardsTitle, rewardsList);
  recipes.className = 'intermission-recipes';
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
      const available = intermission.step === 'free' ? availableRecipes(state) : [];
      const nextSignature = available.map(recipe => {
        const a = [...state.cards, ...state.equipment].find(card => card?.id === recipe.a.cardId);
        const b = [...state.cards, ...state.equipment].find(card => card?.id === recipe.b.cardId);
        return `${recipe.recipeId}:${recipe.a.slotKind}:${recipe.a.cardId}:${a?.star}:${recipe.b.slotKind}:${recipe.b.cardId}:${b?.star}`;
      }).join('|');
      recipes.hidden = available.length === 0 || intermission.step !== 'free';
      if (recipeSignature !== nextSignature) {
        recipes.replaceChildren(...available.map(selection => {
          const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === selection.recipeId)!;
          const a = [...state.cards, ...state.equipment].find(card => card?.id === selection.a.cardId)!;
          const b = [...state.cards, ...state.equipment].find(card => card?.id === selection.b.cardId)!;
          const row = document.createElement('article');
          const formula = document.createElement('div');
          const action = document.createElement('div');
          const checks: HTMLInputElement[] = [];
          row.className = 'recipe-row';
          row.dataset.recipeId = selection.recipeId;
          formula.className = 'recipe-formula';
          const preview = (name: string, star: number, role: string) => {
            const card = document.createElement('span');
            card.className = `recipe-card-preview ${role}`;
            card.textContent = `${star}★ ${name}`;
            return card;
          };
          formula.append(
            preview(cardDisplayName(a.type), a.star, 'material'),
            document.createTextNode('＋'),
            preview(cardDisplayName(b.type), b.star, 'material'),
            document.createTextNode('→'),
            preview(cardDisplayName(recipe.outputCardId), recipe.outputStar, 'output'),
          );
          action.className = 'recipe-action';
          for (const material of [
            { ref: selection.a, card: a },
            { ref: selection.b, card: b },
          ]) {
            if (material.ref.slotKind !== 'equipment') continue;
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.equipmentCardId = String(material.card.id);
            label.append(checkbox, ` 消耗已装备的 ${cardDisplayName(material.card.type)}`);
            checks.push(checkbox);
            action.append(label);
          }
          const confirmButton = document.createElement('button');
          confirmButton.type = 'button';
          confirmButton.className = 'btn recipe-confirm';
          confirmButton.textContent = '确认进化';
          const syncDisabled = () => {
            confirmButton.disabled = checks.some(checkbox => !checkbox.checked);
          };
          checks.forEach(checkbox => checkbox.addEventListener('change', syncDisabled));
          syncDisabled();
          confirmButton.addEventListener('click', () => {
            if (checks.some(checkbox => !checkbox.checked)) return;
            if (!window.confirm('将消耗这两张卡，确认完成卡间进化？')) return;
            hooks.onRecipe?.(selection.recipeId, selection.a.cardId, selection.b.cardId);
          });
          action.append(confirmButton);
          row.append(formula, action);
          return row;
        }));
        recipeSignature = nextSignature;
      }
      ready.classList.toggle(
        'auto-ready-highlight',
        cfg.waves.intermission.autoReadyHighlight
          && intermission.step === 'free'
          && intermission.freeRemaining <= 5,
      );
    },
  };
}
