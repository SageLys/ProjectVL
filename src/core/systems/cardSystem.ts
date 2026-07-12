import { cfg } from '../../config';
import type { Card, Config, GameEvent, GameState, Rng } from '../types';
import { fireTrigger } from '../effects/interpreter';

export interface Bonus {
  damage: number;
  rate: number;
  multi: number;
  range: number;
  drop: number;
}

/** 星级倍率（旧数值卡）：1星=1，2星=2.25，3星=4；越界回退 1。 */
export function cardScale(star: number): number {
  return cfg.skills.legacy.starScale[star] ?? 1;
}

/** 汇总一组旧数值卡的加成。multi 卡：星级≥2 加弹丸，1 星改加伤害。 */
export function bonusFromCards(cards: (Card | null)[]): Bonus {
  const FX = cfg.skills.legacy.effects;
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
 * 卡槽自动合成：同类型同星级凑满 mergeCopies 张合并升 1 星，循环至无法合成；maxStar 封顶。
 * 锁定卡不参与（方案B：锁定=装备，喂养须显式拖拽）。
 * 就地修改 state.cards，累加 state.merges，产出 merged 事件并触发 onMerge。
 */
export function autoMergeCards(state: GameState, config: Config, rng: Rng): { merged: number; events: GameEvent[] } {
  const { maxStar, mergeCopies } = cfg.economy;
  const events: GameEvent[] = [];
  let merged = 0;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < state.cards.length; i++) {
      const a = state.cards[i];
      if (!a || a.locked) continue;
      if (a.star >= maxStar) continue;
      const partners: number[] = [];
      for (let j = i + 1; j < state.cards.length && partners.length < mergeCopies - 1; j++) {
        const b = state.cards[j];
        if (!b || b.locked) continue;
        if ((a.type === b.type || a.type === 'wildcard' || b.type === 'wildcard') && a.star === b.star) partners.push(j);
      }
      if (partners.length === mergeCopies - 1) {
        const resultStar = a.star + 1;
        const partner = state.cards[partners[0]]!;
        const resultType = a.type === 'wildcard' ? partner.type : a.type;
        state.cards[i] = { id: state.nextCardId++, type: resultType, star: resultStar };
        for (const j of partners) state.cards[j] = null;
        state.merges++;
        merged++;
        events.push({ type: 'merged', cardType: resultType, resultStar });
        events.push(...fireTrigger(state, config, rng, 'onMerge', { merge: { cardType: resultType, resultStar } }));
        changed = true;
        break outer;
      }
    }
  }
  return { merged, events };
}
