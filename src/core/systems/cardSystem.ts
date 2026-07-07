import { cards as cardsData, gameConfig } from '../../data';
import type { Card, GameState } from '../types';

export interface Bonus {
  damage: number;
  rate: number;
  multi: number;
  range: number;
  drop: number;
}

const FX = cardsData.effects;

/** 星级倍率：1星=1，2星=2.25，3星=4；越界回退 1。 */
export function cardScale(star: number): number {
  return gameConfig.starScale[star] ?? 1;
}

/** 汇总一组卡牌的加成。multi 卡：星级≥2 加弹丸，1 星改加伤害。 */
export function bonusFromCards(cards: (Card | null)[]): Bonus {
  const bonus: Bonus = { damage: 0, rate: 0, multi: 0, range: 0, drop: 0 };
  for (const card of cards) {
    if (!card) continue;
    const scale = cardScale(card.star);
    if (card.type === 'damage') bonus.damage += FX.damagePerScale * scale;
    if (card.type === 'rate') bonus.rate += FX.ratePerScale * scale;
    if (card.type === 'multi') card.star >= 2 ? bonus.multi++ : (bonus.damage += FX.multiStar1DamagePerScale * scale);
    if (card.type === 'range') bonus.range += FX.rangePerScale * scale;
    if (card.type === 'luck') bonus.drop += FX.luckPerScale * scale;
  }
  return bonus;
}

export function addBonus(a: Bonus, b: Bonus): Bonus {
  return { damage: a.damage + b.damage, rate: a.rate + b.rate, multi: a.multi + b.multi, range: a.range + b.range, drop: a.drop + b.drop };
}

/**
 * 卡槽自动合成：同类型同星级两两合并升 1 星，循环至无法合成；3 星封顶。
 * 空位不阻碍合成。就地修改 state.cards，累加 state.merges，返回本次合成次数。
 */
export function autoMergeCards(state: GameState): number {
  let merged = 0;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < state.cards.length; i++) {
      const a = state.cards[i];
      if (!a) continue;
      if (a.star >= gameConfig.maxStar) continue;
      for (let j = i + 1; j < state.cards.length; j++) {
        const b = state.cards[j];
        if (!b) continue;
        if (a.type === b.type && a.star === b.star) {
          state.cards[i] = { id: state.nextCardId++, type: a.type, star: a.star + 1 };
          state.cards[j] = null;
          state.merges++;
          merged++;
          changed = true;
          break outer;
        }
      }
    }
  }
  return merged;
}
