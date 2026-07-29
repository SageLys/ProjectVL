import { beforeEach, describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import type { BuildTag, BindingDef, CardDef, Category, EffectDef } from '../src/core/effects/defs';
import {
  fuseExpiryConvert,
  fuseNovaOnBreak,
  getModifiers,
  reconcileEquipmentPassives,
  registerSkillDefs,
  releaseConsumable,
} from '../src/core/effects/interpreter';
import { absorbBreach, tickEffects } from '../src/core/effects/runtime';
import {
  activeTaunt,
  applyTaunt,
  isControlled,
  tickStatusTimers,
} from '../src/core/effects/statusSystem';
import { moveEnemies, moveTargetFor, spawnWaveBoss } from '../src/core/systems/enemySystem';
import { spawnGroundDrop, tickDrops } from '../src/core/systems/dropSystem';
import { makeCountingRng } from '../src/core/rng';
import type { Card, GameEvent, GameState } from '../src/core/types';
import { card, constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();

interface DefOptions {
  category?: Category;
  tags?: BuildTag[];
  option5?: BindingDef[];
  shared6?: BindingDef[];
  consumeEffects?: EffectDef[];
}

function fixtureDef(id: string, equip: BindingDef[], options: DefOptions = {}): CardDef {
  const emptyTier = { radius: 120, duration: 3, effects: options.consumeEffects ?? [] };
  return {
    id,
    category: options.category ?? 'defense',
    synergyTags: options.tags ?? ['defense'],
    textKey: `test.${id}`,
    teaching: false,
    stars: {
      '3': { tier: 'core', equip },
      '5': { tier: 'dual', equip: options.option5 ?? [] },
      '6': { tier: 'transform', equip: options.shared6 ?? [] },
    },
    amplifyAxis: { params: {} },
    evolutionTree: {
      checkpoints: [
        { star: 3, options: [{ id: `${id}A`, textKey: `test.${id}.A`, equip }] },
        ...(options.option5 ? [{
          star: 5 as const,
          options: [{ id: `${id}B`, textKey: `test.${id}.B`, equip: options.option5 }],
        }] : []),
      ],
      sharedNodes: options.shared6 ? [{ star: 6, equip: options.shared6 }] : [],
    },
    consumable: {
      placement: 'point',
      anchors: { '1': emptyTier, '3': emptyTier, '6': emptyTier },
    },
  };
}

function passive(...effects: EffectDef[]): BindingDef {
  return { trigger: 'passive', effects };
}

function fixedCard(type: string, id: number, star = 3, evolutionPath = [`3:${type}A`]): Card {
  const instance = card(type, star);
  instance.id = id;
  instance.evolutionPath = evolutionPath;
  return instance;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index))
    .map(rest => [item, ...rest]));
}

function equipOrder(state: GameState, cards: Card[]): void {
  cards.forEach((instance, slot) => { state.equipment[slot] = structuredClone(instance); });
}

function combatStateWithoutPhysicalSlots(state: GameState): Omit<GameState, 'equipment'> {
  const snapshot = structuredClone(state);
  const { equipment: _physicalInput, ...combatState } = snapshot;
  return combatState;
}

beforeEach(resetTestEnv);

describe('纯融合函数与卡内覆盖', () => {
  it('nova 分轴取最大；expiry 按失败概率连乘并保留空/零贡献语义', () => {
    expect(fuseNovaOnBreak([{ damage: 40, knockbackDistance: 70 }, { damage: 30, knockbackDistance: 135 }]))
      .toEqual({ damage: 40, knockbackDistance: 135 });
    expect(fuseNovaOnBreak([{ damage: 0, knockbackDistance: 0 }]))
      .toEqual({ damage: 0, knockbackDistance: 0 });
    expect(fuseNovaOnBreak([])).toBeNull();

    expect(fuseExpiryConvert([0.5, 0.65])?.ratio).toBeCloseTo(0.825);
    expect(fuseExpiryConvert([0.5, 0.65, 0.45])?.ratio).toBeCloseTo(0.90375);
    expect(fuseExpiryConvert([0, 1])?.ratio).toBe(1);
    expect(fuseExpiryConvert([])).toBeNull();
  });

  it('同卡 3★→5★→6★ 的 nova 仍是后声明整包覆盖', () => {
    registerSkillDefs([fixtureDef('evolvingNova', [passive(
      { atom: 'novaOnBreak', params: { damage: 28, knockbackDistance: 70 } },
    )], {
      option5: [passive({ atom: 'novaOnBreak', params: { damage: 30, knockbackDistance: 135 } })],
      shared6: [passive({ atom: 'novaOnBreak', params: { damage: 50, knockbackDistance: 130 } })],
    })]);
    const state = freshState();
    state.equipment[0] = fixedCard('evolvingNova', 101, 6, ['3:evolvingNovaA', '5:evolvingNovaB']);
    expect(getModifiers(state).novaOnBreak).toEqual({ damage: 50, knockbackDistance: 130 });
  });

  it('retaliationMul 先缩放再比较，缩放后反超的来源胜出', () => {
    registerSkillDefs([
      fixtureDef('scaledNova', [passive({ atom: 'novaOnBreak', params: { damage: 35, knockbackDistance: 80 } })]),
      fixtureDef('plainNova', [passive({ atom: 'novaOnBreak', params: { damage: 40, knockbackDistance: 70 } })], {
        category: 'projectile', tags: ['projectile'],
      }),
    ]);
    const state = freshState();
    equipOrder(state, [fixedCard('scaledNova', 110), fixedCard('plainNova', 120)]);
    state.relicStacks.def_bridge = 1;
    state.buildState.scalingVersion = 1;
    expect(getModifiers(state).novaOnBreak).toEqual({ damage: 43.75, knockbackDistance: 80 });
  });
});

describe('槽位排列与真实消费路径', () => {
  const contributions = [
    ['alphaFusion', 201, 40, 70, 0.5],
    ['betaFusion', 202, 30, 135, 0.65],
    ['gammaFusion', 203, 35, 90, 0.45],
  ] as const;

  function registerContributionDefs(count: number): Card[] {
    const selected = contributions.slice(0, count);
    registerSkillDefs(selected.map(([type, , damage, knockbackDistance, ratio]) => fixtureDef(type, [passive(
      { atom: 'novaOnBreak', params: { damage, knockbackDistance } },
      { atom: 'expiryConvert', params: { ratio } },
    )])));
    return selected.map(([type, id]) => fixedCard(type, id));
  }

  it.each([2, 3])('%i 张卡的全部排列复用同一实例 id，getModifiers 逐位一致', count => {
    const cards = registerContributionDefs(count);
    const results = permutations(cards).map(order => {
      const state = freshState();
      equipOrder(state, order);
      return getModifiers(state);
    });
    for (const result of results.slice(1)) expect(result).toEqual(results[0]);
    expect(results[0].novaOnBreak).toEqual({ damage: 40, knockbackDistance: count === 2 ? 135 : 135 });
    expect(results[0].expiryConvert?.ratio).toBeCloseTo(count === 2 ? 0.825 : 0.90375);
  });

  it('真实破盾采用融合 Nova，换槽后 HP、位移、VFX、事件与 RNG 一致', () => {
    const cards = registerContributionDefs(2);
    const run = (order: Card[]) => {
      const state = freshState();
      equipOrder(state, order);
      state.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: null };
      state.enemies = [enemy({ id: 800, x: cfg.combat.turret.x + 80, y: cfg.combat.turret.y, hp: 200, maxHp: 200 })];
      const counting = makeCountingRng(77);
      const events: GameEvent[] = [];
      absorbBreach(state, config, counting.rng, 20, events);
      return {
        mods: getModifiers(state), enemy: state.enemies[0], vfx: state.vfx,
        events, draws: counting.draws(),
      };
    };
    const forward = run(cards);
    const reversed = run([...cards].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.enemy.hp).toBe(160);
    expect(forward.enemy.x).toBeGreaterThan(cfg.combat.turret.x + 80);
    expect(forward.vfx).toContainEqual(expect.objectContaining({ kind: 'retaliationNova' }));
  });

  it('expiryConvert 的零/一/空来源、单次 RNG 与 0.825 阈值两侧保持语义', () => {
    const run = (ratios: number[], roll: number) => {
      registerSkillDefs(ratios.map((ratio, index) => fixtureDef(`expiry${index}`, [passive(
        { atom: 'expiryConvert', params: { ratio } },
      )])));
      const state = freshState();
      equipOrder(state, ratios.map((_, index) => fixedCard(`expiry${index}`, 300 + index)));
      spawnGroundDrop(state, config, constRng(0), 100, 100, 'material', 1);
      const counting = { draws: 0, rng: () => { counting.draws++; return roll; } };
      tickDrops(state, config, counting.rng, config.dropLifetime + 0.01);
      return { mods: getModifiers(state), draws: counting.draws, xp: state.xp };
    };

    expect(run([0], 0)).toMatchObject({ mods: { expiryConvert: { ratio: 0 } }, draws: 1, xp: 0 });
    expect(run([1], 0.999)).toMatchObject({ mods: { expiryConvert: { ratio: 1 } }, draws: 1, xp: 4 });
    expect(run([], 0)).toMatchObject({ mods: { expiryConvert: null }, draws: 0, xp: 0 });
    expect(run([0.5, 0.65], 0.8249).xp).toBe(4);
    expect(run([0.5, 0.65], 0.8251).xp).toBe(0);
  });
});

describe('taunt 候选仲裁与来源链路', () => {
  it('施加顺序不影响候选集和赢家；权重、时长、sourceKey 依次决胜', () => {
    const apply = (reverse: boolean) => {
      const target = enemy();
      const candidates = [
        ['z/weak', 1, 6, 100],
        ['z/strong', 2, 2, 200],
        ['a/strong', 2, 2, 300],
      ] as const;
      for (const [sourceKey, weight, duration, x] of reverse ? [...candidates].reverse() : candidates) {
        applyTaunt(target, sourceKey, weight, x, 0, duration);
      }
      return { candidates: target.status.taunt, active: activeTaunt(target) };
    };
    expect(apply(true)).toEqual(apply(false));
    expect(apply(false).active).toMatchObject({ sourceKey: 'a/strong', x: 300 });

    const durationWinner = enemy();
    applyTaunt(durationWinner, 'a', 1, 10, 0, 2);
    applyTaunt(durationWinner, 'z', 1, 20, 0, 3);
    expect(activeTaunt(durationWinner)?.sourceKey).toBe('z');
  });

  it('同来源重复施加只 upsert，时长取 max 且坐标/召唤物取新值', () => {
    const target = enemy();
    applyTaunt(target, 'same', 1, 10, 20, 5, 1);
    applyTaunt(target, 'same', 3, 30, 40, 2, 2);
    expect(target.status.taunt).toHaveLength(1);
    expect(activeTaunt(target)).toEqual({
      sourceKey: 'same', priorityWeight: 3, x: 30, y: 40, remaining: 5, summonId: 2,
    });
  });

  it('强来源过期或关联召唤物死亡时只移除自身并回退', () => {
    const state = freshState();
    const target = enemy();
    state.enemies = [target];
    state.summons = [{ id: 9, kind: 'decoy', x: 10, y: 10, hp: 10, maxHp: 10, fireInterval: 0 }];
    applyTaunt(target, 'weak', 1, 100, 0, 10);
    applyTaunt(target, 'strong', 2, 10, 10, 1, 9);
    tickStatusTimers(state, 1.1);
    expect(activeTaunt(target)?.sourceKey).toBe('weak');

    applyTaunt(target, 'strong', 2, 10, 10, 5, 9);
    state.summons = [];
    tickStatusTimers(state, 0);
    expect(target.status.taunt.map(candidate => candidate.sourceKey)).toEqual(['weak']);
    expect(activeTaunt(target)?.sourceKey).toBe('weak');
  });

  it('Boss 撞召唤物只移除指向该物的候选，VFX 与移动使用同一赢家', () => {
    const state = freshState();
    const counting = makeCountingRng(19);
    const boss = spawnWaveBoss(state, counting.rng);
    const summon = { id: 70, kind: 'decoy' as const, x: 200, y: 200, hp: 100, maxHp: 100, fireInterval: 0 };
    state.summons = [summon];
    boss.x = summon.x;
    boss.y = summon.y;
    applyTaunt(boss, 'fallback', 1, 400, 300, 10);
    applyTaunt(boss, 'summon-source', 2, summon.x, summon.y, 10, summon.id);

    expect(moveTargetFor(state, boss)).toMatchObject({ summon, tauntKey: 'taunt/summon-source' });
    moveEnemies(state, config, counting.rng, 0);
    expect(activeTaunt(boss)?.sourceKey).toBe('fallback');
    expect(boss.tauntVfxSourceKey).toBe('taunt/summon-source');
    expect(state.vfx).toContainEqual({ kind: 'tauntPulse', enemyId: boss.id, remaining: 0.6 });
  });

  it('aura、zone 与 consume 透传稳定来源；环境召唤吸引仍不算 controlled', () => {
    const auraDef = fixtureDef('auraSource', [{
      trigger: 'passive',
      effects: [{ atom: 'aura', params: { radius: 500, tickInterval: 0.1, effects: [
        { atom: 'taunt', params: { duration: 2, priorityWeight: 2 } },
      ] } }],
    }]);
    const zoneDef = fixtureDef('zoneSource', [], { consumeEffects: [{
      atom: 'groundZone', params: { radius: 500, duration: 2, tickInterval: 0.1, effects: [
        { atom: 'taunt', params: { duration: 2 } },
      ] },
    }] });
    registerSkillDefs([auraDef, zoneDef]);
    const state = freshState();
    state.equipment[0] = fixedCard('auraSource', 401);
    const target = enemy({ x: cfg.combat.turret.x, y: cfg.combat.turret.y });
    state.enemies = [target];
    tickEffects(state, config, constRng(0.5), 0.2);
    expect(activeTaunt(target)?.sourceKey).toBe('auraSource/401/0/0');

    releaseConsumable(state, config, constRng(0.5), 'zoneSource', 3, target.x, target.y);
    tickEffects(state, config, constRng(0.5), 0.2);
    expect(target.status.taunt.map(candidate => candidate.sourceKey)).toContain('consume/zoneSource');

    const environmentOnly = enemy({ x: 0, y: 0 });
    state.summons = [{ id: 5, kind: 'decoy', x: 0, y: 0, hp: 10, maxHp: 10, tauntRadius: 100, fireInterval: 0 }];
    expect(moveTargetFor(state, environmentOnly).summon?.id).toBe(5);
    expect(isControlled(environmentOnly)).toBe(false);
  });
});

describe('召唤物顺序与完整战斗状态', () => {
  function summonDefs(): { defs: CardDef[]; cards: Card[] } {
    const make = (type: string) => fixtureDef(type, [
      passive({
        atom: 'summon', params: {
          kind: 'decoy', hp: 100, placement: 'threatDirection', distanceFromTurret: 150,
          tauntRadius: 1000, priorityWeight: 2,
        },
      }),
    ]);
    return {
      defs: [make('alphaSummon'), make('betaSummon')],
      cards: [fixedCard('alphaSummon', 501), fixedCard('betaSummon', 502)],
    };
  }

  it('无敌人放置与同权重环境索敌在换槽后逐位一致', () => {
    const { defs, cards } = summonDefs();
    registerSkillDefs(defs);
    const run = (order: Card[]) => {
      const state = freshState();
      equipOrder(state, order);
      reconcileEquipmentPassives(state, config, constRng(0.25));
      const target = enemy({ id: 900, x: cfg.combat.turret.x, y: cfg.combat.turret.y });
      state.enemies = [target];
      const moveTarget = moveTargetFor(state, target);
      return {
        summons: state.summons,
        target: { summonSource: moveTarget.summon?.sourceCardType, tauntKey: moveTarget.tauntKey },
      };
    };
    expect(run([...cards].reverse())).toEqual(run(cards));
  });

  it('replacesEarlier 在规范排序后仍只保留同卡更晚 binding', () => {
    registerSkillDefs([fixtureDef('replaceSummon', [
      passive({ atom: 'summon', params: { kind: 'decoy', hp: 10, placement: 'threatDirection' } }),
      passive({ atom: 'summon', params: { kind: 'decoy', hp: 20, placement: 'threatDirection', replacesEarlier: true } }),
    ])]);
    const state = freshState();
    state.equipment[2] = fixedCard('replaceSummon', 550);
    reconcileEquipmentPassives(state, config, constRng(0.5));
    expect(state.summons).toHaveLength(1);
    expect(state.summons[0]).toMatchObject({ sourceCardId: 550, sourceBindingIndex: 1, hp: 20 });
  });

  it('固定实例、初态与 seed 的 interval+aura+summon+掉落+破盾战斗换槽后完全一致', () => {
    const buildDef = (type: string, novaDamage: number, knockback: number, ratio: number) => fixtureDef(type, [
      { trigger: 'interval', triggerParams: { seconds: 0.5 }, effects: [
        { atom: 'extraDrop', params: { count: 1, at: 'turret', chance: 0.7 } },
      ] },
      passive(
        { atom: 'novaOnBreak', params: { damage: novaDamage, knockbackDistance: knockback } },
        { atom: 'expiryConvert', params: { ratio } },
        { atom: 'aura', params: { radius: 600, tickInterval: 0.5, effects: [
          { atom: 'taunt', params: { duration: 2, priorityWeight: 1 } },
        ] } },
      ),
      passive({
        atom: 'summon', params: {
          kind: 'decoy', hp: 100, placement: 'threatDirection', distanceFromTurret: 150,
          tauntRadius: 500, priorityWeight: 1,
        },
      }),
    ]);
    registerSkillDefs([
      buildDef('alphaBattle', 40, 70, 0.5),
      buildDef('betaBattle', 30, 135, 0.65),
    ]);
    const cards = [fixedCard('alphaBattle', 601), fixedCard('betaBattle', 602)];

    const run = (order: Card[]) => {
      const state = freshState();
      equipOrder(state, order);
      state.enemies = [enemy({ id: 990, x: cfg.combat.turret.x + 100, y: cfg.combat.turret.y, hp: 1000, maxHp: 1000 })];
      state.shield = { hits: 1, maxHits: 1, regenRemaining: null, regenSeconds: 2 };
      spawnGroundDrop(state, config, constRng(0), 50, 50, 'material', 1);
      const counting = makeCountingRng(0xdecafbad);
      const events: GameEvent[] = [];
      reconcileEquipmentPassives(state, config, counting.rng);
      absorbBreach(state, config, counting.rng, 20, events);
      events.push(...tickDrops(state, config, counting.rng, config.dropLifetime + 0.01));
      for (let frame = 0; frame < 4; frame++) {
        events.push(...tickEffects(state, config, counting.rng, 0.51));
        events.push(...moveEnemies(state, config, counting.rng, 0.05));
      }
      return {
        mods: getModifiers(state), events, rng: { draws: counting.draws(), last: counting.last() },
        state: combatStateWithoutPhysicalSlots(state),
      };
    };

    expect(run([...cards].reverse())).toEqual(run(cards));
  });
});
