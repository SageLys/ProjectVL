import { describe, it, expect } from 'vitest';
import { addXp, levelUp, applyPerk } from '../src/core/systems/progressionSystem';
import { totalDamage, totalFireRate } from '../src/core/stats';
import { card, freshState, createDefaultConfig } from './helpers';

describe('progressionSystem · 经验与升级', () => {
  it('xpNeed 每级 ×1.38 取整', () => {
    const s = freshState();
    expect(s.xpNeed).toBe(12);
    levelUp(s);
    expect(s.xpNeed).toBe(Math.round(12 * 1.38)); // 17
    levelUp(s);
    expect(s.xpNeed).toBe(Math.round(17 * 1.38)); // 23
  });

  it('addXp 达阈值触发一次升级并暂停', () => {
    const s = freshState();
    const ev = addXp(s, 12);
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
  it('高能弹芯：伤害进入独立 +15% 乘数层', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const before = totalDamage(s, config);
    applyPerk(s, config, 'damage');
    expect(s.damagePerkMultiplier).toBeCloseTo(1.15);
    expect(totalDamage(s, config)).toBeCloseTo(before * 1.15);
    expect(s.paused).toBe(false);
  });

  it('过载供能：射速进入独立 +12% 乘数层', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const before = totalFireRate(s, config);
    applyPerk(s, config, 'rate');
    expect(s.fireRatePerkMultiplier).toBeCloseTo(1.12);
    expect(totalFireRate(s, config)).toBeCloseTo(before * 1.12);
  });

  it('perk 与后续装备解耦，局外全局乘数只线性乘输出伤害', () => {
    const s = freshState();
    const config = createDefaultConfig();
    applyPerk(s, config, 'damage');
    s.cards[0] = card('damage', 2, true);
    config.metaPowerMultiplier = 1.1;
    expect(totalDamage(s, config)).toBeCloseTo((16 + 5 * 2.25) * 1.15 * 1.1);
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
