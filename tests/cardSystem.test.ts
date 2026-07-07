import { describe, it, expect } from 'vitest';
import { autoMergeCards, bonusFromCards, cardScale } from '../src/core/systems/cardSystem';
import { card, freshState } from './helpers';

describe('cardSystem · 自动合成', () => {
  it('两张同类1星 → 一张2星', () => {
    const s = freshState();
    s.cards = [card('damage', 1), card('damage', 1), null, null, null, null, null];
    const merged = autoMergeCards(s);
    expect(merged).toBe(1);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
    expect(s.merges).toBe(1);
  });

  it('四张同类1星 → 一张3星（连锁合成3次）', () => {
    const s = freshState();
    s.cards = [card('rate', 1), card('rate', 1), card('rate', 1), card('rate', 1), null, null, null];
    const merged = autoMergeCards(s);
    expect(merged).toBe(3);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(3);
  });

  it('3星不再合成', () => {
    const s = freshState();
    s.cards = [card('damage', 3), card('damage', 3), null, null, null, null, null];
    expect(autoMergeCards(s)).toBe(0);
    expect(s.cards.filter(Boolean)).toHaveLength(2);
  });

  it('不同类型不合成', () => {
    const s = freshState();
    s.cards = [card('damage', 1), card('rate', 1), null, null, null, null, null];
    expect(autoMergeCards(s)).toBe(0);
  });

  it('中间有空位仍能合成', () => {
    const s = freshState();
    s.cards = [card('range', 1), null, card('range', 1), null, null, null, null];
    expect(autoMergeCards(s)).toBe(1);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
  });
});

describe('cardSystem · multi 卡特殊规则', () => {
  it('multi 1星按伤害计（+2.5×倍率），不加弹丸', () => {
    const b = bonusFromCards([card('multi', 1)]);
    expect(b.multi).toBe(0);
    expect(b.damage).toBeCloseTo(2.5 * cardScale(1));
  });

  it('multi 2星按弹丸计（+1），不加伤害', () => {
    const b = bonusFromCards([card('multi', 2)]);
    expect(b.multi).toBe(1);
    expect(b.damage).toBe(0);
  });

  it('星级倍率 = [_,1,2.25,4]', () => {
    expect(cardScale(1)).toBe(1);
    expect(cardScale(2)).toBe(2.25);
    expect(cardScale(3)).toBe(4);
  });
});
