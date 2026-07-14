import { texts } from '../data';
import type { GameState } from '../core/types';
import type { PerkDef } from '../config/types';
import type { DomRefs } from './domRefs';
import { fmt } from './format';

/** 升级三选一 / 结算 / 中心引导文案的显隐控制。 */
export function createModals(refs: DomRefs, hooks: { onPerk(id: string): void; onRestart(): void }) {
  refs.perkChoices.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-perk]');
    const id = button?.dataset.perk;
    if (id) hooks.onPerk(id);
  });
  refs.restartBtn.addEventListener('click', () => hooks.onRestart());

  return {
    /** 中心引导文案。show=false 时隐藏。 */
    message(title: string, body: string, show: boolean): void {
      refs.centerMsg.innerHTML = `<h2>${title}</h2><p>${body}</p>`;
      refs.centerMsg.style.display = show ? 'block' : 'none';
    },
    showLevel(perks: PerkDef[]): void {
      refs.perkChoices.replaceChildren(...perks.map(perk => {
        const button = document.createElement('button');
        const title = document.createElement('b');
        button.className = 'choice';
        button.dataset.perk = perk.id;
        title.textContent = perk.title;
        button.append(title, perk.desc);
        return button;
      }));
      refs.levelModal.classList.add('show');
    },
    hideLevel(): void { refs.levelModal.classList.remove('show'); },
    hideResult(): void { refs.resultModal.classList.remove('show'); },
    showResult(win: boolean, state: GameState): void {
      refs.resultTitle.textContent = win ? texts.result.winTitle : texts.result.loseTitle;
      refs.resultDesc.textContent = fmt(win ? texts.result.winDesc : texts.result.loseDesc, { collected: state.collected, expired: state.expired });
      refs.resultKills.textContent = String(state.kills);
      refs.resultMerges.textContent = String(state.merges);
      refs.resultUses.textContent = String(state.consumes);
      refs.resultModal.classList.add('show');
    },
  };
}
