import { describe, it, expect, beforeEach } from 'vitest';
import { spawnGroundDrop, tickDrops, collectDrop, rollDropOnKill } from '../src/core/systems/dropSystem';
import { totalDropChance } from '../src/core/stats';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('dropSystem · 生命周期', () => {
  it('超时消失并计入 expired', () => {
    const s = freshState();
    const config = createDefaultConfig();
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'damage');
    expect(s.groundDrops).toHaveLength(1);
    tickDrops(s, config, constRng(0.99), config.dropLifetime + 0.01);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.expired).toBe(1);
  });

  it('普通掉落一律 1★（D5 掉落星级策略）', () => {
    const s = freshState();
    const config = createDefaultConfig();
    spawnGroundDrop(s, config, constRng(0), 100, 100, 'damage');
    expect(s.groundDrops[0].star).toBe(1);
  });
});

describe('dropSystem · 拾取', () => {
  it('拾取入槽并触发自动合成 + merged 事件', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('damage', 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'damage');
    const ev = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.collected).toBe(1);
    const nonNull = s.cards.filter(Boolean);
    expect(nonNull).toHaveLength(1);
    expect(nonNull[0]!.star).toBe(2);
    expect(ev).toContainEqual({ type: 'collected', cardType: 'damage', merges: 1 });
    expect(ev).toContainEqual({ type: 'merged', cardType: 'damage', resultStar: 2 });
  });

  it('卡槽满则拒绝拾取且掉落保留', () => {
    const s = freshState();
    const config = createDefaultConfig();
    // 交错星级避免自动合成腾空
    for (let i = 0; i < s.cards.length; i++) s.cards[i] = card('luck', (i % 3) + 1);
    spawnGroundDrop(s, config, constRng(0), 50, 50, 'rate');
    const ev = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);
    expect(ev).toEqual([{ type: 'cardsFull' }]);
    expect(s.groundDrops).toHaveLength(1);
    expect(s.collected).toBe(0);
  });
});

describe('dropSystem · 概率与 boss', () => {
  it('掉落概率上限 0.95（生效装备=锁定卡）', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.9;
    s.cards[0] = card('luck', 3, true); // 锁定即装备：+0.05*4 = 0.2 → 1.1，应被封顶
    expect(totalDropChance(s, config)).toBe(0.95);
  });

  it('boss 必掉，即便 rng 判定不掉', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
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
