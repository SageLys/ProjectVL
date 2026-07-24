import { texts } from '../data';
import { cfg } from '../config';
import type { GameState } from '../core/types';
import type { RunBaseStatKind } from '../config/types';

export interface IntermissionPanel {
  render(state: GameState): void;
}

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
  root.className = 'intermission-panel';
  root.hidden = true;
  ready.className = 'btn primary';
  ready.textContent = texts.intermission.ready;
  ready.addEventListener('click', hooks.onReady);
  rewards.className = 'intermission-rewards';
  rewards.dataset.testid = 'intermission-rewards';
  rewardsTitle.textContent = texts.intermission.rewardsTitle;
  rewards.append(rewardsTitle, rewardsList);
  root.append(title, status, countdown, rewards, ready);
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
      ready.classList.toggle(
        'auto-ready-highlight',
        cfg.waves.intermission.autoReadyHighlight
          && intermission.step === 'free'
          && intermission.freeRemaining <= 5,
      );
    },
  };
}
