import { describe, it, expect } from 'vitest';
import { spawnGroundDrop, tickDrops, collectDrop, rollDropOnKill } from '../src/core/systems/dropSystem';
import { totalDropChance } from '../src/core/stats';
import { card, enemy, freshState, createDefaultConfig, constRng } from './helpers';

describe('dropSystem · 生命周期', () => {
  it('超时消失并计入 expired', () => {
    const s = freshState();
    const config = createDefaultConfig();
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'damage');
    expect(s.groundDrops).toHaveLength(1);
    tickDrops(s, config.dropLifetime + 0.01);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.expired).toBe(1);
  });
});

describe('dropSystem · 拾取', () => {
  it('拾取入槽并触发自动合成', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('damage', 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'damage');
    const drop = s.groundDrops[0];
    const ev = collectDrop(s, drop);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.collected).toBe(1);
    // 槽内原有 1 星 + 拾取 1 星 → 合成为 2 星
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
    expect(ev).toEqual([{ type: 'collected', cardType: 'damage', merges: 1 }]);
  });

  it('卡槽满则拒绝拾取且掉落保留', () => {
    const s = freshState();
    const config = createDefaultConfig();
    for (let i = 0; i < s.cards.length; i++) s.cards[i] = card('luck', 1);
    // 交错星级避免自动合成腾空
    s.cards[1] = card('luck', 2);
    s.cards[3] = card('luck', 3);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'rate');
    const drop = s.groundDrops[0];
    const ev = collectDrop(s, drop);
    expect(ev).toEqual([{ type: 'cardsFull' }]);
    expect(s.groundDrops).toHaveLength(1);
    expect(s.collected).toBe(0);
  });
});

describe('dropSystem · 概率与 boss', () => {
  it('掉落概率上限 0.95', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.9;
    s.equipment[0] = card('luck', 3); // +0.05*4 = 0.2 → 1.1，应被封顶
    expect(totalDropChance(s, config)).toBe(0.95);
  });

  it('boss 必掉，即便 rng 判定不掉', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0; // 概率为 0
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'boss', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(1);
  });

  it('非 boss 且 rng 高于概率则不掉', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.5;
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'normal', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(0);
  });
});
