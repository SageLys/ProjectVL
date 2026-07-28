import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef, EffectDef } from '../src/core/effects/defs';
import { composeWeaponForm, getModifiers, registerSkillDefs } from '../src/core/effects/interpreter';
import { ATOMS, type EffectCtx } from '../src/core/effects/registry';
import { tickEffects } from '../src/core/effects/runtime';
import { dealDamage } from '../src/core/systems/damageSystem';
import { shoot, updateBullets, updateTurret } from '../src/core/systems/combatSystem';
import type { CardType, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, fixtureEvolutionTree, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

function skill(id: CardType, bindings: BindingDef[]): CardDef {
  const consume: EffectDef[] = [{ atom: 'burstDamage', params: { damageMul: 1, radius: 10 } }];
  return {
    id, category: 'projectile', synergyTags: ['projectile'], textKey: `t.${id}`, teaching: false,
    stars: {
      '3': { tier: 'core', equip: structuredClone(bindings) },
      '5': { tier: 'dual', equip: structuredClone(bindings) },
      '6': { tier: 'transform', equip: structuredClone(bindings) },
    },
    amplifyAxis: { params: { damageRatio: '+0' } },
    evolutionTree: fixtureEvolutionTree(id, bindings),
    consumable: { placement: 'point', anchors: {
      '1': { effects: consume }, '3': { effects: consume }, '6': { effects: consume },
    } },
  };
}

const beamSkill = () => skill('pierce', [{ trigger: 'passive', effects: [{
  atom: 'beamMorph', params: { interval: 0.9, duration: 0.6, tickInterval: 0.1, width: 32, damageRatio: 1 },
}] }]);

const mortarSkill = () => skill('splitBlast', [{ trigger: 'passive', effects: [{
  atom: 'mortarMorph', params: { radius: 80, damageRatio: 1, falloff: 0.5 },
}] }]);

function equip(state: GameState, type: CardType, star = 3, slot?: number): void {
  const index = slot ?? state.equipment.findIndex(value => value === null);
  state.equipment[index] = card(type, star);
}

function emitBeam(state: GameState): void {
  state.intervalClocks['weapon:line'] = 0;
  updateTurret(state, config, rng, 0);
  expect(state.beams).toHaveLength(1);
}

describe('weaponForm 正交融合', () => {
  it('正式两张 6★ 形态卡融合为 line + 衰减 aoe', () => {
    registerSkillDefs(cfg.skills.cards);
    const state = freshState();
    equip(state, 'pierce', 6);
    equip(state, 'splitBlast', 6);
    const spec = composeWeaponForm(getModifiers(state).weaponForms);
    expect(spec.delivery).toBe('line');
    expect(spec.deliveryDamageRatio).toBe(1);
    expect(spec.impacts[0]).toMatchObject({
      sourceCardType: 'splitBlast', sourceStar: 6,
      damageRatio: 1.3,
      radius: 90,
    });
  });

  it('双形态按 cardType 排序，交换装备槽得到完全相同 spec', () => {
    registerSkillDefs([beamSkill(), mortarSkill()]);
    const first = freshState();
    equip(first, 'pierce', 6, 0);
    equip(first, 'splitBlast', 6, 1);
    const second = freshState();
    equip(second, 'splitBlast', 6, 0);
    equip(second, 'pierce', 6, 1);

    const a = composeWeaponForm(getModifiers(first).weaponForms);
    const b = composeWeaponForm(getModifiers(second).weaponForms);
    expect(a).toEqual(b);
    expect(a.delivery).toBe('line');
    expect(a.impacts[0]).toMatchObject({
      kind: 'aoe', damageRatio: 1,
      radius: 80,
    });
  });

  it('光束直伤与融合后的命中点爆炸同时入账', () => {
    registerSkillDefs([beamSkill(), mortarSkill()]);
    const state = freshState();
    equip(state, 'pierce', 6);
    equip(state, 'splitBlast', 6);
    const direct = enemy({ x: 370, y: 365, hp: 100, maxHp: 100, r: 12 });
    const splashOnly = enemy({ x: 370, y: 410, hp: 100, maxHp: 100, r: 12 });
    state.enemies = [direct, splashOnly];

    emitBeam(state);
    updateTurret(state, config, rng, 0.1);

    expect(state.beams[0].sourceStar).toBe(6);
    expect(direct.hp).toBeLessThan(splashOnly.hp); // 直伤 + 爆炸
    expect(splashOnly.hp).toBeLessThan(100);      // 仅爆炸
  });
});

describe('持续光束统一触发链', () => {
  it('chainLightning onHit 只在单道光束首次命中时连锁一次', () => {
    registerSkillDefs([
      beamSkill(),
      skill('chainLightning', [{ trigger: 'onHit', effects: [{
        atom: 'chain', params: { bounces: 1, damageRetention: 0.5, searchRange: 100 },
      }] }]),
    ]);
    const state = freshState();
    equip(state, 'pierce', 6);
    equip(state, 'chainLightning', 3);
    const direct = enemy({ x: 370, y: 365, hp: 100, maxHp: 100, r: 10 });
    const chained = enemy({ x: 370, y: 420, hp: 100, maxHp: 100, r: 10 });
    state.enemies = [direct, chained];

    emitBeam(state);
    for (let i = 0; i < 6; i++) updateTurret(state, config, rng, 0.1);

    const tickCount = 6;
    const cycleDamage = config.damage * config.fireRate * state.multi * 0.9;
    expect(direct.hp).toBeCloseTo(100 - cycleDamage, 5);
    expect(chained.hp).toBeCloseTo(100 - (cycleDamage / tickCount) * 0.5, 5);
  });

  it('onFire frost riders 与 onHit scorch 在 line delivery 下照常生效，且每敌只触发一次 onHit', () => {
    registerSkillDefs([
      beamSkill(),
      skill('frost', [{ trigger: 'onFire', effects: [
        { atom: 'slow', params: { ratio: 0.3, duration: 1.5 } },
        { atom: 'freeze', params: { duration: 0.8, stacksToTrigger: 3 } },
      ] }]),
      skill('scorch', [{ trigger: 'onHit', effects: [{
        atom: 'groundZone', params: { radius: 40, duration: 2.5, tickInterval: 0.5, effects: [{ atom: 'dot', params: { damageRatio: 0.15 } }] },
      }] }]),
    ]);
    const state = freshState();
    equip(state, 'pierce', 6);
    equip(state, 'frost', 3);
    equip(state, 'scorch', 3);
    const target = enemy({ x: 370, y: 365, hp: 100, maxHp: 100 });
    state.enemies = [target];

    emitBeam(state);
    for (let i = 0; i < 4; i++) updateTurret(state, config, rng, 0.1);

    expect(target.status.slow?.ratio).toBe(0.3);
    expect(target.status.freezeStacks).toBe(1);
    expect(state.zones).toHaveLength(1);
  });
});

describe('榴弹与致命命中统一管线', () => {
  it('lob 爆炸触发 onHit split，并让 onFire impact 击退圈内敌人；大 dt 不越过落点', () => {
    registerSkillDefs([
      mortarSkill(),
      skill('splitRider', [{ trigger: 'onHit', effects: [{ atom: 'split', params: { count: 2, damageRatio: 0.5, maxDepth: 1 } }] }]),
      skill('impact', [{ trigger: 'onFire', effects: [{ atom: 'knockback', params: { distance: 22 } }] }]),
    ]);
    const state = freshState();
    equip(state, 'splitBlast', 6);
    equip(state, 'splitRider', 3);
    equip(state, 'impact', 3);
    const primary = enemy({ x: 350, y: 365, hp: 100, maxHp: 100, r: 10 });
    const secondary = enemy({ x: 375, y: 365, hp: 100, maxHp: 100, r: 10 });
    state.enemies = [primary, secondary];

    shoot(state, config, rng, primary);
    expect(state.bullets[0].attack?.riders.some(rider => rider.atom === 'knockback')).toBe(true);
    updateBullets(state, config, rng, 0.5);

    expect(state.bullets.filter(bullet => bullet.kind === 'mortar')).toHaveLength(0);
    expect(state.bullets.filter(bullet => bullet.kind === 'fragment').length).toBeGreaterThanOrEqual(2);
    expect(secondary.x).toBeGreaterThan(375);
  });

  it('一发致死仍结算 split/aoeOnHit riders', () => {
    registerSkillDefs([skill('fatalRiders', [{ trigger: 'onFire', effects: [
      { atom: 'split', params: { count: 2, damageRatio: 0.5, maxDepth: 1 } },
      { atom: 'aoeOnHit', params: { radius: 50, damageRatio: 0.5, falloff: 0 } },
    ] }])]);
    const state = freshState();
    equip(state, 'fatalRiders', 3);
    const doomed = enemy({ x: 305, y: 365, hp: 1, maxHp: 1, r: 12 });
    const nearby = enemy({ x: 330, y: 365, hp: 100, maxHp: 100, r: 12 });
    state.enemies = [doomed, nearby];

    shoot(state, config, rng, doomed);
    updateBullets(state, config, rng, 0.03);

    expect(state.enemies).not.toContain(doomed);
    expect(state.bullets.filter(bullet => bullet.kind === 'fragment')).toHaveLength(2);
    expect(nearby.hp).toBeLessThan(100);
  });
});

describe('DOT 击杀来源', () => {
  const spreadBinding: BindingDef = {
    trigger: 'onKill', triggerParams: { requiresSource: 'dot' }, effects: [{
      atom: 'groundZone', params: { radius: 40, duration: 2.5, tickInterval: 0.5, effects: [{ atom: 'dot', params: { damagePerTick: 2 } }] },
    }],
  };

  it('区域 dot 烧死会在死亡点蔓延；普通伤害击杀不会', () => {
    registerSkillDefs([skill('scorch', [spreadBinding])]);
    const burning = freshState();
    equip(burning, 'scorch', 3);
    const victim = enemy({ x: 100, y: 100, hp: 1, maxHp: 1 });
    burning.enemies = [victim];
    const ctx: EffectCtx = { state: burning, config, rng, events: [], origin: { x: 100, y: 100 }, star: 3, baseDamage: 10 };
    ATOMS.groundZone(ctx, { radius: 40, duration: 2.5, tickInterval: 0.5, effects: [{ atom: 'dot', params: { damagePerTick: 2 } }] });
    tickEffects(burning, config, rng, 0.01);
    expect(burning.zones).toHaveLength(2);

    const ordinary = freshState();
    equip(ordinary, 'scorch', 3);
    const shotVictim = enemy({ x: 100, y: 100, hp: 1, maxHp: 1 });
    ordinary.enemies = [shotVictim];
    dealDamage(ordinary, config, rng, shotVictim, 2, 'weapon');
    expect(ordinary.zones).toHaveLength(0);
  });

  it('正式 scorch 3★/5★ 使用 requiresSource=dot，frost frozen 条件保持不变', () => {
    const scorch = cfg.skills.cards.find(def => def.id === 'scorch')!;
    for (const star of ['3', '5'] as const) {
      const kill = scorch.stars[star]!.equip.find(binding => binding.trigger === 'onKill')!;
      expect(kill.triggerParams).toMatchObject({ requiresSource: 'dot' });
      expect(kill.triggerParams?.requiresStatus).toBeUndefined();
    }
    const frost = cfg.skills.cards.find(def => def.id === 'frost')!;
    expect(frost.stars['5']!.equip.find(binding => binding.trigger === 'onKill')?.triggerParams)
      .toMatchObject({ requiresStatus: 'frozen' });
  });
});

describe('护盾融合', () => {
  it('absorbHits 取最大，regenSeconds 取最小', () => {
    const state = freshState();
    const ctx: EffectCtx = { state, config, rng, events: [], origin: { x: 0, y: 0 }, star: 3, baseDamage: 10 };
    ATOMS.shield(ctx, { absorbHits: 2, regenSeconds: 10 });
    ATOMS.shield(ctx, { absorbHits: 4, regenSeconds: 14 });
    ATOMS.shield(ctx, { absorbHits: 3, regenSeconds: 6 });
    expect(state.shield).toMatchObject({ hits: 4, maxHits: 4, regenSeconds: 6 });
  });
});
