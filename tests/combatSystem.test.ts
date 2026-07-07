import { describe, it, expect } from 'vitest';
import { findTarget, shoot, updateBullets } from '../src/core/systems/combatSystem';
import { totalMulti } from '../src/core/stats';
import { enemy, freshState, createDefaultConfig, constRng } from './helpers';

describe('combatSystem · 锁定', () => {
  it('锁定射程内最近的敌人', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const near = enemy({ x: 500, y: 300 }); // 距炮台 20
    const far = enemy({ x: 600, y: 300 }); // 距炮台 120
    s.enemies = [far, near];
    expect(findTarget(s, config)).toBe(near);
  });

  it('射程外的敌人不锁定', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.range = 430;
    s.enemies = [enemy({ x: 980, y: 300 })]; // 距炮台 500 > 430
    expect(findTarget(s, config)).toBeNull();
  });
});

describe('combatSystem · 射击与命中', () => {
  it('多弹丸散布数量 = totalMulti', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.multi = 3;
    expect(totalMulti(s)).toBe(3);
    shoot(s, config, constRng(0.5), enemy({ x: 500, y: 300 }));
    expect(s.bullets).toHaveLength(3);
  });

  it('子弹命中扣血；致命命中触发击杀', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const e = enemy({ x: 500, y: 300, hp: 10, maxHp: 10, xp: 1 });
    s.enemies = [e];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 16 }];
    const ev = updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies).toHaveLength(0); // 被击杀移除
    expect(s.kills).toBe(1);
    expect(s.xp).toBe(1);
    expect(s.bullets).toHaveLength(0); // 命中后子弹消失
    void ev;
  });

  it('非致命命中只扣血，敌人存活', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const e = enemy({ x: 500, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 16 }];
    updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].hp).toBe(84);
  });
});
