import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import {
  acceptBountyAt,
  findBountyOfferAt,
  settleRemovedBounty,
  tickBountyOffers,
} from '../src/core/systems/bountySystem';
import { findTarget } from '../src/core/systems/combatSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import { collectDrop, tickDrops } from '../src/core/systems/dropSystem';
import { spawnEnemy } from '../src/core/systems/enemySystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import { applyBrand } from '../src/core/effects/statusSystem';
import {
  constRng,
  createDefaultConfig,
  enemy,
  freshState,
  resetTestEnv,
} from './helpers';

beforeEach(resetTestEnv);

describe('bountySystem · 生成与可选窗口', () => {
  it('从指定波次按每波概率生成至多一个普通 bounty，并发出 offer 事件', () => {
    const s = freshState();
    const config = createDefaultConfig();
    s.wave = 2;

    startNextWave(s, config, constRng(0.5)); // 0.5 < base 0.55
    expect(s.bountyWavePending).toBe(true);
    const events = spawnEnemy(s, constRng(0)); // 原 roll 会是 tank；赏金载体强制为未强化的 normal

    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]).toMatchObject({ type: 'normal', bounty: { phase: 'offered', remaining: 8 } });
    expect(s.enemies[0].hp).toBe(cfg.enemies.types.normal.hpBase + 3 * cfg.enemies.types.normal.hpPerWave);
    expect(s.bountyWavePending).toBe(false);
    expect(s.bountyOffered).toBe(1);
    expect(events).toEqual([{ type: 'bountyOffered', enemyId: s.enemies[0].id, windowSeconds: 8 }]);

    spawnEnemy(s, constRng(0.8));
    expect(s.enemies.filter(candidate => candidate.bounty)).toHaveLength(1);
  });

  it('概率未命中、机制关闭或低于启用波次时不产生 offer', () => {
    const config = createDefaultConfig();
    const missed = freshState();
    missed.wave = 2;
    startNextWave(missed, config, constRng(0.99));
    expect(missed.bountyWavePending).toBe(false);

    const early = freshState();
    early.wave = 1;
    startNextWave(early, config, constRng(0));
    expect(early.bountyWavePending).toBe(false);

    cfg.skills.mechanisms.bounty.enabled = false;
    const disabled = freshState();
    disabled.wave = 2;
    startNextWave(disabled, config, constRng(0));
    expect(disabled.bountyWavePending).toBe(false);
  });

  it('8 秒窗口超时只撤销标记，不改变 HP/速度且不施加惩罚', () => {
    const s = freshState();
    const target = enemy({ x: 200, y: 180, hp: 70, maxHp: 100, speed: 23 });
    target.bounty = { phase: 'offered', remaining: 0.2 };
    s.enemies = [target];

    const events = tickBountyOffers(s, 0.21);
    expect(target.bounty).toBeUndefined();
    expect(target).toMatchObject({ hp: 70, maxHp: 100, speed: 23 });
    expect(s.bountyExpired).toBe(1);
    expect(events).toEqual([{ type: 'bountyExpired', enemyId: target.id, reason: 'timeout' }]);
  });
});

describe('bountySystem · 点击接单与主动风险', () => {
  it('画布命中查询只返回可接单目标；接单保持血量比例并施加 HP/速度狂暴', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const target = enemy({ x: 220, y: 180, r: 18, hp: 50, maxHp: 100, speed: 20 });
    target.bounty = { phase: 'offered', remaining: 4 };
    s.enemies = [target];

    expect(cfg.skills.mechanisms.bounty.hitRadiusPadding).toBe(12); // 显式 T1 标定旋钮
    expect(findBountyOfferAt(s, 239, 180)).toBe(target); // r18 + padding12
    expect(findBountyOfferAt(s, 260, 180)).toBeNull();
    expect(acceptBountyAt(s, config, 220, 180)).toEqual([{ type: 'bountyAccepted', enemyId: target.id }]);
    expect(target.bounty).toEqual({ phase: 'accepted', remaining: 0 });
    expect(target.hp).toBe(50 * cfg.skills.mechanisms.bounty.acceptEffects.enrage.hpMul);
    expect(target.maxHp).toBe(100 * cfg.skills.mechanisms.bounty.acceptEffects.enrage.hpMul);
    expect(target.hp / target.maxHp).toBe(0.5);
    expect(target.speed).toBe(20 * cfg.skills.mechanisms.bounty.acceptEffects.enrage.speedMul);
    expect(s.bountyAccepted).toBe(1);
    expect(acceptBountyAt(s, config, 220, 180)).toEqual([]); // 不可重复强化
  });

  it('暂停时不能接单', () => {
    const s = freshState();
    const target = enemy({ x: 220, y: 180 });
    target.bounty = { phase: 'offered', remaining: 4 };
    s.enemies = [target];
    s.paused = true;
    expect(acceptBountyAt(s, createDefaultConfig(), 220, 180)).toEqual([]);
    expect(target.bounty?.phase).toBe('offered');
  });

  it('只有已接单目标离场才计为 bounty 失败，且不附加额外惩罚', () => {
    const s = freshState();
    const accepted = enemy({ damage: 9 });
    accepted.bounty = { phase: 'accepted', remaining: 0 };
    expect(settleRemovedBounty(s, accepted, 'breach')).toEqual([
      { type: 'bountyFailed', enemyId: accepted.id, reason: 'breach' },
    ]);
    expect(s.bountyFailed).toBe(1);
    expect(accepted.damage).toBe(9); // 机制不偷偷追加突破伤害

    const offered = enemy();
    offered.bounty = { phase: 'offered', remaining: 3 };
    expect(settleRemovedBounty(s, offered, 'summon')).toEqual([
      { type: 'bountyExpired', enemyId: offered.id, reason: 'summon' },
    ]);
    expect(s.bountyFailed).toBe(1);
    expect(s.bountyExpired).toBe(1);
  });

  it('接单 bounty 的索敌优先级高于烙印和最近敌人', () => {
    const s = freshState();
    const config = createDefaultConfig();
    const near = enemy({ x: 500, y: 300 });
    const branded = enemy({ x: 560, y: 300 });
    const bounty = enemy({ x: 620, y: 300 });
    applyBrand(branded, 99, 5);
    bounty.bounty = { phase: 'accepted', remaining: 0 };
    s.enemies = [near, branded, bounty];
    expect(findTarget(s, config)).toBe(bounty);

    bounty.bounty = { phase: 'offered', remaining: 5 };
    expect(findTarget(s, config)).toBe(branded); // 未接单不劫持索敌
  });
});

describe('bountySystem · 击杀与肥而急奖励', () => {
  it('接单目标死亡生成固定 dropCount 奖励、星级受上限约束、寿命乘配置', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 1; // 验证赏金奖励取代普通概率掉落，不额外生成第三张
    const target = enemy({ x: 240, y: 160, hp: 1, maxHp: 10, xp: 0 });
    target.bounty = { phase: 'accepted', remaining: 0 };
    s.enemies = [target];

    const events = dealDamage(s, config, constRng(0), target, 5);
    expect(s.groundDrops).toHaveLength(cfg.skills.mechanisms.bounty.rewards.dropCount);
    expect(s.groundDrops.every(drop => drop.source === 'bounty')).toBe(true);
    expect(s.groundDrops.every(drop => drop.star <= cfg.economy.dropStarPolicy.bountyBossMax)).toBe(true);
    expect(s.groundDrops.every(drop => drop.life === config.dropLifetime * 0.6)).toBe(true);
    expect(s.bountyCompleted).toBe(1);
    expect(s.bountyRewardDrops).toBe(2);
    expect(events).toContainEqual({ type: 'bountyCompleted', enemyId: target.id, dropCount: 2 });

    const pickup = collectDrop(s, config, constRng(0.99), s.groundDrops[0]);
    expect(s.bountyRewardCollected).toBe(1);
    expect(pickup).toContainEqual(expect.objectContaining({ type: 'bountyRewardCollected' }));
    const expired = tickDrops(s, config, constRng(0.99), config.dropLifetime);
    expect(s.bountyRewardExpired).toBe(1);
    expect(expired).toContainEqual(expect.objectContaining({ type: 'bountyRewardExpired' }));
  });

  it('未接单目标被击杀仍按普通敌人结算，不生成赏金奖励', () => {
    const s = freshState();
    const config = createDefaultConfig();
    config.dropChance = 0;
    const target = enemy({ hp: 1, maxHp: 10, xp: 0 });
    target.bounty = { phase: 'offered', remaining: 5 };
    s.enemies = [target];

    const events = dealDamage(s, config, constRng(0.99), target, 5);
    expect(s.groundDrops).toHaveLength(0);
    expect(s.bountyCompleted).toBe(0);
    expect(s.bountyRewardDrops).toBe(0);
    expect(events).toContainEqual({ type: 'bountyExpired', enemyId: target.id, reason: 'killed' });
  });
});
