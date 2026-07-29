// 效果原子参数契约（T0.2）：契约 = 唯一权威。本文件锁死三件事：
//   ① 契约与 AtomName / 注册表 / NOOP 清单双向一致；
//   ② 每个默认值与「迁移前 registry.ts / interpreter.ts 的内联字面量」逐一相等（冻结快照）；
//   ③ 契约默认值确实是运行时行为的来源（空参数跑一遍原子，观测值 == 契约值）。
import { describe, expect, it, beforeEach } from 'vitest';
import { cfg } from '../src/config';
import {
  ATOM_CONTRACT, ATOM_NAMES, RUNTIME_STAT_KINDS, TRIGGER_NAMES,
  atomContract, atomNumberDefault, atomStringDefault, effectParams, nestedEffectsOf,
} from '../src/core/effects/atomContract';
import type { AtomName, EffectDef } from '../src/core/effects/defs';
import { ATOMS, NOOP_MODIFIER_ATOMS, runEffects, type EffectCtx } from '../src/core/effects/registry';
import { MODIFIER_ATOMS_HANDLED } from '../src/core/effects/interpreter';
import { validateSkillsConfig } from '../src/config/skillValidator';
import type { GameState } from '../src/core/types';
import { constRng, createDefaultConfig, enemy, freshState, resetTestEnv } from './helpers';

const config = createDefaultConfig();
const rng = constRng(0.5);

beforeEach(resetTestEnv);

function ctxFor(state: GameState, over: Partial<EffectCtx> = {}): EffectCtx {
  return { state, config, rng, events: [], origin: { x: 480, y: 300 }, star: 2, baseDamage: 10, ...over };
}

/** 用空参数跑一个原子：所有取值都必须落到契约默认值上。 */
function runBare(atom: AtomName, over: Partial<EffectCtx> = {}): GameState {
  const state = freshState();
  runEffects(ctxFor(state, over), [{ atom, params: {} } as EffectDef]);
  return state;
}

/**
 * 冻结快照：迁移前 registry.ts / interpreter.ts 里逐个 num()/str() 的内联字面量。
 * 这张表是「零行为变化」的证据，**不得**为了迁就契约改动而修改——
 * 要改默认值，先改玩法结论，再同时改契约与本表，并在提交说明里写清行为差异。
 */
const PRE_MIGRATION_DEFAULTS: Record<string, number | string | boolean> = {
  // 弹道
  'pierce.count': 1,
  'pierce.damageRetention': 0.8,
  'pierce.damageRetention@consume': 1,
  'pierce.rampPerPierce': 0,
  'pierce.width': 10,
  'pierce.damageMul': 3,
  'chain.bounces': 2,
  'chain.damageRetention': 0.7,
  'chain.searchRange': 130,
  'chain.targets': 1,
  'chain.damageMul': 1,
  'split.count': 2,
  'split.damageRatio': 0.5,
  'split.maxDepth': 1,
  'ricochet.bounces': 1,
  'aoeOnHit.radius': 70,
  'aoeOnHit.damageRatio': 0.6,
  'aoeOnHit.falloff': 0.5,
  'beamMorph.width': 26,
  'beamMorph.damageRatio': 1,
  'beamMorph.interval': 0.9,
  'beamMorph.duration': 0.6,
  'beamMorph.tickInterval': 0.1,
  'mortarMorph.radius': 90,
  'mortarMorph.damageRatio': 1.2,
  'mortarMorph.falloff': 0.5,
  // 控制
  'slow.ratio': 0.3,
  'slow.duration': 1.5,
  'slow.radius': 120,
  'freeze.duration': 1,
  'freeze.radius': 120,
  'stun.duration': 0.5,
  'stun.chance': 1,
  'stun.radius': 120,
  'knockback.distance': 60,
  'knockback.collisionDamage': 0,
  'knockback.radius': 120,
  'taunt.duration': 3,
  'taunt.radius': 120,
  'taunt.priorityWeight': 1,
  'vulnerable.ratio': 0.2,
  'vulnerable.duration': 2,
  'vulnerable.maxStacks': 1,
  'vulnerable.radius': 120,
  // 领域
  'aura.radius': 120,
  'aura.radiusRatioOfRange': 0.5,
  'aura.tickInterval': 0.8,
  'aura.tickInterval@passive': 1,
  'aura.duration': 3,
  'aura.shape': 'circle',
  'groundZone.radius': 100,
  'groundZone.duration': 3,
  'groundZone.tickInterval': 0.5,
  'groundZone.shape': 'circle',
  'dot.damagePerTick': 5,
  'dot.tickInterval': 0.5,
  'dot.duration': 2,
  'dot.radius': 120,
  'summon.kind': 'decoy',
  'summon.count': 1,
  'summon.hp': 40,
  'summon.duration': 4,
  'summon.distanceFromTurret': 150,
  'summon.tauntRadius': 140,
  'summon.tauntRadius@orbital': 0,
  'summon.priorityWeight': 1,
  'summon.damageRatio': 0.3,
  'summon.fireInterval': 0.7,
  'summon.fireInterval@orbital': 0.25,
  'summon.fireInterval@decoy': 0,
  'summon.explode': false,
  'summon.explodeDamageMul': 1.5,
  'summon.knockbackDistance': 80,
  'summon.respawnOnce': false,
  'summon.replacesEarlier': false,
  // 经济
  'dropRateMul.mul': 1,
  'dropLifetimeMul.mul': 1,
  'xpMul.mul': 1,
  'extraDrop.count': 1,
  'extraDrop.at': 'point',
  'expiryConvert.ratio': 0.5,
  'mergeMaterialRefund.refundChance': 0.25,
  'mergeMaterialRefund.count': 1,
  'mergeMaterialRefund.star': 1,
  'mergeMaterialRefund.scope': 'merge',
  'wildcardRewardBonus.bonusChance': 1,
  'wildcardRewardBonus.count': 1,
  'wildcardRewardBonus.scope': 'both',
  'mergePulse.damagePerMergeCount': 4,
  'mergePulse.radius': 200,
  // 防御
  'shield.absorbHits': 2,
  'thorns.ratio': 0,
  'breachReduction.ratio': 0,
  'novaOnBreak.damage': 20,
  'novaOnBreak.knockbackDistance': 80,
  'execute.hpThresholdRatio': 0.15,
  'execute.hpThresholdRatio@passive': 0,
  'execute.radius': 120,
  // 共用
  'burstDamage.damageMul': 3,
  'burstDamage.radius': 100,
  'focusPriority.priorityWeight': 1,
  'focusPriority.duration': 4,
  'focusPriority.radius': 120,
  'restore.amount': 0,
  'restore.amountRatio': 0,
  'statBuff.stat': 'damage',
  'statBuff.operation': 'mul',
  'statBuff.value': 1,
  'statBuff.value@add': 0,
  'statBuff.duration': 3,
  'statBuff.maxStacks': 1,
};

/** extraDrop.starWeights 是唯一的 record 默认值，单列断言。 */
const PRE_MIGRATION_RECORD_DEFAULTS: Record<string, Record<string, number>> = {
  'extraDrop.starWeights': { '1': 1 },
};

describe('原子契约 · 单一来源', () => {
  it('契约键集与注册表实现键集双向一致（无遗漏、无多余）', () => {
    expect([...ATOM_NAMES].sort()).toEqual(Object.keys(ATOMS).sort());
    expect(ATOM_NAMES).toHaveLength(34);
  });

  it('modifierOnly 与 NOOP_MODIFIER_ATOMS / getModifiers 处理清单双向一致', () => {
    const contractOnly = ATOM_NAMES.filter(atom => atomContract(atom).modifierOnly).sort();
    expect(contractOnly).toEqual([...NOOP_MODIFIER_ATOMS].sort());
    expect(contractOnly).toEqual([...MODIFIER_ATOMS_HANDLED].sort());
  });

  it('校验器的原子清单直接派生自契约（不再手抄）', () => {
    const unknownAtom = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    const card = (unknownAtom.cards as Record<string, unknown>[])[0];
    const stars = card.stars as Record<string, { equip: { effects: { atom: string }[] }[] }>;
    stars['3'].equip[0].effects[0].atom = 'notAnAtom';
    expect(() => validateSkillsConfig(unknownAtom)).toThrow(/非法效果原子/);
  });

  it('触发器清单与运行时属性清单可枚举且穷尽', () => {
    expect(TRIGGER_NAMES).toHaveLength(9);
    expect(new Set(RUNTIME_STAT_KINDS).size).toBe(RUNTIME_STAT_KINDS.length);
    expect(RUNTIME_STAT_KINDS).toContain('maxHpAdd');
  });

  it('契约自洽：enum 有值域、variantDefaults 指向同原子的已声明参数、嵌套仅限领域原子', () => {
    for (const atom of ATOM_NAMES) {
      const contract = atomContract(atom);
      for (const [key, spec] of Object.entries(contract.params)) {
        const types = Array.isArray(spec.type) ? spec.type : [spec.type];
        if (types.includes('enum')) {
          expect(spec.enum, `${atom}.${key}`).toBeDefined();
          // number | enum 联合参数可有数值默认值；字符串默认值必须落在枚举分支内。
          if (typeof spec.default === 'string') expect(spec.enum, `${atom}.${key}`).toContain(spec.default);
        }
        if (types.includes('effects')) expect(contract.allowsNestedEffects, `${atom}.${key}`).toBe(true);
        if (spec.variantDefaults) {
          expect(contract.params[spec.variantDefaults.on], `${atom}.${key}`).toBeDefined();
        }
        if (spec.min !== undefined && spec.max !== undefined) expect(spec.min).toBeLessThanOrEqual(spec.max);
        if (typeof spec.default === 'number') {
          if (spec.min !== undefined) expect(spec.default, `${atom}.${key}`).toBeGreaterThanOrEqual(spec.min);
          if (spec.max !== undefined) expect(spec.default, `${atom}.${key}`).toBeLessThanOrEqual(spec.max);
        }
      }
      if (contract.allowsNestedEffects) expect(contract.params.effects).toBeDefined();
      if (contract.modifierOnly) expect(contract.supports.consume).toBe(false);
    }
  });
});

describe('原子契约 · 默认值冻结快照（迁移前后逐一相等）', () => {
  it('每条契约默认值都等于迁移前 registry/interpreter 的内联字面量', () => {
    const actual: Record<string, number | string | boolean> = {};
    for (const atom of ATOM_NAMES) {
      for (const [key, spec] of Object.entries(atomContract(atom).params)) {
        if (spec.default !== undefined && typeof spec.default !== 'object') actual[`${atom}.${key}`] = spec.default;
        if (spec.consumeDefault !== undefined && typeof spec.consumeDefault !== 'object') {
          actual[`${atom}.${key}@consume`] = spec.consumeDefault;
        }
        if (spec.passiveDefault !== undefined && typeof spec.passiveDefault !== 'object') {
          actual[`${atom}.${key}@passive`] = spec.passiveDefault;
        }
        for (const [variant, value] of Object.entries(spec.variantDefaults?.cases ?? {})) {
          if (typeof value !== 'object') actual[`${atom}.${key}@${variant}`] = value;
        }
      }
    }
    // chance 是 runEffects 的通用闸门，未声明 = 不走 rng，故除 stun 外都不进这张表。
    expect(actual).toEqual(PRE_MIGRATION_DEFAULTS);
  });

  it('record 默认值同样冻结', () => {
    const actual: Record<string, Record<string, number>> = {};
    for (const atom of ATOM_NAMES) {
      for (const [key, spec] of Object.entries(atomContract(atom).params)) {
        if (spec.default && typeof spec.default === 'object') actual[`${atom}.${key}`] = spec.default;
      }
    }
    expect(actual).toEqual(PRE_MIGRATION_RECORD_DEFAULTS);
  });

  it('stun 之外的原子不声明 chance 默认值（否则会改变 runEffects 的闸门语义）', () => {
    for (const atom of ATOM_NAMES) {
      const spec = atomContract(atom).params.chance;
      if (!spec) continue;
      if (atom === 'stun') expect(spec.default).toBe(1);
      else expect(spec.default, atom).toBeUndefined();
    }
  });
});

describe('原子契约 · 默认值即运行时行为', () => {
  it('groundZone 空参数按契约默认值建区', () => {
    const state = runBare('groundZone');
    const zone = state.zones[0];
    expect(zone.radius).toBe(atomNumberDefault('groundZone', 'radius'));
    expect(zone.remaining).toBe(atomNumberDefault('groundZone', 'duration'));
    expect(zone.tickInterval).toBe(atomNumberDefault('groundZone', 'tickInterval'));
    expect(zone.shape).toBe(atomStringDefault('groundZone', 'shape'));
  });

  it('aura 消耗态落点按 aura 自己的 tickInterval 默认值（0.8，不是 groundZone 的 0.5）', () => {
    const state = runBare('aura', { consume: true });
    expect(state.zones[0].tickInterval).toBe(atomNumberDefault('aura', 'tickInterval'));
    expect(state.zones[0].radius).toBe(atomNumberDefault('aura', 'radius'));
  });

  it('summon 空参数按契约默认值配置；orbital 走 tauntRadius 的 variant 默认值', () => {
    const decoy = runBare('summon').summons[0];
    expect(decoy.kind).toBe(atomStringDefault('summon', 'kind'));
    expect(decoy.maxHp).toBe(atomNumberDefault('summon', 'hp'));
    expect(decoy.remaining).toBe(atomNumberDefault('summon', 'duration'));
    expect(decoy.tauntRadius).toBe(atomNumberDefault('summon', 'tauntRadius'));
    expect(decoy.priorityWeight).toBe(atomNumberDefault('summon', 'priorityWeight'));
    expect(decoy.damageRatio).toBe(atomNumberDefault('summon', 'damageRatio'));
    expect(decoy.fireInterval).toBe(atomNumberDefault('summon', 'fireInterval', { variant: 'decoy' }));
    expect(decoy.explodeOnDeath).toBeNull();

    const state = freshState();
    runEffects(ctxFor(state), [{ atom: 'summon', params: { kind: 'orbital' } }]);
    expect(state.summons[0].tauntRadius)
      .toBe(atomNumberDefault('summon', 'tauntRadius', { variant: 'orbital' }));
    expect(state.summons[0].fireInterval)
      .toBe(atomNumberDefault('summon', 'fireInterval', { variant: 'orbital' }));

    const mirrorState = freshState();
    runEffects(ctxFor(mirrorState), [{ atom: 'summon', params: { kind: 'mirrorTurret' } }]);
    expect(mirrorState.summons[0].fireInterval).toBe(atomNumberDefault('summon', 'fireInterval'));
  });

  it('shield / statBuff / pierce 空参数落在契约默认值上', () => {
    expect(runBare('shield').shield?.maxHits).toBe(atomNumberDefault('shield', 'absorbHits'));

    const buffed = runBare('statBuff');
    expect(buffed.statModifiers[0]).toMatchObject({
      stat: atomStringDefault('statBuff', 'stat'),
      operation: atomStringDefault('statBuff', 'operation'),
      value: atomNumberDefault('statBuff', 'value'),
      remaining: atomNumberDefault('statBuff', 'duration'),
    });

    const state = freshState();
    const bullet = { x: 0, y: 0, vx: 1, vy: 0, r: 4, life: 1, damage: 5 };
    runEffects(ctxFor(state, { bullet }), [{ atom: 'pierce', params: {} }]);
    expect(bullet).toMatchObject({
      pierceLeft: atomNumberDefault('pierce', 'count'),
      damageRetention: atomNumberDefault('pierce', 'damageRetention'),
      rampPerPierce: atomNumberDefault('pierce', 'rampPerPierce'),
    });
  });

  it('pierce 无子弹载荷时用 consume 作用域的 damageRetention（1，不是 0.8）', () => {
    const state = runBare('pierce', { consume: true });
    expect(state.bullets[0].damageRetention)
      .toBe(atomNumberDefault('pierce', 'damageRetention', { scope: 'consume' }));
    expect(state.bullets[0].r).toBe(atomNumberDefault('pierce', 'width'));
  });

  it('控制类原子空参数的时长/强度取契约默认值', () => {
    const state = freshState();
    const target = enemy({ x: 480, y: 300 });
    state.enemies.push(target);
    runEffects(ctxFor(state, { enemy: target }), [
      { atom: 'slow', params: {} },
      { atom: 'vulnerable', params: {} },
      { atom: 'freeze', params: {} },
    ]);
    expect(target.status.slow).toMatchObject({
      ratio: atomNumberDefault('slow', 'ratio'),
      remaining: atomNumberDefault('slow', 'duration'),
    });
    expect(target.status.vulnerable).toMatchObject({
      ratio: atomNumberDefault('vulnerable', 'ratio'),
      remaining: atomNumberDefault('vulnerable', 'duration'),
    });
    expect(target.status.frozen).toBe(atomNumberDefault('freeze', 'duration'));
  });
});

describe('原子契约 · 校验器由契约驱动', () => {
  const withFirstEffect = (mutate: (effect: Record<string, unknown>) => void): unknown => {
    const clone = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    const card = (clone.cards as Record<string, unknown>[])[0];
    const stars = card.stars as Record<string, { equip: { trigger: string; effects: Record<string, unknown>[] }[] }>;
    mutate(stars['3'].equip[0].effects[0]);
    return clone;
  };

  it('真实 skills.json 完整通过契约级校验', () => {
    expect(() => validateSkillsConfig(structuredClone(cfg.skills))).not.toThrow();
  });

  it('契约未声明的参数被拒绝', () => {
    const bad = withFirstEffect(effect => {
      effect.params = { ...(effect.params as object), notAParam: 1 };
    });
    expect(() => validateSkillsConfig(bad)).toThrow(/契约未声明该参数/);
  });

  it('类型不符与超范围被拒绝', () => {
    const wrongType = withFirstEffect(effect => {
      effect.params = { ...(effect.params as object), chance: 'high' };
    });
    expect(() => validateSkillsConfig(wrongType)).toThrow(/必须是 number/);
    const outOfRange = withFirstEffect(effect => {
      effect.params = { ...(effect.params as object), chance: 1.5 };
    });
    expect(() => validateSkillsConfig(outOfRange)).toThrow(/不得大于 1/);
  });

  it('必填参数缺失被拒绝（statBuff.stat）', () => {
    const clone = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    const cards = clone.cards as Record<string, unknown>[];
    const target = cards.find(card => {
      const anchors = (card.consumable as { anchors: Record<string, { effects: { atom: string }[] }> }).anchors;
      return anchors['6'].effects.some(effect => effect.atom === 'statBuff');
    })!;
    const anchors = (target.consumable as {
      anchors: Record<string, { effects: { atom: string; params: Record<string, unknown> }[] }>;
    }).anchors;
    delete anchors['6'].effects.find(effect => effect.atom === 'statBuff')!.params.stat;
    expect(() => validateSkillsConfig(clone)).toThrow(/必填参数缺失/);
  });

  it('非法触发器绑定被拒绝（pierce 只允许 onFire）', () => {
    const clone = structuredClone(cfg.skills) as unknown as Record<string, unknown>;
    const cards = clone.cards as Record<string, unknown>[];
    const stars = cards[0].stars as Record<string, { equip: { trigger: string; effects: { atom: string }[] }[] }>;
    stars['3'].equip[0].trigger = 'onWaveStart';
    stars['3'].equip[0].effects[0].atom = 'pierce';
    expect(() => validateSkillsConfig(clone)).toThrow(/不允许绑定到 onWaveStart/);
  });

  it('非领域原子挂 effects 会被当作未声明参数拒绝（嵌套仅限 aura/groundZone）', () => {
    const bad = withFirstEffect(effect => {
      effect.atom = 'slow';
      effect.params = { effects: [{ atom: 'dot', params: { damageRatio: 0.1 } }] };
    });
    expect(() => validateSkillsConfig(bad)).toThrow(/契约未声明该参数/);
  });
});

describe('原子契约 · 覆盖真实卡牌数据', () => {
  it('skills.json 用到的每个参数都在契约内，且嵌套结构可遍历', () => {
    const seen = new Map<AtomName, Set<string>>();
    const walk = (effects: readonly EffectDef[]): void => {
      for (const effect of effects) {
        const keys = seen.get(effect.atom) ?? seen.set(effect.atom, new Set()).get(effect.atom)!;
        for (const key of Object.keys(effectParams(effect))) keys.add(key);
        walk(nestedEffectsOf(effect) as EffectDef[]);
      }
    };
    for (const def of cfg.skills.cards) {
      for (const tier of Object.values(def.stars)) walk(tier.equip.flatMap(binding => binding.effects));
      for (const checkpoint of def.evolutionTree?.checkpoints ?? []) {
        for (const option of checkpoint.options) walk(option.equip.flatMap(binding => binding.effects));
      }
      for (const node of def.evolutionTree?.sharedNodes ?? []) {
        walk((node.equip ?? []).flatMap(binding => binding.effects));
      }
      for (const anchor of Object.values(def.consumable.anchors)) walk(anchor.effects);
    }
    for (const [atom, keys] of seen) {
      const declared = Object.keys(ATOM_CONTRACT[atom].params);
      for (const key of keys) expect(declared, `${atom}.${key}`).toContain(key);
    }
    expect(seen.size).toBeGreaterThanOrEqual(32);
  });
});
