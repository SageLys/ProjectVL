// 效果原子库单测：直接驱动 ATOMS 处理器 + 状态系统冲突仲裁。
import { describe, it, expect, beforeEach } from 'vitest';
import { ATOMS, type EffectCtx } from '../src/core/effects/registry';
import {
  CONFLICT_RULES, applyFreeze, applySlow, applyStun, applyVulnerable,
  applyKnockback, damageTakenMultiplier, isImmobile, speedMultiplier, tickStatusTimers,
} from '../src/core/effects/statusSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import { cfg } from '../src/config';
import type { GameState } from '../src/core/types';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

function ctxFor(state: GameState, over: Partial<EffectCtx> = {}): EffectCtx {
  return { state, config, rng, events: [], origin: { x: 480, y: 300 }, star: 2, baseDamage: 10, ...over };
}

describe('状态系统 · 冲突仲裁表', () => {
  it('仲裁表集中声明（正交性约束）', () => {
    expect(CONFLICT_RULES.length).toBeGreaterThanOrEqual(6);
  });

  it('冻结/眩晕 → 不可移动，速度=0', () => {
    const e = enemy();
    applyFreeze(e, 1);
    expect(isImmobile(e)).toBe(true);
    expect(speedMultiplier(e)).toBe(0);
    const e2 = enemy();
    applyStun(e2, 1);
    expect(speedMultiplier(e2)).toBe(0);
  });

  it('减速多来源取最强不叠乘；易伤同理', () => {
    const e = enemy();
    applySlow(e, 0.3, 1);
    applySlow(e, 0.5, 2);
    applySlow(e, 0.2, 3);
    expect(speedMultiplier(e)).toBeCloseTo(0.5);
    applyVulnerable(e, 0.2, 1);
    applyVulnerable(e, 0.4, 1);
    expect(damageTakenMultiplier(e)).toBeCloseTo(1.4);
  });

  it('冻结中击退无效（规则2）', () => {
    const s = freshState();
    const e = enemy({ x: 500, y: 300, hp: 100, maxHp: 100 });
    applyFreeze(e, 2);
    s.enemies = [e];
    ATOMS.knockback(ctxFor(s), { distance: 80, radius: 100 });
    expect(e.x).toBe(500);
  });

  it('易伤放大 dealDamage', () => {
    const s = freshState();
    const e = enemy({ hp: 100, maxHp: 100 });
    applyVulnerable(e, 0.5, 2);
    s.enemies = [e];
    dealDamage(s, config, rng, e, 10);
    expect(e.hp).toBe(85); // 10 × 1.5
  });
});

describe('弹道原子', () => {
  it('pierce：bullet 上下文写入穿透参数', () => {
    const s = freshState();
    const bullet = { x: 0, y: 0, vx: 0, vy: 0, r: 4, life: 1, damage: 10 };
    ATOMS.pierce(ctxFor(s, { bullet }), { count: 2, damageRetention: 0.7 });
    expect(bullet).toMatchObject({ pierceLeft: 2, damageRetention: 0.7 });
  });

  it('pierce：消耗上下文沿炮台→落点轴发射贯穿弹', () => {
    const s = freshState();
    ATOMS.pierce(ctxFor(s, { consume: true, origin: { x: 700, y: 300 } }), { damageMul: 3 });
    expect(s.bullets).toHaveLength(1);
    expect(s.bullets[0].pierceLeft).toBe(999);
    expect(s.bullets[0].vx).toBeGreaterThan(0);
    expect(s.bullets[0].damage).toBe(30);
  });

  it('chain：从命中敌人向附近弹跳，伤害按保留比衰减', () => {
    const s = freshState();
    const a = enemy({ x: 400, y: 300, hp: 100, maxHp: 100 });
    const b = enemy({ x: 460, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [a, b];
    const bullet = { x: 400, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 20 };
    ATOMS.chain(ctxFor(s, { enemy: a, bullet }), { bounces: 1, damageRetention: 0.5, searchRange: 120 });
    expect(a.hp).toBe(100);  // onHit 情形：子弹伤害已结算，chain 不重复打起点
    expect(b.hp).toBe(90);   // 20 × 0.5
  });

  it('split：命中点炸出分裂片（fragment 不再分裂）', () => {
    const s = freshState();
    const e = enemy({ x: 400, y: 300, hp: 100, maxHp: 100 });
    const bullet = { x: 400, y: 300, vx: 0, vy: 0, r: 4, life: 1, damage: 20 };
    ATOMS.split(ctxFor(s, { enemy: e, bullet }), { count: 3, damageRatio: 0.5 });
    expect(s.bullets).toHaveLength(3);
    expect(s.bullets.every(b => b.kind === 'fragment' && b.damage === 10)).toBe(true);
  });

  it('ricochet：写入场边反弹次数', () => {
    const s = freshState();
    const bullet = { x: 0, y: 0, vx: 0, vy: 0, r: 4, life: 1, damage: 10 };
    ATOMS.ricochet(ctxFor(s, { bullet }), { bounces: 2 });
    expect(bullet).toMatchObject({ ricochetLeft: 2 });
  });

  it('aoeOnHit：命中点小范围爆炸（含衰减）', () => {
    const s = freshState();
    const center = enemy({ x: 400, y: 300, hp: 100, maxHp: 100 });
    const edge = enemy({ x: 460, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [center, edge];
    ATOMS.aoeOnHit(ctxFor(s, { origin: { x: 400, y: 300 } }), { radius: 80, damageRatio: 1, falloff: 0.5 });
    expect(center.hp).toBe(90);            // 满额 10
    expect(edge.hp).toBeGreaterThan(90);   // 边缘衰减
    expect(edge.hp).toBeLessThan(100);
  });

  it('beamMorph：触发式=沿轴线打穿带宽内全部敌人', () => {
    const s = freshState();
    const onLine1 = enemy({ x: 600, y: 300, hp: 100, maxHp: 100 });
    const onLine2 = enemy({ x: 620, y: 305, hp: 100, maxHp: 100 }); // 距 origin(480) 140 < range 150（基线已把 range 焙进 base）
    const off = enemy({ x: 600, y: 420, hp: 100, maxHp: 100 });
    s.enemies = [onLine1, onLine2, off];
    ATOMS.beamMorph(ctxFor(s, { enemy: onLine1 }), { width: 26, damageRatio: 1 });
    expect(onLine1.hp).toBe(90);
    expect(onLine2.hp).toBe(90);
    expect(off.hp).toBe(100);
  });

  it('mortarMorph：触发式=落点榴弹爆炸', () => {
    const s = freshState();
    const e = enemy({ x: 200, y: 200, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.mortarMorph(ctxFor(s, { origin: { x: 200, y: 200 } }), { radius: 90, damageRatio: 1.2, falloff: 0.5 });
    expect(e.hp).toBe(88); // 10 × 1.2 满额
  });
});

describe('控制原子', () => {
  it('freeze/stun 按敌人类型缩短硬控时长，普通敌人保持全额', () => {
    const boss = enemy({ type: 'boss' });
    const normal = enemy({ type: 'normal' });

    applyFreeze(boss, 0.8);
    applyFreeze(normal, 0.8);
    expect(boss.status.frozen).toBeCloseTo(0.4);
    expect(normal.status.frozen).toBeCloseTo(0.8);

    applyStun(boss, 0.8);
    applyStun(normal, 0.8);
    expect(boss.status.stunned).toBeCloseTo(0.4);
    expect(normal.status.stunned).toBeCloseTo(0.8);
  });

  it('冻结自然到期后开启免疫窗、清空冻结层，窗口内免疫 freeze/stun', () => {
    const s = freshState();
    const e = enemy();
    s.enemies = [e];

    applyFreeze(e, 0.8);
    applyFreeze(e, 0.8, 3);
    applyFreeze(e, 0.8, 3);
    expect(e.status.freezeStacks).toBe(2);
    tickStatusTimers(s, 0.8);

    expect(e.status.frozen).toBe(0);
    expect(e.status.ccImmune).toBeCloseTo(cfg.combat.ccImmunity.afterFreezeSeconds);
    expect(e.status.freezeStacks).toBe(0);

    applyFreeze(e, 0.8, 3);
    applyStun(e, 0.8);
    expect(e.status.frozen).toBe(0);
    expect(e.status.stunned).toBe(0);
    expect(e.status.freezeStacks).toBe(0);

    tickStatusTimers(s, cfg.combat.ccImmunity.afterFreezeSeconds);
    applyFreeze(e, 0.8, 3);
    expect(e.status.freezeStacks).toBe(1);
  });

  it('眩晕自然到期后开启对应免疫窗', () => {
    const s = freshState();
    const e = enemy();
    s.enemies = [e];
    applyStun(e, 0.5);

    tickStatusTimers(s, 0.5);

    expect(e.status.stunned).toBe(0);
    expect(e.status.ccImmune).toBeCloseTo(cfg.combat.ccImmunity.afterStunSeconds);
  });

  it('slow 不受 ccResist 或 ccImmune 影响', () => {
    const boss = enemy({ type: 'boss' });
    boss.status.ccImmune = 1;

    applySlow(boss, 0.3, 1.5);

    expect(boss.status.slow).toEqual({ ratio: 0.3, remaining: 1.5 });
    expect(speedMultiplier(boss)).toBeCloseTo(0.7);
  });

  it('frost 3★ 持续命中 Boss 时存在解控后的行动窗口', () => {
    const s = freshState();
    const boss = enemy({ type: 'boss' });
    s.enemies = [boss];
    const shotInterval = 1 / 5;
    let observedActionWindow = false;
    let observedRefreeze = false;

    for (let shot = 0; shot < 30; shot++) {
      applyFreeze(boss, 0.8, 3);
      tickStatusTimers(s, shotInterval);
      if (boss.status.frozen === 0 && boss.status.ccImmune > 0) observedActionWindow = true;
      if (observedActionWindow && boss.status.frozen > 0) observedRefreeze = true;
    }

    expect(observedActionWindow).toBe(true);
    expect(observedRefreeze).toBe(true);
  });

  it('slow/stun/freeze（叠层触发）作用于半径内目标', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.slow(ctxFor(s), { ratio: 0.4, duration: 2, radius: 100 });
    expect(speedMultiplier(e)).toBeCloseTo(0.6);
    ATOMS.stun(ctxFor(s), { duration: 0.5, radius: 100 });
    expect(isImmobile(e)).toBe(true);
    const e2 = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e2];
    ATOMS.freeze(ctxFor(s), { duration: 1, stacksToTrigger: 2, radius: 100 });
    expect(e2.status.frozen).toBe(0); // 第一层不触发
    ATOMS.freeze(ctxFor(s), { duration: 1, stacksToTrigger: 2, radius: 100 });
    expect(e2.status.frozen).toBe(1); // 叠满冻结
  });

  it('knockback：从 origin 推开', () => {
    const s = freshState();
    const t = cfg.combat.turret;
    const e = enemy({ x: t.x + 40, y: t.y, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.knockback(ctxFor(s, { origin: t }), { distance: 60, radius: 100 });
    expect(e.x).toBe(t.x + 100);
  });

  it('knockback: boss 类型抗性将 60px 击退降为 9px', () => {
    const e = enemy({ type: 'boss', x: 100, y: 0 });
    expect(applyKnockback(e, 0, 0, 60)).toBe(true);
    expect(e.x).toBeCloseTo(109);
  });

  it('knockback: 短窗口内连续递减，窗口过期后重置', () => {
    const s = freshState();
    const e = enemy({ x: 100, y: 0 });
    s.enemies = [e];

    const positions: number[] = [];
    for (let i = 0; i < 3; i++) {
      applyKnockback(e, 0, 0, 60);
      positions.push(e.x);
    }

    expect(positions[0] - 100).toBeCloseTo(60);
    expect(positions[1] - positions[0]).toBeCloseTo(30);
    expect(positions[2] - positions[1]).toBeCloseTo(15);

    tickStatusTimers(s, 2.01);
    expect(e.status.kbFatigue).toBeNull();
    const beforeResetHit = e.x;
    applyKnockback(e, 0, 0, 60);
    expect(e.x - beforeResetHit).toBeCloseTo(60);
  });

  it('knockback: 冻结中返回 false 且不产生疲劳', () => {
    const e = enemy({ x: 100, y: 0 });
    applyFreeze(e, 1);
    expect(applyKnockback(e, 0, 0, 60)).toBe(false);
    expect(e.x).toBe(100);
    expect(e.status.kbFatigue).toBeNull();
  });

  it('impact 3★: Boss 在 5 发/秒下持续逼近，不再卡在射程边缘', () => {
    const s = freshState();
    const boss = enemy({ type: 'boss', x: 150, y: 0, speed: 20 });
    s.enemies = [boss];
    const shotInterval = 1 / 5;
    let previousDistance = boss.x;

    for (let shot = 0; shot < 12; shot++) {
      boss.x -= boss.speed * shotInterval;
      const beforeKnockback = boss.x;
      expect(applyKnockback(boss, 0, 0, 22)).toBe(true);
      expect(boss.x - beforeKnockback).toBeLessThan(boss.speed * shotInterval);
      expect(boss.x).toBeLessThan(previousDistance);
      previousDistance = boss.x;
      tickStatusTimers(s, shotInterval);
    }
  });

  it('taunt：半径内敌人移动目标改为落点', () => {
    const s = freshState();
    const e = enemy({ x: 500, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.taunt(ctxFor(s, { origin: { x: 520, y: 300 } }), { radius: 120, duration: 3 });
    expect(e.status.taunt).toMatchObject({ x: 520, y: 300 });
  });

  it('vulnerable + focusPriority（烙印）', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.vulnerable(ctxFor(s), { ratio: 0.3, duration: 2, radius: 100 });
    expect(damageTakenMultiplier(e)).toBeCloseTo(1.3);
    ATOMS.focusPriority(ctxFor(s), { priorityWeight: 2, radius: 100 });
    expect(e.status.brand?.weight).toBe(2);
  });
});

describe('领域/经济/防御/共用原子', () => {
  it('groundZone：创建区域；消耗态时长 R4 封顶 5s', () => {
    const s = freshState();
    ATOMS.groundZone(ctxFor(s, { consume: true, origin: { x: 100, y: 100 } }), { radius: 90, duration: 9, tickInterval: 0.5, effects: [] });
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0].remaining).toBe(5);
  });

  it('dot：直接施加 → 挂状态；zoneTick → 每跳直接掉血', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.dot(ctxFor(s), { damagePerTick: 5, tickInterval: 0.5, duration: 2, radius: 100 });
    expect(e.status.dots).toHaveLength(1);
    expect(e.status.dots[0].dps).toBe(10);
    ATOMS.dot(ctxFor(s, { zoneTick: true, enemy: e }), { damagePerTick: 5, tickInterval: 0.5 });
    expect(e.hp).toBe(95);
  });

  it('summon：生成诱饵图腾（嘲讽半径/到期爆炸参数）', () => {
    const s = freshState();
    ATOMS.summon(ctxFor(s, { origin: { x: 200, y: 200 } }), { kind: 'decoy', hp: 40, duration: 4, tauntRadius: 140, explode: true });
    expect(s.summons).toHaveLength(1);
    expect(s.summons[0]).toMatchObject({ kind: 'decoy', hp: 40, tauntRadius: 140 });
    expect(s.summons[0].explodeOnDeath).not.toBeNull();
  });

  it('extraDrop：按权重掉星，且不超掉落星级策略上限（3★ 永不直掉）', () => {
    const s = freshState();
    ATOMS.extraDrop(ctxFor(s, { origin: { x: 300, y: 300 } }), { count: 2, starWeights: { '3': 1 } });
    expect(s.groundDrops).toHaveLength(2);
    for (const d of s.groundDrops) expect(d.star).toBeLessThanOrEqual(2);
  });

  it('extraDrop keeps uniform card-type selection independent of build investment', () => {
    const s = freshState();
    s.equipment[0] = card('pierce', 6);
    ATOMS.extraDrop(ctxFor(s, { rng: constRng(0.99) }), { count: 1, starWeights: { '1': 1 } });
    expect(s.groundDrops[0]).toEqual(expect.objectContaining({ type: 'thorns', star: 1 }));
    expect(s.normalDropDirector.ordinaryDropCount).toBe(0);
  });

  it('shield：写入护盾状态（取更强者）', () => {
    const s = freshState();
    ATOMS.shield(ctxFor(s), { absorbHits: 2, regenSeconds: 10 });
    expect(s.shield).toMatchObject({ hits: 2, maxHits: 2, regenSeconds: 10 });
    ATOMS.shield(ctxFor(s), { absorbHits: 1 });
    expect(s.shield!.hits).toBe(2); // 不被弱盾覆盖
  });

  it('execute：低于血线处决（击杀结算生效）', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 10, maxHp: 100, xp: 1 });
    s.enemies = [e];
    ATOMS.execute(ctxFor(s), { hpThresholdRatio: 0.15, radius: 100 });
    expect(s.enemies).toHaveLength(0);
    expect(s.kills).toBe(1);
  });

  it('burstDamage：落点即时范围伤害', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.burstDamage(ctxFor(s), { damageMul: 3, radius: 100 });
    expect(e.hp).toBe(70);
  });

  it('mergePulse：伤害 = 系数 × 合成结果星级', () => {
    const s = freshState();
    const e = enemy({ x: 480, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [e];
    ATOMS.mergePulse(ctxFor(s, { merge: { cardType: 'damage', resultStar: 3 } }), { damagePerMergeCount: 5, radius: 'all' });
    expect(e.hp).toBe(85); // 5 × 3
  });
});
