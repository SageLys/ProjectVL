import { describe, it, expect } from 'vitest';
import { addXp, levelUp, applyPerk } from '../src/core/systems/progressionSystem';
import { totalDamage, totalFireRate } from '../src/core/stats';
import { freshState, createDefaultConfig } from './helpers';

describe('progressionSystem · 经验与升级', () => {
  it('xpNeed 每级 ×1.35 取整', () => {
    const s = freshState();
    expect(s.xpNeed).toBe(8);
    levelUp(s);
    expect(s.xpNeed).toBe(Math.round(8 * 1.35)); // 11
    levelUp(s);
    expect(s.xpNeed).toBe(Math.round(11 * 1.35)); // 15
  });

  it('addXp 达阈值触发一次升级并暂停', () => {
    const s = freshState();
    const ev = addXp(s, 8);
    expect(ev).toEqual([{ type: 'levelUp' }]);
    expect(s.level).toBe(2);
    expect(s.paused).toBe(true);
    expect(s.xp).toBe(0);
  });

  it('addXp 未达阈值不升级', () => {
    const s = freshState();
    const ev = addXp(s, 3);
    expect(ev).toEqual([]);
    expect(s.level).toBe(1);
    expect(s.xp).toBe(3);
  });
});

describe('progressionSystem · 三选一 perk', () => {
  it('高能弹芯：当前总伤害 +20% 记入 damageBonus', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const before = totalDamage(s, config);
    applyPerk(s, config, 'damage');
    expect(s.damageBonus).toBeCloseTo(before * 0.2);
    expect(s.paused).toBe(false);
  });

  it('过载供能：当前总射速 +15% 记入 fireRateBonus', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const before = totalFireRate(s, config);
    applyPerk(s, config, 'rate');
    expect(s.fireRateBonus).toBeCloseTo(before * 0.15);
  });

  it('重整心防：回血 20，不超上限', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.hp = 90;
    applyPerk(s, config, 'repair');
    expect(s.hp).toBe(100); // 90+20 封顶 100
    s.hp = 50;
    applyPerk(s, config, 'repair');
    expect(s.hp).toBe(70);
  });
});
