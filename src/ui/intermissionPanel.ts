import { cfg } from '../config';
import type { GameState } from '../core/types';
import { texts } from '../data';
import type { RunBaseStatKind } from '../config/types';

export interface IntermissionPanel {
  render(state: GameState): void;
}

/** Wave intermission only presents wave status, rewards, countdown and readiness. */
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
  const selectedReward = document.createElement('div');
  const selectedRewardTitle = document.createElement('span');
  const selectedRewardList = document.createElement('ul');
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
  selectedReward.className = 'intermission-rewards intermission-selected-reward';
  selectedReward.dataset.testid = 'intermission-selected-reward';
  selectedRewardTitle.textContent = texts.intermission.selectedRewardTitle;
  selectedReward.append(selectedRewardTitle, selectedRewardList);
  root.append(title, status, countdown, rewards, selectedReward, ready);
  arena.append(root);

  const rewardLabels: Record<RunBaseStatKind, string> = texts.intermission.rewardStats;

  return {
    render(state): void {
      const intermission = state.intermission;
      root.hidden = !intermission.active
        || intermission.afterWave === 0
        || intermission.step === 'rewardChoice'
        || intermission.step === 'godDecision';
      if (root.hidden) return;
      title.textContent = texts.intermission.title.replace('{wave}', String(intermission.afterWave));
      status.textContent = texts.intermission.steps[intermission.step];
      const remaining = intermission.step === 'settle'
        ? intermission.settleRemaining
        : intermission.step === 'free' ? intermission.freeRemaining : 0;
      countdown.textContent = intermission.step === 'settle' || intermission.step === 'free'
        ? texts.intermission.countdown.replace('{seconds}', String(Math.ceil(remaining)))
        : texts.intermission.waiting;
      ready.hidden = intermission.step !== 'free';
      ready.disabled = intermission.readyConfirmed;
      rewards.hidden = intermission.rewardsGranted.length === 0;
      rewardsList.replaceChildren(...intermission.rewardsGranted.map(reward => {
        const item = document.createElement('li');
        item.dataset.waveReward = reward.id;
        item.textContent = `${rewardLabels[reward.stat]} +${reward.add}`;
        return item;
      }));
      selectedReward.hidden = intermission.selectedReward === null;
      selectedRewardList.replaceChildren(...(intermission.selectedReward ? [intermission.selectedReward] : []).map(reward => {
        const item = document.createElement('li');
        item.dataset.waveReward = reward.id;
        const label = (texts.waveRewardStats as Record<string, string>)[reward.stat] ?? reward.stat;
        const value = reward.stat === 'xpGainPct' ? `${reward.add * 100}%` : String(reward.add);
        item.textContent = `${label} +${value}`;
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
