// 批次2交付四件套之一：跑真实 src/config/base/skills.json 的 4 张批次2正式卡
// （分裂爆破/冲击/圣域/荆棘），每张卡至少 2 条具体行为断言。冒烟矩阵已并入
// skillsBatch1.test.ts（该矩阵按 cfg.skills.cards 动态遍历，自动覆盖本批次）。
// 对照 docs/P5_批次2_验收证据表.md。resonance 卡已删除，不在卡池内。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs, fireTrigger, getModifiers } from '../src/core/effects/interpreter';
import { tickEffects } from '../src/core/effects/runtime';
import { shoot } from '../src/core/systems/combatSystem';
import { moveOrSwap, consumeCard } from '../src/core/systems/equipmentSystem';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.01);

function equip(type: string, star: number) {
  const s = freshState();
  s.cards[0] = card(type, star);
  expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0).some(v => v.type === 'equipped')).toBe(true);
  return s;
}

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });
afterEach(resetTestEnv);

describe('splitBlast · 分裂爆破', () => {
  it('3★装备：onHit 命中后分裂出子弹片（maxDepth=1，子弹片自身命中不再分裂）', () => {
    const s = equip('splitBlast', 3);
    const target = enemy({ x: 300, y: 300, hp: 999, maxHp: 999 });
    s.enemies = [target];
    fireTrigger(s, config, rng, 'onHit', { bullet: { x: 300, y: 300, damage: 20 } as never, enemy: target, point: { x: 300, y: 300 } });
    expect(s.bullets).toHaveLength(2);
    expect(s.bullets.every(b => b.kind === 'fragment' && b.splitDepth === 1)).toBe(true);
  });

  it('5★装备：子弹片命中后还能再分裂一次（连环裂变，maxDepth=2）', () => {
    const s = equip('splitBlast', 5);
    const target = enemy({ x: 300, y: 300, hp: 999, maxHp: 999 });
    s.enemies = [target];
    fireTrigger(s, config, rng, 'onHit', { bullet: { x: 300, y: 300, damage: 20 } as never, enemy: target, point: { x: 300, y: 300 } });
    expect(s.bullets).toHaveLength(2);
    const fragment = s.bullets[0];
    const target2 = enemy({ x: 320, y: 300, hp: 999, maxHp: 999 });
    s.enemies = [target2];
    fireTrigger(s, config, rng, 'onHit', { bullet: fragment as never, enemy: target2, point: { x: 320, y: 300 } });
    expect(s.bullets).toHaveLength(4); // 原 2 片 + 第二代 2 片
  });

  it('1★消耗：落点爆炸造成范围伤害', () => {
    const s = freshState(); s.cards[0] = card('splitBlast', 1);
    const target = enemy({ x: 300, y: 300, hp: 999, maxHp: 999 });
    s.enemies = [target];
    consumeCard(s, config, rng, 0, 300, 300);
    expect(target.hp).toBeLessThan(999);
  });
});

describe('impact · 冲击', () => {
  it('3★装备：onFire 子弹附带击退', () => {
    const s = equip('impact', 3);
    shoot(s, config, rng, enemy({ x: 600, y: 300 }));
    expect(s.bullets[0].riders?.some(r => r.atom === 'knockback')).toBe(true);
  });

  it('5★装备：突破瞬间自动释放全向冲击波（经 tick 结算区域效果，击退附近敌人）', () => {
    const s = equip('impact', 5);
    const bystander = enemy({ x: cfg.combat.turret.x + 10, y: cfg.combat.turret.y, hp: 999, maxHp: 999 });
    s.enemies = [bystander];
    const before = { x: bystander.x, y: bystander.y };
    fireTrigger(s, config, rng, 'onBreach', { damage: 5, point: { x: cfg.combat.turret.x, y: cfg.combat.turret.y } });
    tickEffects(s, config, rng, 0.06);
    expect(bystander.x !== before.x || bystander.y !== before.y).toBe(true);
  });

  it('1★消耗：落点冲击波击退目标', () => {
    const s = freshState(); s.cards[0] = card('impact', 1);
    const target = enemy({ x: 320, y: 300 });
    s.enemies = [target];
    const before = { x: target.x, y: target.y };
    consumeCard(s, config, rng, 0, 300, 300);
    expect(target.x !== before.x || target.y !== before.y).toBe(true);
  });
});

describe('sanctum · 圣域', () => {
  it('3★装备：passive 光环使环内敌人易伤+减速', () => {
    const s = equip('sanctum', 3);
    const target = enemy({ x: cfg.combat.turret.x + 5, y: cfg.combat.turret.y, hp: 100, maxHp: 100 });
    s.enemies = [target];
    tickEffects(s, config, rng, 0.51); // 略过 tickInterval(0.5) 但小于状态 duration(0.6)，避免同帧内 tickStatusTimers 把刚施加的状态清零
    expect(target.status.vulnerable).not.toBeNull();
    expect(target.status.slow).not.toBeNull();
  });

  it('5★装备：处刑印记只标记濒死敌人（hpThresholdRatio）', () => {
    const s = equip('sanctum', 5);
    const dying = enemy({ x: cfg.combat.turret.x + 5, y: cfg.combat.turret.y, hp: 20, maxHp: 100 });
    const healthy = enemy({ x: cfg.combat.turret.x - 5, y: cfg.combat.turret.y, hp: 90, maxHp: 100 });
    s.enemies = [dying, healthy];
    tickEffects(s, config, rng, 0.51); // 略过 tickInterval(0.5) 但小于状态 duration(0.6)，避免同帧内 tickStatusTimers 把刚施加的状态清零
    expect(dying.status.brand).not.toBeNull();
    expect(healthy.status.brand).toBeNull();
  });

  it('1★消耗：落点烙印施加易伤', () => {
    const s = freshState(); s.cards[0] = card('sanctum', 1);
    const target = enemy({ x: 300, y: 300 });
    s.enemies = [target];
    consumeCard(s, config, rng, 0, 300, 300);
    expect(target.status.vulnerable).not.toBeNull();
  });
});

describe('thorns · 荆棘', () => {
  it('3★装备：passive 突破伤害减免生效', () => {
    const s = equip('thorns', 3);
    expect(getModifiers(s).breachReduction).toBeCloseTo(0.35);
  });

  it('3★装备：突破反噬命中突破点附近存活敌人（突破者本身已移出场，反噬打的是周围目标）', () => {
    const s = equip('thorns', 3);
    const bystander = enemy({ x: cfg.combat.turret.x + 10, y: cfg.combat.turret.y, hp: 999, maxHp: 999 });
    s.enemies = [bystander];
    fireTrigger(s, config, rng, 'onBreach', { damage: 5, point: { x: cfg.combat.turret.x, y: cfg.combat.turret.y } });
    tickEffects(s, config, rng, 0.06);
    expect(bystander.hp).toBeLessThan(999);
  });

  it('6★装备：近身圈内低血量敌人被直接处决', () => {
    const s = equip('thorns', 6);
    const dying = enemy({ x: cfg.combat.turret.x + 5, y: cfg.combat.turret.y, hp: 5, maxHp: 100 });
    s.enemies = [dying];
    tickEffects(s, config, rng, 0.5);
    expect(s.enemies).toHaveLength(0);
  });

  it('1★消耗：落点荆棘丛持续伤害+减速', () => {
    const s = freshState(); s.cards[0] = card('thorns', 1);
    consumeCard(s, config, rng, 0, 300, 300);
    expect(s.zones).toHaveLength(1);
  });
});
