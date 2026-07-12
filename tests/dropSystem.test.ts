import { describe, it, expect, beforeEach } from 'vitest';
import { spawnGroundDrop, tickDrops, collectDrop, rollDropOnKill } from '../src/core/systems/dropSystem';
import { totalDropChance } from '../src/core/stats';
import { cfg } from '../src/config';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv, applyVariants } from './helpers';

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
    expect(s.groundDrops[0].star).toBe(2);
    expect(s.groundDrops[0].source).toBe('boss');
  });

  it('非 boss 且 rng 高于概率则不掉', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0.5;
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'normal', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(0);
  });
});

describe('dropSystem · 定向掉落保底', () => {
  it('没有候选时维持五类等权，类型选择仅消费一次 RNG', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const values = [0.3, 0];
    let calls = 0;
    const rng = () => values[calls++] ?? 0;
    spawnGroundDrop(s, config, rng, 10, 20);
    expect(s.groundDrops[0].type).toBe('rate');
    expect(calls).toBe(2); // 类型一次 + pulse 一次
  });

  it('首张 3★ 恰缺一份时按配置权重稳定抽样', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('damage', 2);
    s.cards[1] = card('damage', 1);
    spawnGroundDrop(s, config, constRng(0.3), 10, 20);
    expect(s.groundDrops[0].type).toBe('damage');
  });

  it('定向关闭时即使恰缺一份也保持等权', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('damage', 2);
    s.cards[1] = card('damage', 1);
    cfg.economy.dropTargeting.enabled = false;
    spawnGroundDrop(s, config, constRng(0.3), 10, 20);
    expect(s.groundDrops[0].type).toBe('rate');
  });

  it('锁定模式把锁卡计入 1★ 等价值', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('range', 2, true);
    s.cards[1] = card('range', 1);
    spawnGroundDrop(s, config, constRng(0.82), 10, 20);
    expect(s.groundDrops[0].type).toBe('range');
  });

  it('独立装备格模式把 equipment 计入 1★ 等价值', () => {
    applyVariants(['equip-slots']);
    const s = freshState();
    const config = createDefaultConfig();
    s.equipment[0] = card('damage', 2);
    s.cards[0] = card('damage', 1);
    spawnGroundDrop(s, config, constRng(0.3), 10, 20);
    expect(s.groundDrops[0].type).toBe('damage');
  });

  it('已有同型 3★ 时不再为重复 3★ 定向', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.cards[0] = card('damage', 3);
    s.cards[1] = card('damage', 2);
    s.cards[2] = card('damage', 1);
    spawnGroundDrop(s, config, constRng(0.3), 10, 20);
    expect(s.groundDrops[0].type).toBe('rate');
  });

  it('forcedType 与 forced star 不参与随机选择且原样保留', () => {
    const s = freshState();
    const config = createDefaultConfig();
    let calls = 0;
    spawnGroundDrop(s, config, () => { calls++; return 0.5; }, 10, 20, 'luck', 3);
    expect(s.groundDrops[0]).toMatchObject({ type: 'luck', star: 3 });
    expect(calls).toBe(1); // 仅 pulse
  });
});

describe('dropSystem · Boss 星级策略', () => {
  it('普通敌人掉落仍为 1★', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 1;
    rollDropOnKill(s, config, constRng(0), enemy({ type: 'normal', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(1);
    expect(s.groundDrops[0].star).toBe(1);
    expect(s.groundDrops[0].source).toBe('normal');
  });

  it('Boss 的 2★ 概率未命中时仍必掉 1★', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
    cfg.economy.dropStarPolicy.bossStar2Chance = 0;
    rollDropOnKill(s, config, constRng(0.99), enemy({ type: 'boss', x: 10, y: 10 }));
    expect(s.groundDrops).toHaveLength(1);
    expect(s.groundDrops[0].star).toBe(1);
  });
});
