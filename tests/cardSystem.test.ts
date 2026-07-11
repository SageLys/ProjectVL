import { describe, it, expect, beforeEach } from 'vitest';
import { autoMergeCards, bonusFromCards, cardScale } from '../src/core/systems/cardSystem';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

describe('cardSystem · 自动合成（mergeCopies=2 二合，maxStar=3，均为配置变量）', () => {
  it('两张同类1星 → 一张2星，并产出 merged 事件', () => {
    const s = freshState();
    s.cards[0] = card('damage', 1);
    s.cards[1] = card('damage', 1);
    const { merged, events } = autoMergeCards(s, config, rng);
    expect(merged).toBe(1);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
    expect(s.merges).toBe(1);
    expect(events).toContainEqual({ type: 'merged', cardType: 'damage', resultStar: 2 });
  });

  it('四张同类1星 → 一张3星（连锁合成3次，D2：3★=4张）', () => {
    const s = freshState();
    for (let i = 0; i < 4; i++) s.cards[i] = card('rate', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(3);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(3);
  });

  it('3星封顶不再合成（maxStar 配置）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 3);
    s.cards[1] = card('damage', 3);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
    expect(s.cards.filter(Boolean)).toHaveLength(2);
  });

  it('不同类型不合成', () => {
    const s = freshState();
    s.cards[0] = card('damage', 1);
    s.cards[1] = card('rate', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
  });

  it('中间有空位仍能合成', () => {
    const s = freshState();
    s.cards[0] = card('range', 1);
    s.cards[2] = card('range', 1);
    expect(autoMergeCards(s, config, rng).merged).toBe(1);
  });

  it('锁定卡不参与自动合成（方案B：锁定=装备）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    s.cards[1] = card('damage', 2);
    expect(autoMergeCards(s, config, rng).merged).toBe(0);
    expect(s.cards[0]!.star).toBe(2);
    expect(s.cards[1]!.star).toBe(2);
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
