import { texts } from '../data';
import { cfg } from '../config';
import type { GameState, RunDecision } from '../core/types';
import type { DomRefs } from './domRefs';
import { cardDisplayName, evolutionChoiceCopy } from './cardMeta';
import { fmt } from './format';
import { buildEvolutionOptionViewModel } from './cardDetailModel';
import { modalShell } from './modalShell';

/** 局内抉择 / 结算 / 中心引导文案的显隐控制。 */
export function createModals(refs: DomRefs, hooks: { onDecision(choice: string): void; onRestart(): void }) {
  const decisionShell = modalShell({
    mode: 'centered',
    dismissible: false,
    className: 'modal',
    labelledBy: 'decisionModalTitle',
  });
  const decisionModal = decisionShell.overlay;
  const decisionCard = decisionShell.dialog;
  const decisionTitle = document.createElement('h2');
  const decisionBody = document.createElement('p');
  const decisionChoices = document.createElement('div');
  let renderedDecision: RunDecision | null = null;
  decisionModal.id = 'decisionModal';
  decisionCard.classList.add('modal-card');
  decisionTitle.id = 'decisionModalTitle';
  decisionChoices.className = 'choices modal-shell-body';
  decisionShell.header.append(decisionTitle, decisionBody);
  decisionShell.body.replaceWith(decisionChoices);

  decisionChoices.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-decision-choice]');
    const choice = button?.dataset.decisionChoice;
    if (choice) hooks.onDecision(choice);
  });
  refs.restartBtn.addEventListener('click', () => hooks.onRestart());
  refs.resultModal?.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !refs.resultModal.classList.contains('show')) return;
    event.preventDefault();
    refs.restartBtn.focus();
  });

  return {
    /** 中心引导文案。show=false 时隐藏。 */
    message(title: string, body: string, show: boolean): void {
      refs.centerMsg.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
      refs.centerMsg.style.display = show ? 'block' : 'none';
    },
    showDecision(decision: RunDecision, state?: GameState): void {
      // dispatch() synchronizes this modal every animation frame. Replacing a
      // button between pointerdown and pointerup suppresses the browser click.
      if (renderedDecision !== decision) {
        const copy = texts.decisions[decision.kind];
        const options = decision.kind === 'godDraft' || decision.kind === 'godFocus'
          ? decision.candidates
          : decision.kind === 'waveBaseReward'
            ? cfg.waveRewards.choice
              .map(option => option.id)
              .filter(id => decision.candidates.includes(id) || decision.capped.includes(id))
          : decision.kind === 'evolutionBranch'
            ? decision.options
            : [];
        decisionTitle.textContent = copy.title;
        decisionCard.dataset.kind = decision.kind;
        decisionBody.textContent = decision.kind === 'evolutionBranch'
          ? `${copy.body} ${decision.checkpointStar === 5 ? '该分支会叠加到当前 3★ 路线上，不会替换之前的选择。 ' : ''}${texts.evolution.lockNotice}`
          : copy.body;
        decisionChoices.replaceChildren(...options.map(option => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'choice';
          button.dataset.decisionChoice = option;
          const label = document.createElement('b');
          if (decision.kind === 'godDraft' || decision.kind === 'godFocus') {
            const godCopy = (texts.gods as Record<string, { name: string; theme: string }>)[option];
            label.textContent = godCopy?.name ?? option;
            const theme = document.createElement('span');
            theme.className = 'choice-desc';
            theme.textContent = godCopy?.theme ?? '';
            button.append(label, theme);
            if (decision.kind === 'godDraft' && state) {
              const roster = state.godPool.offerRosterPreviews[option] ?? [];
              const preview = document.createElement('span');
              preview.className = 'god-roster-preview';
              preview.textContent = roster.map(cardDisplayName).join(' · ');
              button.append(preview);
            }
          } else if (decision.kind === 'evolutionBranch') {
            const optionDef = cfg.skills.cards
              .find(card => card.id === decision.cardType)?.evolutionTree?.checkpoints
              .find(checkpoint => checkpoint.star === decision.checkpointStar)?.options
              .find(item => item.id === option);
            const provisionalCard = state
              ? [...state.cards, ...state.equipment].find(card => card?.id === decision.provisionalCardId)
              : null;
            const optionModel = optionDef
              ? buildEvolutionOptionViewModel(
                decision.cardType,
                decision.checkpointStar,
                optionDef,
                provisionalCard?.evolutionPath,
                provisionalCard?.star ?? decision.checkpointStar,
              )
              : null;
            label.textContent = optionModel?.name ?? optionDef?.textKey ?? option;
            const desc = document.createElement('span');
            desc.className = 'choice-desc';
            desc.textContent = optionModel?.intent ?? '';
            const effects = document.createElement('ul');
            effects.className = 'choice-effects';
            for (const line of optionModel?.exactEffects.flatMap(block => block.lines) ?? []) {
              const item = document.createElement('li');
              item.textContent = line.text;
              effects.append(item);
            }
            const fit = document.createElement('span');
            fit.className = 'choice-fit';
            fit.textContent = `适合：${optionModel?.keywords.join('、') || '当前机制强化'}`;
            button.append(label, desc, effects, fit);
          } else if (decision.kind === 'waveBaseReward') {
            const optionDef = cfg.waveRewards.choice.find(item => item.id === option);
            label.textContent = optionDef
              ? (texts.waveRewardStats as Record<string, string>)[optionDef.stat] ?? optionDef.stat
              : option;
            const desc = document.createElement('span');
            desc.className = 'choice-desc';
            const capped = decision.capped.includes(option);
            desc.textContent = capped
              ? texts.waveRewardCapped
              : optionDef?.stat === 'xpGainPct'
                ? `+${optionDef.add * 100}%`
                : `+${optionDef?.add ?? 0}`;
            button.disabled = capped;
            button.setAttribute('aria-disabled', String(capped));
            button.classList.toggle('choice-capped', capped);
            button.append(label, desc);
          } else {
            label.textContent = option;
            button.append(label);
          }
          return button;
        }));
        renderedDecision = decision;
      }
      decisionShell.open();
    },
    hideDecision(): void { decisionShell.close(); },
    hideResult(): void { refs.resultModal.classList.remove('show'); },
    showResult(win: boolean, state: GameState): void {
      refs.resultTitle.textContent = win ? texts.result.winTitle : texts.result.loseTitle;
      refs.resultDesc.textContent = `${fmt(win ? texts.result.winDesc : texts.result.loseDesc, { collected: state.collected, expired: state.expired })} · 难度：${cfg.difficulty.profiles[state.difficultyId].label}`;
      refs.resultKills.textContent = String(state.kills);
      refs.resultMerges.textContent = String(state.merges);
      refs.resultUses.textContent = String(state.consumes);
      const summary = state.runSummary;
      refs.resultScore.hidden = summary === null;
      refs.resultBreakdown.replaceChildren();
      refs.resultBuildMeta.replaceChildren();
      if (summary) {
        refs.resultScoreLabel.textContent = texts.result.scoreTotal;
        refs.resultScoreTotal.textContent = String(summary.score.total);
        const parts: Array<[string, number]> = [
          [texts.result.scoreWin, summary.score.win],
          [texts.result.scoreWaves, summary.score.waves],
          [texts.result.scoreKills, summary.score.kills],
          [texts.result.scoreHp, summary.score.hp],
          [texts.result.scoreBuild, summary.score.build],
          [texts.result.scoreWildcards, summary.score.wildcards],
        ];
        for (const [label, value] of parts) {
          if (value === 0) continue;
          const row = document.createElement('span');
          row.textContent = `${label} +${value}`;
          refs.resultBreakdown.append(row);
        }
        if (summary.topLane) {
          const lane = document.createElement('span');
          lane.textContent = fmt(texts.result.topLane, { lane: texts.lanes[summary.topLane] });
          refs.resultBuildMeta.append(lane);
        }
        if (summary.highestCard) {
          const highest = document.createElement('span');
          highest.textContent = fmt(texts.result.highestCard, { star: summary.highestCard.star, name: cardDisplayName(summary.highestCard.type) });
          refs.resultBuildMeta.append(highest);
        }
        for (const card of summary.cardEvolutions.filter(item => item.path.length > 0)) {
          const route = document.createElement('span');
          const names = card.path.map(entry => {
            const optionId = entry.slice(entry.indexOf(':') + 1);
            return evolutionChoiceCopy(card.type, optionId)?.name ?? optionId;
          });
          route.textContent = `${cardDisplayName(card.type)} ${card.highestStar}★ · ${names.join(' → ')}`;
          refs.resultBuildMeta.append(route);
        }
      }
      refs.resultModal.classList.add('show');
      refs.restartBtn.focus();
    },
  };
}
