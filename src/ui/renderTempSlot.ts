import { cards as cardsData } from '../data';
import type { CardType, GameState } from '../core/types';
import type { DomRefs } from './domRefs';

/** 渲染右侧临时栏：按类型+星级汇总本波投入的卡牌。 */
export function renderTempSlot(refs: DomRefs, state: GameState): void {
  const counts = state.tempCards.reduce<Record<string, number>>((acc, card) => {
    const key = `${card.type}-${card.star}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  refs.tempSlot.classList.toggle('has-temp', state.tempCards.length > 0);
  refs.tempSlot.innerHTML = state.tempCards.length
    ? `<div class="temp-summary"><b>已投入 ${state.tempCards.length} 张</b><em>${Object.entries(counts)
        .map(([key, count]) => {
          const [type, star] = key.split('-');
          return `${cardsData.types[type as CardType].name}${star}星×${count}`;
        })
        .join(' / ')}</em><small>下一波开始时清空</small></div>`
    : '拖入卡牌<br>叠加到本波';
}
