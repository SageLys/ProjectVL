import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { moveOrSwap, quickEquip, toggleLock, consumeCard } from '../src/core/systems/equipmentSystem';
import { equipmentBonus } from '../src/core/stats';
import { card, freshState, createDefaultConfig, constRng, resetTestEnv, applyVariants } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);
afterEach(resetTestEnv);

describe('equipmentSystem · 独立装备格（方案A variant，equipThreshold=2 配置变量）', () => {
  beforeEach(() => applyVariants(['equip-slots']));

  it('1星不可入装备栏（门槛 2★，D3）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 1);
    const ev = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    expect(ev).toEqual([{ type: 'equipRejected', reason: 'star' }]);
    expect(s.equipment[0]).toBeNull();
  });

  it('2星/3星可入装备栏', () => {
    for (const star of [2, 3]) {
      const s = freshState();
      s.cards[0] = card('damage', star);
      const ev = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
      expect(ev[0].type).toBe('moved');
      expect(s.equipment[0]!.star).toBe(star);
    }
  });

  it('同类型装备唯一（R9）：不同星拒绝', () => {
    const s = freshState();
    s.equipment[0] = card('damage', 3);
    s.cards[0] = card('damage', 2);
    const ev = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 1);
    expect(ev).toEqual([{ type: 'equipRejected', reason: 'duplicate' }]);
  });

  it('喂养合成（R10）：同型同星拖到已装备卡上 → 升星，源卡消失', () => {
    const s = freshState();
    s.equipment[0] = card('damage', 2);
    s.cards[0] = card('damage', 2);
    const ev = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    expect(ev).toContainEqual({ type: 'fed', cardType: 'damage', resultStar: 3 });
    expect(s.equipment[0]!.star).toBe(3);
    expect(s.cards[0]).toBeNull();
    expect(s.merges).toBe(1);
  });

  it('装备满时快速装备失败且不改状态', () => {
    const s = freshState();
    s.equipment = [card('damage', 3), card('rate', 3), card('range', 3)];
    s.cards[0] = card('luck', 3);
    const before = JSON.stringify(s.equipment);
    expect(quickEquip(s, config, rng, 0)).toEqual([{ type: 'equipFull' }]);
    expect(JSON.stringify(s.equipment)).toBe(before);
  });

  it('交换后两侧状态正确', () => {
    const s = freshState();
    const a = card('damage', 3);
    const b = card('rate', 3);
    s.cards[0] = a;
    s.equipment[0] = b;
    const ev = moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0);
    expect(ev[0].type).toBe('swapped');
    expect(s.equipment[0]).toBe(a);
    expect(s.cards[0]).toBe(b);
  });
});

describe('equipmentSystem · 锁定即装备（方案B，base 默认）', () => {
  it('2星起可锁定；锁定卡计入装备加成', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2);
    const ev = toggleLock(s, 0);
    expect(ev).toEqual([{ type: 'locked', cardType: 'damage' }]);
    expect(s.cards[0]!.locked).toBe(true);
    expect(equipmentBonus(s).damage).toBeGreaterThan(0);
    expect(s.equipOps).toBe(1);
  });

  it('1星不可锁定（门槛复用 equipThreshold）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 1);
    expect(toggleLock(s, 0)).toEqual([{ type: 'lockRejected', reason: 'star' }]);
  });

  it('锁定上限 maxLocked=3', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    s.cards[1] = card('rate', 2, true);
    s.cards[2] = card('range', 2, true);
    s.cards[3] = card('luck', 2);
    expect(toggleLock(s, 3)).toEqual([{ type: 'lockRejected', reason: 'limit' }]);
  });

  it('锁定集内同类型唯一（R9）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    s.cards[1] = card('damage', 3);
    expect(toggleLock(s, 1)).toEqual([{ type: 'lockRejected', reason: 'duplicate' }]);
  });

  it('再击解锁', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    expect(toggleLock(s, 0)).toEqual([{ type: 'unlocked', cardType: 'damage' }]);
    expect(s.cards[0]!.locked).toBe(false);
  });

  it('锁定卡不可被拖动（先解锁）', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    expect(moveOrSwap(s, config, rng, 'cards', 0, 'cards', 1)).toEqual([{ type: 'lockRejected', reason: 'locked' }]);
    expect(s.cards[0]).not.toBeNull();
  });

  it('喂养合成：同型同星拖到锁定卡上 → 升星', () => {
    const s = freshState();
    s.cards[0] = card('damage', 2, true);
    s.cards[1] = card('damage', 2);
    const ev = moveOrSwap(s, config, rng, 'cards', 1, 'cards', 0);
    expect(ev).toContainEqual({ type: 'fed', cardType: 'damage', resultStar: 3 });
    expect(s.cards[0]!.star).toBe(3);
    expect(s.cards[0]!.locked).toBe(true);
    expect(s.cards[1]).toBeNull();
  });
});

describe('equipmentSystem · 消耗释放（R1–R4）', () => {
  it('消耗移除该卡（R3），计入 consumes，产出带落点的 skillConsumed', () => {
    const s = freshState();
    s.cards[0] = card('rate', 2);
    const ev = consumeCard(s, config, rng, 0, 320, 240);
    expect(s.cards[0]).toBeNull();
    expect(s.consumes).toBe(1);
    expect(ev).toContainEqual({ type: 'skillConsumed', cardType: 'rate', star: 2, x: 320, y: 240 });
  });

  it('锁定卡不可直接消耗（防误耗装备）', () => {
    const s = freshState();
    s.cards[0] = card('rate', 2, true);
    expect(consumeCard(s, config, rng, 0, 320, 240)).toEqual([{ type: 'lockRejected', reason: 'locked' }]);
    expect(s.cards[0]).not.toBeNull();
    expect(s.consumes).toBe(0);
  });
});
