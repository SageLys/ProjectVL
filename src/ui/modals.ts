import { texts } from '../data';
import { cfg } from '../config';
import type { GameState, RunDecision } from '../core/types';
import type { PerkDef } from '../config/types';
import type { DomRefs } from './domRefs';
import { cardDisplayName } from './cardMeta';
import { fmt } from './format';

/** 升级三选一 / 结算 / 中心引导文案的显隐控制。 */
export function createModals(refs: DomRefs, hooks: { onPerk(id: string): void; onDecision(choice: string): void; onRestart(): void }) {
  const decisionModal = document.createElement('div');
  const decisionCard = document.createElement('div');
  const decisionTitle = document.createElement('h2');
  const decisionBody = document.createElement('p');
  const decisionChoices = document.createElement('div');
  let renderedDecision: RunDecision | null = null;
  decisionModal.className = 'modal';
  decisionModal.id = 'decisionModal';
  decisionCard.className = 'modal-card';
  decisionChoices.className = 'choices';
  decisionCard.append(decisionTitle, decisionBody, decisionChoices);
  decisionModal.append(decisionCard);
  document.body.append(decisionModal);

  refs.perkChoices.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-perk]');
    const id = button?.dataset.perk;
    if (id) hooks.onPerk(id);
  });
  decisionChoices.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-decision-choice]');
    const choice = button?.dataset.decisionChoice;
    if (choice) hooks.onDecision(choice);
  });
  refs.restartBtn.addEventListener('click', () => hooks.onRestart());

  return {
    /** 中心引导文案。show=false 时隐藏。 */
    message(title: string, body: string, show: boolean): void {
      refs.centerMsg.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
      refs.centerMsg.style.display = show ? 'block' : 'none';
    },
    showLevel(perks: PerkDef[], state: GameState): void {
      refs.perkChoices.replaceChildren(...perks.map(perk => {
        const button = document.createElement('button');
        const heading = document.createElement('span');
        const title = document.createElement('b');
        const desc = document.createElement('span');
        button.className = 'choice';
        button.dataset.perk = perk.id;
        heading.className = 'choice-heading';
        title.textContent = perk.title;
        desc.className = 'choice-desc';
        desc.textContent = perk.desc;
        heading.append(title);
        if (perk.lane !== 'utility') {
          const chip = document.createElement('span');
          chip.className = `lane-chip lane-${perk.lane}`;
          chip.textContent = texts.lanes[perk.lane];
          heading.append(chip);
        }
        button.append(heading, desc);
        if (perk.offerRole !== 'utility') {
          const heldTypes = new Set([...state.cards, ...state.equipment].filter(card => card !== null).map(card => card.type));
          const names = cfg.skills.cards
            .filter(card => heldTypes.has(card.id) && card.synergyTags.includes(perk.lane))
            .map(card => cardDisplayName(card.id));
          if (names.length) {
            const benefits = document.createElement('span');
            benefits.className = 'choice-benefits';
            benefits.textContent = fmt(texts.levelup.benefits, { names: [...new Set(names)].join('、') });
            button.append(benefits);
          }
        }
        return button;
      }));
      refs.levelModal.classList.add('show');
    },
    hideLevel(): void { refs.levelModal.classList.remove('show'); },
    showDecision(decision: RunDecision, state?: GameState): void {
      // dispatch() synchronizes this modal every animation frame. Replacing a
      // button between pointerdown and pointerup suppresses the browser click.
      if (renderedDecision !== decision) {
        const copy = texts.decisions[decision.kind];
        const options = decision.kind === 'godDraft' || decision.kind === 'godFocus'
          ? decision.candidates
          : decision.kind === 'evolutionBranch' || decision.kind === 'relic'
            ? decision.options
            : [decision.recipeId];
        decisionTitle.textContent = copy.title;
        decisionBody.textContent = copy.body;
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
            if (decision.kind === 'godDraft' && decision.role === 'main' && state) {
              const preview = document.createElement('span');
              preview.className = 'god-roster-preview';
              preview.textContent = (state.godPool.offerRosterPreviews[option] ?? [])
                .map(cardDisplayName)
                .join(' · ');
              button.append(preview);
            }
          } else {
            label.textContent = option;
            button.append(label);
          }
          return button;
        }));
        renderedDecision = decision;
      }
      decisionModal.classList.add('show');
    },
    hideDecision(): void { decisionModal.classList.remove('show'); },
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
      }
      refs.resultModal.classList.add('show');
    },
  };
}
