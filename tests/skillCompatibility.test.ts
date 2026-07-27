import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BindingDef, CardDef, EffectDef } from '../src/core/effects/defs';
import {
  fireTrigger, getModifiers, MODIFIER_ATOMS_HANDLED, reconcileEquipmentPassives,
  registerSkillDefs, tickIntervalBindings,
} from '../src/core/effects/interpreter';
import { nestedEffectsOf } from '../src/core/effects/atomContract';
import { ATOMS, NOOP_MODIFIER_ATOMS } from '../src/core/effects/registry';
import { tickEffects } from '../src/core/effects/runtime';
import { shoot, updateBullets, updateTurret } from '../src/core/systems/combatSystem';
import { dealDamage } from '../src/core/systems/damageSystem';
import { startNextWave } from '../src/core/systems/waveSystem';
import { totalFireRate } from '../src/core/stats';
import type { CardType, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(() => {
  resetTestEnv();
  registerSkillDefs(cfg.skills.cards);
});

function walkEffects(effects: readonly EffectDef[]): EffectDef[] {
  return effects.flatMap(effect => [effect, ...walkEffects(nestedEffectsOf(effect) as EffectDef[])]);
}

function equip(state: GameState, entries: ReadonlyArray<readonly [CardType, number]>): void {
  entries.forEach(([type, star], index) => { state.equipment[index] = card(type, star); });
}

function equipPath(state: GameState, slot: number, type: CardType, star: number, path: string[]): void {
  const instance = card(type, star);
  instance.evolutionPath = path;
  state.equipment[slot] = instance;
}

function beamResult(entries: ReadonlyArray<readonly [CardType, number]>) {
  const state = freshState();
  equip(state, entries);
  const primary = enemy({ x: 370, y: 365, hp: 200, maxHp: 200, r: 10 });
  const neighbor = enemy({ x: 370, y: 420, hp: 200, maxHp: 200, r: 10 });
  state.enemies = [primary, neighbor];
  state.intervalClocks['weapon:line'] = 0;
  updateTurret(state, config, rng, 0);
  updateTurret(state, config, rng, 0.1);
  return {
    primaryHp: primary.hp,
    neighborHp: neighbor.hp,
    freezeStacks: primary.status.freezeStacks,
    zones: state.zones.length,
    impacts: state.vfx.filter(vfx => vfx.kind === 'mortarImpact').length,
    stats: entries.map((_, index) => state.combatTelemetry.perCard[state.equipment[index]!.id]),
  };
}

function splitFixture(): CardDef {
  const source = structuredClone(cfg.skills.cards.find(def => def.id === 'frost')!);
  const binding: BindingDef = {
    trigger: 'onHit', effects: [{ atom: 'split', params: { count: 2, damageRatio: 0.5, maxDepth: 1 } }],
  };
  source.stars['3']!.equip = [binding];
  source.stars['5']!.equip = [structuredClone(binding)];
  source.stars['6'].equip = [structuredClone(binding)];
  source.evolutionTree!.checkpoints[0].options[0].equip = [structuredClone(binding)];
  return source;
}

describe('全卡牌配置自动审计', () => {
  it('全部层级、含嵌套 effects 的 atom 都有处理器', () => {
    for (const def of cfg.skills.cards) {
      for (const tier of Object.values(def.stars)) {
        const bindings = [...tier.equip, ...Object.values(def.consumable.anchors).flatMap(anchor => anchor.effects.length ? [{ effects: anchor.effects }] : [])];
        for (const binding of bindings) {
          for (const effect of walkEffects(binding.effects)) {
            expect(ATOMS[effect.atom], `${def.id}: ${effect.atom}`).toBeTypeOf('function');
          }
        }
      }
    }
  });

  it('纯修饰原子必须由 getModifiers 聚合，过滤值必须有运行时生产路径', () => {
    expect(new Set(MODIFIER_ATOMS_HANDLED)).toEqual(new Set(NOOP_MODIFIER_ATOMS));
    const legalStatuses = new Set(['frozen', 'dot', 'controlled', 'brand', 'vulnerable']);
    const legalSources = new Set(['weapon', 'chain', 'dot', 'retaliation']);
    for (const def of cfg.skills.cards) for (const tier of Object.values(def.stars)) {
      for (const binding of tier.equip) {
        const params = binding.triggerParams;
        if (params?.requiresStatus) expect(legalStatuses.has(params.requiresStatus), `${def.id}:status`).toBe(true);
        if (params?.requiresSource) expect(legalSources.has(params.requiresSource), `${def.id}:source`).toBe(true);
      }
    }
  });

  it('所有装备态 summon 都声明外围 placement 与距离', () => {
    for (const def of cfg.skills.cards) for (const tier of Object.values(def.stars)) {
      for (const binding of tier.equip) for (const effect of walkEffects(binding.effects)) {
        if (effect.atom !== 'summon') continue;
        expect(effect.params).toMatchObject({ placement: 'threatDirection' });
        expect(effect.params?.distanceFromTurret).toBeTypeOf('number');
      }
    }
  });
});

describe('高风险两两兼容矩阵', () => {
  it.each([
    ['光束+连锁', ['pierce', 6], ['chainLightning', 3]],
    ['光束+冻结', ['pierce', 6], ['frost', 3]],
    ['光束+灼烧', ['pierce', 6], ['scorch', 3]],
  ] as const)('%s：触发可计数且交换槽位结果一致', (_name, left, right) => {
    const forward = beamResult([left, right]);
    const reversed = beamResult([right, left]);
    expect({ ...forward, stats: undefined }).toEqual({ ...reversed, stats: undefined });
    expect(forward.stats.every(stats => stats?.triggers > 0)).toBe(true);
    if (right[0] === 'chainLightning') expect(forward.neighborHp).toBeLessThan(200);
    if (right[0] === 'frost') expect(forward.freezeStacks).toBeGreaterThan(0);
    if (right[0] === 'scorch') expect(forward.zones).toBeGreaterThan(0);
  });

  it('光束+榴弹、融合+连锁：直伤、爆炸、连锁和逐卡计数同时存在', () => {
    const forward = beamResult([['pierce', 6], ['splitBlast', 6], ['chainLightning', 3]]);
    const reversed = beamResult([['chainLightning', 3], ['splitBlast', 6], ['pierce', 6]]);
    expect({ ...forward, stats: undefined }).toEqual({ ...reversed, stats: undefined });
    expect(forward.impacts).toBeGreaterThan(0);
    expect(forward.neighborHp).toBeLessThan(200);
    expect(forward.stats.every(stats => stats && (stats.triggers > 0 || stats.hits > 0))).toBe(true);
  });

  it('榴弹+分裂：爆炸 onHit 生成弹片，交换槽位不改变结果', () => {
    const mortar = cfg.skills.cards.find(def => def.id === 'splitBlast')!;
    registerSkillDefs([mortar, splitFixture()]);
    const run = (reverse: boolean) => {
      const state = freshState();
      equip(state, reverse ? [['frost', 3], ['splitBlast', 6]] : [['splitBlast', 6], ['frost', 3]]);
      const target = enemy({ x: 350, y: 365, hp: 100, maxHp: 100, r: 10 });
      state.enemies = [target];
      shoot(state, config, rng, target);
      updateBullets(state, config, rng, 0.5);
      return { hp: target.hp, fragments: state.bullets.filter(bullet => bullet.kind === 'fragment').length };
    };
    expect(run(false)).toEqual(run(true));
    expect(run(false).fragments).toBeGreaterThanOrEqual(2);
  });

  it('榴弹+击退：圈内目标被推出且交换槽位不改变位移', () => {
    const run = (reverse: boolean) => {
      const state = freshState();
      equip(state, reverse ? [['impact', 3], ['splitBlast', 6]] : [['splitBlast', 6], ['impact', 3]]);
      const target = enemy({ x: 350, y: 365, hp: 100, maxHp: 100, r: 10 });
      const secondary = enemy({ x: 375, y: 365, hp: 100, maxHp: 100, r: 10 });
      state.enemies = [target, secondary];
      shoot(state, config, rng, target);
      updateBullets(state, config, rng, 0.5);
      return secondary.x;
    };
    expect(run(false)).toBeCloseTo(run(true));
    expect(run(false)).toBeGreaterThan(350);
  });
});

describe('长跑泄漏锚点', () => {
  it('10 波后 summons/beams/vfx 规模保持有界', () => {
    const state = freshState();
    equip(state, [['pierce', 6], ['splitBlast', 6], ['decoy', 5]]);
    for (let wave = 0; wave < 10; wave++) {
      startNextWave(state, config, rng);
      state.enemies = [enemy({ x: 370, y: 365, hp: 1000, maxHp: 1000 })];
      state.intervalClocks['weapon:line'] = 0;
      updateTurret(state, config, rng, 0);
      for (let tick = 0; tick < 8; tick++) {
        updateTurret(state, config, rng, 0.1);
        updateBullets(state, config, rng, 0.1);
        tickEffects(state, config, rng, 0.1);
      }
      state.enemies.length = 0;
      tickEffects(state, config, rng, 0.5);
    }
    expect(state.summons).toHaveLength(1);
    expect(state.beams.length).toBeLessThanOrEqual(1);
    expect(state.vfx.length).toBeLessThanOrEqual(2);
    expect(state.bullets.length).toBeLessThanOrEqual(2);
  });
});

describe('C8 cross-god multiplicative interfaces', () => {
  it('plenty vulnerable amplifies storm chain damage', () => {
    const state = freshState();
    equipPath(state, 0, 'bountyCall', 3, ['3:bountyCallB']);
    equipPath(state, 1, 'chainLightning', 3, ['3:chainLightningA']);
    const primary = enemy({ x: 300, y: 300, hp: 100, maxHp: 100 });
    const chained = enemy({ x: 340, y: 300, hp: 100, maxHp: 100 });
    state.enemies = [primary, chained];

    tickIntervalBindings(state, config, rng, 4.1);
    fireTrigger(state, config, rng, 'onHit', {
      bullet: { x: 300, y: 300, damage: 20 } as never,
      enemy: primary,
      point: { x: 300, y: 300 },
    });

    expect(chained.status.vulnerable).not.toBeNull();
    expect(chained.hp).toBeLessThan(86);
  });

  it('winter controlled-damage buff multiplies inferno dot damage', () => {
    const state = freshState();
    equipPath(state, 0, 'frozenBulwark', 5, ['3:frozenBulwarkA', '5:frozenBulwarkC2']);
    equipPath(state, 1, 'scorch', 3, ['3:scorchA']);
    const target = enemy({ hp: 100, maxHp: 100 });
    target.status.frozen = 1;
    state.enemies = [target];

    fireTrigger(state, config, rng, 'onWaveStart', { wave: 1 });
    dealDamage(state, config, rng, target, 10, 'dot');

    expect(target.hp).toBeCloseTo(88.8);
  });

  it('bulwark taunt coexists with inferno area damage on a clustered target', () => {
    const state = freshState();
    equipPath(state, 0, 'decoy', 3, ['3:decoyA']);
    equipPath(state, 1, 'splitBlast', 3, ['3:splitBlastA']);
    reconcileEquipmentPassives(state, config, rng);
    const origin = state.summons[0];
    const primary = enemy({ x: origin.x, y: origin.y, hp: 100, maxHp: 100 });
    const neighbor = enemy({ x: origin.x + 20, y: origin.y, hp: 100, maxHp: 100 });
    state.enemies = [primary, neighbor];

    fireTrigger(state, config, rng, 'onHit', {
      bullet: { x: origin.x, y: origin.y, damage: 20 } as never,
      enemy: primary,
      point: { x: origin.x, y: origin.y },
    });

    expect(origin.tauntRadius).toBeGreaterThan(0);
    expect(neighbor.hp).toBeLessThan(100);
  });

  it('storm attack-speed buff accelerates winter onFire riders without replacing them', () => {
    const state = freshState();
    equipPath(state, 0, 'overcharge', 3, ['3:overchargeA']);
    equipPath(state, 1, 'frost', 3, ['3:frostA']);
    const before = totalFireRate(state, config);
    fireTrigger(state, config, rng, 'onKill', { enemy: enemy(), point: { x: 300, y: 300 } });
    const after = totalFireRate(state, config);
    shoot(state, config, rng, enemy({ x: 600, y: 300 }));

    expect(after).toBeGreaterThan(before);
    expect(state.bullets[0].riders?.map(rider => rider.atom))
      .toEqual(expect.arrayContaining(['slow', 'freeze']));
  });

  it('plenty global economy modifiers coexist with an arbitrary storm weapon', () => {
    const state = freshState();
    equipPath(state, 0, 'luckyStar', 3, ['3:luckyStarA']);
    equipPath(state, 1, 'pierce', 3, ['3:pierceA']);
    const modifiers = getModifiers(state);
    shoot(state, config, rng, enemy({ x: 600, y: 300 }));

    expect(modifiers.dropRateMul).toBeGreaterThan(1);
    expect(modifiers.xpMul).toBeGreaterThan(1);
    expect(state.bullets[0].pierceLeft).toBeGreaterThan(0);
  });
});
