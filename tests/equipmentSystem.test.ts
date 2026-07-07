import { describe, it, expect } from 'vitest';
import { moveOrSwap, quickEquip, absorbTempCard, clearTempCards } from '../src/core/systems/equipmentSystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import { card, freshState } from './helpers';

describe('equipmentSystem · 装备栏 3 星门槛', () => {
  it('1星/2星不可入装备栏，状态不变', () => {
    for (const star of [1, 2]) {
      const s = freshState();
      s.cards[0] = card('damage', star);
      const ev = moveOrSwap(s, 'cards', 0, 'equipment', 0);
      expect(ev).toEqual([{ type: 'equipRejected' }]);
      expect(s.equipment[0]).toBeNull();
      expect(s.cards[0]).not.toBeNull();
    }
  });

  it('3星可入装备栏', () => {
    const s = freshState();
    s.cards[0] = card('damage', 3);
    const ev = moveOrSwap(s, 'cards', 0, 'equipment', 0);
    expect(ev[0].type).toBe('moved');
    expect(s.equipment[0]!.star).toBe(3);
    expect(s.cards[0]).toBeNull();
  });
});

describe('equipmentSystem · 快速装备与交换', () => {
  it('装备满时快速装备失败且不改状态', () => {
    const s = freshState();
    s.equipment = [card('damage', 3), card('rate', 3), card('range', 3)];
    s.cards[0] = card('luck', 3);
    const before = JSON.stringify(s.equipment);
    const ev = quickEquip(s, 0);
    expect(ev).toEqual([{ type: 'equipFull' }]);
    expect(JSON.stringify(s.equipment)).toBe(before);
    expect(s.cards[0]).not.toBeNull();
  });

  it('交换后两侧状态正确', () => {
    const s = freshState();
    const a = card('damage', 3);
    const b = card('rate', 3);
    s.cards[0] = a;
    s.equipment[0] = b;
    const ev = moveOrSwap(s, 'cards', 0, 'equipment', 0);
    expect(ev[0].type).toBe('swapped');
    expect(s.equipment[0]).toBe(a);
    expect(s.cards[0]).toBe(b);
  });
});

describe('equipmentSystem · 临时栏', () => {
  it('临时栏接受任意星级', () => {
    for (const star of [1, 2, 3]) {
      const s = freshState();
      s.cards[0] = card('luck', star);
      const ev = absorbTempCard(s, 'cards', 0);
      expect(ev[0].type).toBe('tempInvest');
      expect(s.tempCards).toHaveLength(1);
      expect(s.tempCards[0].star).toBe(star);
      expect(s.uses).toBe(1);
    }
  });

  it('下一波开始清空临时栏', () => {
    const s = freshState();
    s.wave = 1;
    s.tempCards = [card('damage', 1), card('rate', 2)];
    const ev = startNextWave(s);
    expect(s.tempCards).toHaveLength(0);
    expect(ev).toContainEqual({ type: 'tempCleared', count: 2 });
  });

  it('clearTempCards 空栏不产出事件', () => {
    const s = freshState();
    expect(clearTempCards(s)).toEqual([]);
  });
});
