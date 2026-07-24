import { texts } from '../data';
import { cfg } from '../config';
import type { GameState, RunDecision } from '../core/types';
import type { DomRefs } from './domRefs';
import { cardDisplayName, evolutionChoiceCopy } from './cardMeta';
import { fmt } from './format';

/** 升级三选一 / 结算 / 中心引导文案的显隐控制。 */
export function createModals(refs: DomRefs, hooks: { onDecision(choice: string): void; onRestart(): void }) {
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
        decisionBody.textContent = decision.kind === 'evolutionBranch'
          ? `${copy.body} ${texts.evolution.lockNotice}`
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
            if (decision.kind === 'godDraft' && decision.role === 'main' && state) {
              const preview = document.createElement('span');
              preview.className = 'god-roster-preview';
              preview.textContent = (state.godPool.offerRosterPreviews[option] ?? [])
                .map(cardDisplayName)
                .join(' · ');
              button.append(preview);
            }
          } else if (decision.kind === 'evolutionBranch') {
            const optionDef = cfg.skills.cards
              .find(card => card.id === decision.cardType)?.evolutionTree?.checkpoints
              .find(checkpoint => checkpoint.star === decision.checkpointStar)?.options
              .find(item => item.id === option);
            const optionCopy = (texts.evolution as unknown as Record<string, Record<string, { name: string; summary: string }>>)
              [decision.cardType]?.[option];
            label.textContent = optionCopy?.name ?? optionDef?.textKey ?? option;
            const desc = document.createElement('span');
            desc.className = 'choice-desc';
            desc.textContent = optionCopy?.summary ?? '';
            button.append(label, desc);
          } else if (decision.kind === 'relic') {
            const relic = cfg.relics.relics.find(item => item.id === option);
            label.textContent = relic?.title ?? option;
            const meta = document.createElement('span');
            meta.className = 'choice-desc';
            const godName = relic?.god
              ? (texts.gods as Record<string, { name: string }>)[relic.god]?.name ?? relic.god
              : '中立';
            meta.textContent = `${godName} · ${relic?.rarity ?? ''}`;
            const desc = document.createElement('span');
            desc.className = 'choice-desc';
            desc.textContent = relic?.desc ?? '';
            button.append(label, meta, desc);
            if (relic && state) {
              const heldTypes = new Set([...state.cards, ...state.equipment]
                .filter(card => card !== null).map(card => card.type));
              const names = cfg.skills.cards
                .filter(card => heldTypes.has(card.id)
                  && card.synergyTags.some(tag => relic.targetTags.includes(tag)))
                .map(card => cardDisplayName(card.id));
              if (names.length) {
                const benefits = document.createElement('span');
                benefits.className = 'choice-benefits';
                benefits.textContent = fmt(texts.levelup.benefits, { names: [...new Set(names)].join('、') });
                button.append(benefits);
              }
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
        const relics = document.createElement('span');
        relics.textContent = `遗物 ${summary.relics.count} · 普通 ${summary.relics.rarity.common} / 稀有 ${summary.relics.rarity.rare} / 史诗 ${summary.relics.rarity.epic}`;
        refs.resultBuildMeta.append(relics);
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
    },
  };
}
