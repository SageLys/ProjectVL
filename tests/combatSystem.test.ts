import { describe, it, expect, beforeEach } from 'vitest';
import { findTarget, shoot, updateBullets } from '../src/core/systems/combatSystem';
import { maxAttackRange, totalMulti, totalRange } from '../src/core/stats';
import { applyBrand } from '../src/core/effects/statusSystem';
import type { BountyEncounter } from '../src/core/types';
import { enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

beforeEach(resetTestEnv);

describe('combatSystem · 锁定', () => {
  it('锁定射程内最近的敌人', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const near = enemy({ x: 380, y: 365 });
    const far = enemy({ x: 390, y: 365 });
    s.enemies = [far, near];
    expect(findTarget(s, config)).toBe(near);
  });

  it('射程外的敌人不锁定', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.range = 430;
    s.enemies = [enemy({ x: 701, y: 365 })];
    expect(findTarget(s, config)).toBeNull();
  });

  it('攻击范围在屏幕边缘保留预判区域', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.range = 600;

    expect(maxAttackRange()).toBe(210);
    expect(totalRange(s, config)).toBe(210);
    s.enemies = [enemy({ x: 490, y: 365 })]; // 距中心 220，仍在屏幕内的预判带
    expect(findTarget(s, config)).toBeNull();
  });

  it('烙印（focusPriority）权重优先于最近（仲裁规则5）', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const near = enemy({ x: 380, y: 365 });
    const branded = enemy({ x: 410, y: 365 });
    applyBrand(branded, 2, 4);
    s.enemies = [near, branded];
    expect(findTarget(s, config)).toBe(branded);
  });

  it('紧急普通敌人 > 活跃 Bounty > 烙印 > 最近', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const emergency = enemy({ x: 330, y: 365 });
    const bounty = enemy({ x: 380, y: 365, bountyEncounterId: 1, bountyRewardType: 'frost' });
    const branded = enemy({ x: 410, y: 365 });
    const nearest = enemy({ x: 370, y: 365 });
    applyBrand(branded, 10, 4);
    s.bountyEncounters.push({ id: 1, offerId: 1, rewardCardType: 'frost', rewardCardStar: 1, rewardCardCount: 1, wildcardStar: 1, wildcardCount: 1, side: 'top', status: 'active', memberIds: [bounty.id], pendingSpawnCount: 0, spawnTimer: 0, guaranteed: false, acceptedAt: 0, hpAtAccept: 100, lastKillX: 0, lastKillY: 0 });
    s.enemies = [nearest, branded, bounty, emergency];
    expect(findTarget(s, config)).toBe(emergency);
    s.enemies = [nearest, branded, bounty];
    expect(findTarget(s, config)).toBe(bounty);
    s.enemies = [nearest, branded];
    expect(findTarget(s, config)).toBe(branded);
    s.enemies = [nearest];
    expect(findTarget(s, config)).toBe(nearest);
  });

  it('Bounty 成员仍须在射程内', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const bounty = enemy({ x: 510, y: 365, bountyEncounterId: 1 });
    const regular = enemy({ x: 380, y: 365 });
    s.bountyEncounters.push({ id: 1, offerId: 1, rewardCardType: 'frost', rewardCardStar: 1, rewardCardCount: 1, wildcardStar: 1, wildcardCount: 1, side: 'top', status: 'active', memberIds: [bounty.id], pendingSpawnCount: 0, spawnTimer: 0, guaranteed: false, acceptedAt: 0, hpAtAccept: 100, lastKillX: 0, lastKillY: 0 });
    s.enemies = [bounty, regular];
    expect(findTarget(s, config)).toBe(regular);
  });

  it('failed Encounter 标记不再获得优先级；多名活跃成员取最近', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const nearBounty = enemy({ x: 380, y: 365, bountyEncounterId: 1 });
    const farBounty = enemy({ x: 410, y: 365, bountyEncounterId: 1 });
    const branded = enemy({ x: 415, y: 365 });
    applyBrand(branded, 4, 4);
    const encounter: BountyEncounter = { id: 1, offerId: 1, rewardCardType: 'frost', rewardCardStar: 1, rewardCardCount: 1, wildcardStar: 1, wildcardCount: 1, side: 'top', status: 'active', memberIds: [nearBounty.id, farBounty.id], pendingSpawnCount: 0, spawnTimer: 0, guaranteed: false, acceptedAt: 0, hpAtAccept: 100, lastKillX: 0, lastKillY: 0 };
    s.bountyEncounters.push(encounter);
    s.enemies = [farBounty, branded, nearBounty];
    expect(findTarget(s, config)).toBe(nearBounty);
    encounter.status = 'failed';
    expect(findTarget(s, config)).toBe(branded);
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
    s.enemies = [enemy({ x: 500, y: 300, hp: 10, maxHp: 10, xp: 1 })];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 16 }];
    updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies).toHaveLength(0);
    expect(s.kills).toBe(1);
    expect(s.xp).toBe(1);
    expect(s.bullets).toHaveLength(0);
  });

  it('非致命命中只扣血，敌人存活', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.enemies = [enemy({ x: 500, y: 300, hp: 100, maxHp: 100 })];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 16 }];
    updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].hp).toBe(84);
  });

  it('穿透弹：命中不消耗，伤害按保留比衰减，且不重复命中同一敌人', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const a = enemy({ x: 500, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [a];
    s.bullets = [{ x: 500, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 20, pierceLeft: 2, damageRetention: 0.5, hitIds: [] }];
    updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies[0].hp).toBe(80);       // 命中一次
    expect(s.bullets).toHaveLength(1);      // 未消耗
    expect(s.bullets[0].damage).toBe(10);   // 20 × 0.5
    updateBullets(s, config, constRng(0.99), 0.016);
    expect(s.enemies[0].hp).toBe(80);       // hitIds 防重复命中
  });
});
