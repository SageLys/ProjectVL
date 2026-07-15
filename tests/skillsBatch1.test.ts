// 冒烟矩阵：跑真实 src/config/base/skills.json 的全部正式卡（非 fixture）。
// 逐卡具体行为断言（不是"跑过不报错"）见本文件（批次1）与 skillsBatch2.test.ts（批次2）。
// 对照 docs/P5_批次1_验收证据表.md / docs/P5_批次2_验收证据表.md。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cfg } from '../src/config';
import { registerSkillDefs, resolveConsumableTier, fireTrigger, getModifiers } from '../src/core/effects/interpreter';
import { tickEffects, absorbBreach } from '../src/core/effects/runtime';
import { shoot } from '../src/core/systems/combatSystem';
import { moveOrSwap, consumeCard } from '../src/core/systems/equipmentSystem';
import { killEnemy } from '../src/core/systems/damageSystem';
import { card, enemy, freshState, createDefaultConfig, constRng, resetTestEnv } from './helpers';
import type { GameEvent } from '../src/core/types';

const config = createDefaultConfig();
const rng = constRng(0.01);
const get = (id: string) => cfg.skills.cards.find(c => c.id === id)!;

function equip(type: string, star: number) {
  const s = freshState();
  s.cards[0] = card(type, star);
  expect(moveOrSwap(s, config, rng, 'cards', 0, 'equipment', 0).some(v => v.type === 'equipped')).toBe(true);
  return s;
}

beforeEach(() => { resetTestEnv(); registerSkillDefs(cfg.skills.cards); });
afterEach(resetTestEnv);

describe('冒烟矩阵（真实 skills.json，装备 3/4/5/6★ + 消耗 1–6★）', () => {
  it('全部正式卡 × 6 星级消耗 + 4 星级装备锚点全部可执行，输出证据表', () => {
    const table: Record<string, string | number>[] = [];
    for (const def of cfg.skills.cards) {
      for (let star = 1; star <= 6; star++) {
        const tier = resolveConsumableTier(def, star);
        const s = freshState(); s.cards[0] = card(def.id, star);
        const events = consumeCard(s, config, rng, 0, 300, 300);
        expect(events[0]).toMatchObject({ type: 'skillConsumed', star });
        table.push({ card: def.id, star, mode: 'consume', radius: tier.radius ?? 0, effects: tier.effects.map(e => e.atom).join('+') });
      }
      for (const star of [3, 4, 5, 6]) {
        const e = equip(def.id, star);
        table.push({ card: def.id, star, mode: 'equip', effects: '(见下方逐卡行为断言)' });
        void e;
      }
    }
    console.table(table);
    expect(table.filter(r => r.mode === 'consume')).toHaveLength(cfg.skills.cards.length * 6);
    expect(table.filter(r => r.mode === 'equip')).toHaveLength(cfg.skills.cards.length * 4);
  });
});

describe('pierce · 贯穿', () => {
  it('3★装备：onFire 子弹获得穿透+递增伤害参数', () => {
    const s = equip('pierce', 3);
    shoot(s, config, rng, enemy({ x: 600, y: 300 }));
    expect(s.bullets[0]).toMatchObject({ pierceLeft: 2, damageRetention: 0.8, rampPerPierce: 0.1 });
  });
  it('5★装备：额外获得场边反弹', () => {
    const s = equip('pierce', 5);
    shoot(s, config, rng, enemy({ x: 600, y: 300 }));
    expect(s.bullets[0].ricochetLeft).toBe(1);
  });
  it('1★消耗：沿炮台→落点释放巨型贯穿弹', () => {
    const s = freshState(); s.cards[0] = card('pierce', 1);
    const before = s.bullets.length;
    consumeCard(s, config, rng, 0, 500, 300);
    expect(s.bullets.length).toBe(before + 1);
    expect(s.bullets[s.bullets.length - 1].pierceLeft).toBeGreaterThan(100);
  });
});

describe('chainLightning · 连锁闪电', () => {
  it('3★装备：onHit 命中后向附近敌人连锁跳跃，并给命中目标附带减速', () => {
    const s = equip('chainLightning', 3);
    const hit = enemy({ x: 300, y: 300, hp: 100, maxHp: 100 });
    const near = enemy({ x: 340, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [hit, near];
    fireTrigger(s, config, rng, 'onHit', { bullet: { x: 300, y: 300, damage: 20 } as never, enemy: hit, point: { x: 300, y: 300 } });
    expect(near.hp).toBeLessThan(100); // 连锁跳跃命中附近敌人
    expect(hit.status.slow).not.toBeNull(); // 减速附加在命中目标身上
  });
  it('5★装备：击杀来源为 chain 时从死亡点重新起链', () => {
    const s = equip('chainLightning', 5);
    const chainVictim = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    const nearby = enemy({ x: 30, y: 0, hp: 100, maxHp: 100 });
    s.enemies = [nearby];
    killEnemy(s, config, rng, chainVictim, 'chain');
    expect(nearby.hp).toBeLessThan(100);
  });
});

describe('frost · 冰霜', () => {
  it('3★装备：onFire 子弹附带减速+叠层冻结', () => {
    const s = equip('frost', 3);
    const target = enemy({ x: 600, y: 300 });
    s.enemies = [target];
    shoot(s, config, rng, target);
    expect(s.bullets[0].riders?.some(r => r.atom === 'slow')).toBe(true);
    expect(s.bullets[0].riders?.some(r => r.atom === 'freeze')).toBe(true);
  });
  it('5★装备：冻结中被击杀时碎裂造成范围伤害', () => {
    const s = equip('frost', 5);
    const frozenVictim = enemy({ x: 0, y: 0, hp: 5, maxHp: 5 });
    frozenVictim.status.frozen = 1;
    const nearby = enemy({ x: 20, y: 0, hp: 100, maxHp: 100 });
    s.enemies = [nearby];
    killEnemy(s, config, rng, frozenVictim);
    expect(nearby.hp).toBeLessThan(100);
  });
  it('1★消耗：落点大范围冻结', () => {
    const s = freshState(); s.cards[0] = card('frost', 1);
    const target = enemy({ x: 300, y: 300 });
    s.enemies = [target];
    consumeCard(s, config, rng, 0, 300, 300);
    expect(target.status.frozen).toBeGreaterThan(0);
  });
});

describe('decoy · 诱饵', () => {
  it('3★装备：onWaveStart 生成诱饵图腾', () => {
    const s = equip('decoy', 3);
    fireTrigger(s, config, rng, 'onWaveStart', { wave: 1 });
    expect(s.summons).toHaveLength(1);
    expect(s.summons[0].kind).toBe('decoy');
  });
  it('5★装备：图腾摧毁后重生一次', () => {
    const s = equip('decoy', 5);
    fireTrigger(s, config, rng, 'onWaveStart', { wave: 1 });
    expect(s.summons).toHaveLength(1);
    s.summons[0].hp = 0;
    tickEffects(s, config, rng, 0.05);
    expect(s.summons).toHaveLength(1);
    expect(s.summons[0].respawned).toBe(true);
  });
  it('1★消耗：落点放置一个短命诱饵召唤物', () => {
    const s = freshState(); s.cards[0] = card('decoy', 1);
    consumeCard(s, config, rng, 0, 300, 300);
    expect(s.summons).toHaveLength(1);
    expect(s.summons[0].kind).toBe('decoy');
  });
});

describe('scorch · 灼痕', () => {
  it('3★装备：onHit 命中处留下灼烧区', () => {
    const s = equip('scorch', 3);
    const target = enemy({ x: 300, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [target];
    fireTrigger(s, config, rng, 'onHit', { bullet: { x: 300, y: 300, damage: 10 } as never, enemy: target, point: { x: 300, y: 300 } });
    expect(s.zones.length).toBeGreaterThan(0);
  });
  it('5★装备：灼烧区内附带易伤', () => {
    const s = equip('scorch', 5);
    const target = enemy({ x: 300, y: 300, hp: 100, maxHp: 100 });
    s.enemies = [target];
    fireTrigger(s, config, rng, 'onHit', { bullet: { x: 300, y: 300, damage: 10 } as never, enemy: target, point: { x: 300, y: 300 } });
    const zone = s.zones[0];
    expect(zone.effects.map(e => e.atom)).toContain('vulnerable');
  });
  it('1★消耗：落点燃海持续 DoT', () => {
    const s = freshState(); s.cards[0] = card('scorch', 1);
    consumeCard(s, config, rng, 0, 300, 300);
    expect(s.zones).toHaveLength(1);
  });
});

describe('harvest · 丰收', () => {
  it('3★装备：passive 掉率与掉落时限倍率提升', () => {
    const s = equip('harvest', 3);
    const mods = getModifiers(s);
    expect(mods.dropRateMul).toBeCloseTo(1.25);
    expect(mods.dropLifetimeMul).toBeCloseTo(1.25);
  });
  it('5★装备：过期掉落按 ratio 折算经验（expiryConvert 生效）', () => {
    const s = equip('harvest', 5);
    expect(getModifiers(s).expiryConvert).toMatchObject({ ratio: 0.5 });
  });
  it('1★消耗：落点掉落雨随机掉 2 张卡', () => {
    const s = freshState(); s.cards[0] = card('harvest', 1);
    consumeCard(s, config, rng, 0, 300, 300);
    expect(s.groundDrops).toHaveLength(2);
  });
});

describe('aegis · 庇护', () => {
  it('3★装备：onWaveStart 获得护盾', () => {
    const s = equip('aegis', 3);
    fireTrigger(s, config, rng, 'onWaveStart', { wave: 1 });
    expect(s.shield).toMatchObject({ hits: 2, maxHits: 2 });
  });
  it('5★装备：护盾破裂时触发新星', () => {
    const s = equip('aegis', 5);
    s.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: 10 };
    const bystander = enemy({ x: cfg.combat.turret.x, y: cfg.combat.turret.y, hp: 100, maxHp: 100 });
    s.enemies = [bystander];
    const events: GameEvent[] = [];
    absorbBreach(s, config, rng, 10, events);
    expect(bystander.hp).toBeLessThan(100);
  });
  it('1★消耗：立即获得护盾+落点击退', () => {
    const s = freshState(); s.cards[0] = card('aegis', 1);
    consumeCard(s, config, rng, 0, 300, 300);
    expect(s.shield).toMatchObject({ hits: 4 });
  });
});
