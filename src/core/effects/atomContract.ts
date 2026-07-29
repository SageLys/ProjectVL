// 效果原子参数契约：34 个原子的**唯一权威**参数声明。
// 改原子先改这里——契约默认值即运行时默认值，registry/interpreter 一律从本表读取兜底，
// 禁止在实现里再写字面量默认值（`docs/效果原子参数契约_落地记录.md` 记录了逐项核对结果）。
//
// 与 `config/affixSinks.ts` 的 AFFIX_SINKS 同风格：一张穷尽表，类型层用 satisfies 卡住
// "不漏不多"，运行时用访问器把默认值取出来，校验器与编辑器共用同一份元数据。
import type { AtomName, EffectParamsMap, RuntimeStatKind, Trigger } from './defs';

/** 原子分类：卡牌五大类别 + shared（跨类别共用）。 */
export type AtomCategory = 'projectile' | 'control' | 'domain' | 'economy' | 'defense' | 'shared';

export type AtomParamType = 'number' | 'integer' | 'string' | 'boolean' | 'enum' | 'effects' | 'record';

/** 契约中可声明的默认值形态（record 用于 extraDrop.starWeights 这类权重表）。 */
export type AtomParamDefault = number | string | boolean | Record<string, number>;

export interface AtomParamSpec {
  /** 单一类型；数组表示类型联合（当前仅 mergePulse.radius = number | 'all'）。 */
  type: AtomParamType | readonly AtomParamType[];
  required?: boolean;
  /** 缺省时运行时采用的值；不声明 = 无兜底，实现按「未声明」分支处理。 */
  default?: AtomParamDefault;
  /** 无子弹载荷路径（消耗态落点释放）的兜底；仅当与 default 不同时声明。 */
  consumeDefault?: AtomParamDefault;
  /** passive 聚合路径（interpreter.getModifiers / effects/runtime）的兜底；仅当与 default 不同时声明。 */
  passiveDefault?: AtomParamDefault;
  /** 默认值依赖同原子另一参数时的分支表（如 summon.tauntRadius 依赖 kind）。 */
  variantDefaults?: { on: string; cases: Record<string, AtomParamDefault> };
  min?: number;
  max?: number;
  enum?: readonly string[];
  note?: string;
}

export interface AtomContract {
  category: AtomCategory;
  params: Record<string, AtomParamSpec>;
  /** 装备态绑定允许的触发器；'any' = 不限（原子对时机不敏感）。 */
  allowedTriggers: readonly Trigger[] | 'any';
  supports: { equip: boolean; consume: boolean };
  /** 触发时是否可能向 ctx.events 推送事件（嵌套原子产生的事件不计入父原子）。 */
  emitsEvents: boolean;
  /** 是否允许 params.effects 嵌套（groundZone/aura）。 */
  allowsNestedEffects?: boolean;
  /** NOOP_MODIFIER_ATOMS：触发时 no-op，由 interpreter.getModifiers 聚合读取。 */
  modifierOnly?: boolean;
}

/** RuntimeStatModifier.stat 的运行时全集（statBuff.stat 的合法值域）。 */
export const RUNTIME_STAT_KINDS = [
  'damage', 'fireRate',
  'damageAdd', 'fireRateAdd', 'rangeAdd', 'multiAdd', 'maxHpAdd', 'heal',
  'effectDamageMul', 'quantityAdd', 'controlPotencyMul', 'controlledDamageTakenMul',
  'areaScaleMul', 'dotDamageMul', 'defenseDurabilityMul', 'retaliationMul',
  'dropRateMul', 'dropLifetimeMul', 'xpMul',
] as const satisfies readonly RuntimeStatKind[];

/** 编译期断言：RUNTIME_STAT_KINDS 覆盖 RuntimeStatKind 全集（导出以避免 noUnusedLocals）。 */
export type RuntimeStatKindsExhaustive =
  Exclude<RuntimeStatKind, typeof RUNTIME_STAT_KINDS[number]> extends never ? true : never;

/** 触发器全集（运行时可枚举）。 */
export const TRIGGER_NAMES = [
  'onFire', 'onHit', 'onKill', 'onWaveStart', 'onBreach', 'onPickup', 'interval', 'onMerge', 'passive',
] as const satisfies readonly Trigger[];

/** 编译期断言：TRIGGER_NAMES 覆盖 Trigger 全集（导出以避免 noUnusedLocals）。 */
export type TriggerNamesExhaustive =
  Exclude<Trigger, typeof TRIGGER_NAMES[number]> extends never ? true : never;

/** 通用触发概率闸门：runEffects 对所有原子统一判定（stun 例外，由原子自身逐目标判定）。 */
const CHANCE: Record<'chance', AtomParamSpec> = {
  chance: {
    type: 'number', min: 0, max: 1,
    note: 'runEffects 统一概率闸门；未声明 = 必定执行（不走 rng）',
  },
};

/** 半径兜底：无敌人载荷时以 origin 为心的目标圈（registry.targets 的 fallbackRadius）。 */
const TARGET_RADIUS: AtomParamSpec = {
  type: 'number', default: 120, min: 0,
  note: '无敌人载荷时的目标圈半径；ctx.radius（消耗态档位）优先于本参数',
};

/**
 * 唯一权威：34 原子的参数契约。
 * 默认值以迁移前 `registry.ts` / `interpreter.ts` 的内联值为准（代码是事实，文档可能滞后）。
 */
export const ATOM_CONTRACT = {
  // —— 弹道 ——
  pierce: {
    category: 'projectile',
    params: {
      count: { type: 'integer', default: 1, min: 0, note: '子弹可穿透的敌人数（quantityAdd 词条按整数放大）' },
      damageRetention: {
        type: 'number', default: 0.8, consumeDefault: 1, min: 0, max: 1,
        note: '每次穿透后的伤害保留比；消耗态巨型贯穿弹不衰减',
      },
      rampPerPierce: { type: 'number', default: 0, min: 0, note: '每次穿透后的伤害增益比' },
      width: { type: 'number', default: 10, min: 0, note: '仅消耗态：贯穿弹半径' },
      damageMul: { type: 'number', default: 3, min: 0, note: '仅消耗态：贯穿弹伤害 = 炮台总伤 × 本值' },
      ...CHANCE,
    },
    allowedTriggers: ['onFire'],
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  chain: {
    category: 'projectile',
    params: {
      bounces: { type: 'integer', default: 2, min: 0, note: '起点之后的弹跳次数' },
      damageRetention: { type: 'number', default: 0.7, min: 0, max: 1 },
      searchRange: { type: 'number', default: 130, min: 0 },
      targets: { type: 'integer', default: 1, min: 0, note: '无敌人载荷时取 origin 附近的起点数' },
      damageMul: { type: 'number', default: 1, min: 0, note: '无 attack/bullet 载荷时的伤害基准倍率' },
      ...CHANCE,
    },
    allowedTriggers: ['onFire', 'onHit', 'onKill', 'interval'],
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  split: {
    category: 'projectile',
    params: {
      count: { type: 'integer', default: 2, min: 0 },
      damageRatio: { type: 'number', default: 0.5, min: 0 },
      maxDepth: { type: 'integer', default: 1, min: 0, note: '弹片再分裂的层数上限，防指数级增殖' },
      ...CHANCE,
    },
    allowedTriggers: ['onFire', 'onHit', 'onKill', 'interval'],
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  ricochet: {
    category: 'projectile',
    params: {
      bounces: { type: 'integer', default: 1, min: 0 },
      ...CHANCE,
    },
    allowedTriggers: ['onFire'],
    supports: { equip: true, consume: false },
    emitsEvents: false,
  },
  aoeOnHit: {
    category: 'projectile',
    params: {
      radius: { type: 'number', default: 70, min: 0, note: 'ctx.radius（消耗态档位）优先于本默认值' },
      damageRatio: { type: 'number', default: 0.6, min: 0 },
      falloff: { type: 'number', default: 0.5, min: 0, max: 1, note: '边缘衰减比例' },
      ...CHANCE,
    },
    allowedTriggers: ['onFire', 'onHit', 'onKill', 'interval'],
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  beamMorph: {
    category: 'projectile',
    params: {
      width: { type: 'number', default: 26, min: 0 },
      damageRatio: { type: 'number', default: 1, min: 0 },
      interval: { type: 'number', default: 0.9, min: 0, note: '仅 passive 换形：主炮开火周期' },
      duration: { type: 'number', default: 0.6, min: 0, note: '仅 passive 换形：单次光束持续' },
      tickInterval: { type: 'number', default: 0.1, min: 0, note: '仅 passive 换形：光束伤害结算间隔' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  mortarMorph: {
    category: 'projectile',
    params: {
      radius: { type: 'number', default: 90, min: 0, note: 'ctx.radius（消耗态档位）优先于本默认值' },
      damageRatio: { type: 'number', default: 1.2, min: 0 },
      falloff: { type: 'number', default: 0.5, min: 0, max: 1 },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },

  // —— 控制 ——
  slow: {
    category: 'control',
    params: {
      ratio: { type: 'number', default: 0.3, min: 0, max: 1 },
      duration: { type: 'number', default: 1.5, min: 0 },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  freeze: {
    category: 'control',
    params: {
      duration: { type: 'number', default: 1, min: 0 },
      stacksToTrigger: { type: 'integer', min: 1, note: '未声明 = 立即冻结；声明后按层数累计触发' },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  stun: {
    category: 'control',
    params: {
      duration: { type: 'number', default: 0.5, min: 0 },
      chance: {
        type: 'number', default: 1, min: 0, max: 1,
        note: 'stun 自行逐目标判定（不走 runEffects 的统一闸门）',
      },
      radius: TARGET_RADIUS,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  knockback: {
    category: 'control',
    params: {
      distance: { type: 'number', default: 60, min: 0 },
      collisionDamage: { type: 'number', default: 0, min: 0, note: '>0 时撞击相邻敌人，双方各受 炮台总伤 × 本值' },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  taunt: {
    category: 'control',
    params: {
      duration: { type: 'number', default: 3, min: 0, note: 'ctx.duration（消耗态档位）优先于本默认值' },
      radius: TARGET_RADIUS,
      summonId: { type: 'integer', min: 0, note: '未声明 = 嘲讽到 origin；声明后嘲讽到指定召唤物' },
      priorityWeight: {
        type: 'number', default: 1, min: 0,
        note: '同来源 upsert；跨来源按 priorityWeight、remaining、sourceKey 依次仲裁，赢家失效后回退',
      },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  vulnerable: {
    category: 'control',
    params: {
      ratio: { type: 'number', default: 0.2, min: 0 },
      duration: { type: 'number', default: 2, min: 0 },
      maxStacks: { type: 'integer', default: 1, min: 1 },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },

  // —— 领域 ——
  aura: {
    category: 'domain',
    params: {
      radius: { type: 'number', default: 120, min: 0, note: '声明 radius 时优先于 radiusRatioOfRange' },
      radiusRatioOfRange: {
        type: 'number', default: 0.5, min: 0,
        note: '仅 passive 常驻光环：半径 = 射程 × 本值（radius 未声明时生效）',
      },
      tickInterval: {
        type: 'number', default: 0.8, passiveDefault: 1, min: 0,
        note: '消耗态落点区域 0.8s；passive 常驻光环 1s',
      },
      duration: { type: 'number', default: 3, min: 0, note: '仅消耗态落点区域；passive 光环常驻无时限' },
      shape: { type: 'enum', default: 'circle', enum: ['circle', 'ring'] },
      innerRadius: { type: 'number', min: 0, note: 'shape=ring 的内径；未声明 = radius × 0.5' },
      color: { type: 'string', note: '未声明 = 继承来源卡的主题色' },
      effects: { type: 'effects', required: true, note: '光环周期内对圈内敌人施加的嵌套原子' },
      ...CHANCE,
    },
    allowedTriggers: ['passive'],
    supports: { equip: true, consume: true },
    emitsEvents: false,
    allowsNestedEffects: true,
  },
  groundZone: {
    category: 'domain',
    params: {
      radius: { type: 'number', default: 100, min: 0 },
      duration: { type: 'number', default: 3, min: 0, note: '消耗态强制 ≤5s（R4）' },
      tickInterval: { type: 'number', default: 0.5, min: 0 },
      shape: {
        type: 'enum', default: 'circle', enum: ['circle', 'ring', 'line'],
        note: "'line' 当前按 circle 几何结算（Zone.shape 只实现 circle/ring）",
      },
      innerRadius: { type: 'number', min: 0, note: 'shape=ring 的内径；未声明 = radius × 0.5' },
      color: { type: 'string', note: '未声明 = 继承来源卡的主题色' },
      effects: { type: 'effects', required: true, note: '区域周期内对圈内敌人施加的嵌套原子' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
    allowsNestedEffects: true,
  },
  dot: {
    category: 'domain',
    params: {
      damageRatio: { type: 'number', min: 0, note: '每 tick 伤害 = 炮台总伤 × 本值；未声明时改用 damagePerTick' },
      damagePerTick: { type: 'number', default: 5, min: 0, note: 'damageRatio 未声明时的固定每 tick 伤害' },
      tickInterval: { type: 'number', default: 0.5, min: 0 },
      duration: { type: 'number', default: 2, min: 0, note: 'ctx.duration（消耗态档位）优先于本默认值' },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  summon: {
    category: 'domain',
    params: {
      kind: { type: 'enum', default: 'decoy', enum: ['decoy', 'mirrorTurret', 'orbital'] },
      count: { type: 'integer', default: 1, min: 0, note: '仅非装备态；装备态每(卡,绑定)严格单实例' },
      hp: { type: 'number', default: 40, min: 0 },
      duration: { type: 'number', default: 4, min: 0, note: '仅非装备态；装备态召唤物常驻至来源消失' },
      placement: { type: 'enum', enum: ['threatDirection'], note: '仅装备态：按威胁方向放置于炮台外围' },
      distanceFromTurret: { type: 'number', default: 150, min: 0 },
      tauntRadius: {
        type: 'number', default: 140, min: 0,
        variantDefaults: { on: 'kind', cases: { orbital: 0 } },
        note: 'orbital 默认不嘲讽',
      },
      priorityWeight: { type: 'number', default: 1, min: 0 },
      damageRatio: { type: 'number', default: 0.3, min: 0 },
      explode: { type: 'boolean', default: false, note: '真值时死亡爆炸' },
      explodeDamageMul: { type: 'number', default: 1.5, min: 0 },
      knockbackDistance: { type: 'number', default: 80, min: 0 },
      respawnOnce: { type: 'boolean', default: false, note: '被摧毁（非到期）时重生一次' },
      replacesEarlier: { type: 'boolean', default: false, note: '装备态：替换同卡更早绑定的召唤物' },
      fireInterval: { type: 'number', min: 0, note: '当前实现未消费（mirrorTurret 固定 0.7s、orbital 固定 0.25s 冷却）' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },

  // —— 经济 ——
  dropRateMul: {
    category: 'economy',
    params: {
      mul: { type: 'number', default: 1, min: 0, note: '乘法叠加' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  dropLifetimeMul: {
    category: 'economy',
    params: {
      mul: { type: 'number', default: 1, min: 0, note: '乘法叠加' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  xpMul: {
    category: 'economy',
    params: {
      mul: { type: 'number', default: 1, min: 0, note: '乘法叠加' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  extraDrop: {
    category: 'economy',
    params: {
      count: { type: 'integer', default: 1, min: 0 },
      starWeights: { type: 'record', default: { '1': 1 }, note: '星级抽取权重；结果受 economy.dropStarPolicy 上限约束' },
      at: {
        type: 'enum', default: 'point', enum: ['point', 'turret', 'killPoint'],
        note: "'turret' 落在炮台；其余落在 ctx.origin（命中点/击杀点/消耗落点）",
      },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  expiryConvert: {
    category: 'economy',
    params: {
      ratio: { type: 'number', default: 0.5, min: 0, max: 1 },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  mergeMaterialRefund: {
    category: 'economy',
    params: {
      refundChance: {
        type: 'number', default: 0.25, min: 0, max: 1,
        note: '由 commitMerge 消费端掷骰；不是 runEffects 的 chance 闸门',
      },
      count: { type: 'integer', default: 1, min: 1, max: 4, note: '单次返还张数' },
      star: { type: 'integer', default: 1, min: 1, note: '返还素材星级；运行时再按 maxStar 夹紧' },
      scope: {
        type: 'enum', default: 'merge', enum: ['merge', 'feed', 'both'],
        note: '生效的合成来源；万能升星与配方进化恒不返还',
      },
    },
    allowedTriggers: ['passive'],
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  wildcardRewardBonus: {
    category: 'economy',
    params: {
      bonusChance: {
        type: 'number', default: 1, min: 0, max: 1,
        note: '由奖励组装消费端掷骰；不是 runEffects 的 chance 闸门',
      },
      count: { type: 'integer', default: 1, min: 1, max: 3, note: '在基线奖励上额外增加的张数' },
      scope: { type: 'enum', default: 'both', enum: ['bounty', 'boss', 'both'] },
    },
    allowedTriggers: ['passive'],
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  mergePulse: {
    category: 'economy',
    params: {
      damagePerMergeCount: { type: 'number', default: 4, min: 0, note: '伤害 = 本值 × 合成结果星级' },
      radius: { type: ['number', 'enum'], default: 200, min: 0, enum: ['all'], note: "'all' = 全场" },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: true,
  },

  // —— 防御 ——
  shield: {
    category: 'defense',
    params: {
      absorbHits: { type: 'integer', default: 2, min: 0, note: '融合取最大' },
      regenSeconds: { type: 'number', min: 0, note: '未声明 = 破碎后不再生；融合取最小' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  thorns: {
    category: 'defense',
    params: {
      ratio: { type: 'number', default: 0, min: 0, note: '加法叠加' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  breachReduction: {
    category: 'defense',
    params: {
      ratio: { type: 'number', default: 0, min: 0, max: 1, note: '加法叠加，聚合后封顶 0.9' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  novaOnBreak: {
    category: 'defense',
    params: {
      damage: { type: 'number', default: 20, min: 0 },
      knockbackDistance: { type: 'number', default: 80, min: 0 },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: false },
    emitsEvents: false,
    modifierOnly: true,
  },
  execute: {
    category: 'defense',
    params: {
      hpThresholdRatio: {
        type: 'number', default: 0.15, passiveDefault: 0, min: 0, max: 1,
        note: 'passive 聚合取最高阈值，缺省贡献 0（不处决）',
      },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },

  // —— 共用 ——
  burstDamage: {
    category: 'shared',
    params: {
      damageMul: { type: 'number', default: 3, min: 0 },
      radius: { type: 'number', default: 100, min: 0, note: 'ctx.radius（消耗态档位）优先于本默认值' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: true,
  },
  focusPriority: {
    category: 'shared',
    params: {
      priorityWeight: { type: 'number', default: 1, min: 0 },
      duration: { type: 'number', default: 4, min: 0, note: 'ctx.duration（消耗态档位）优先于本默认值' },
      hpThresholdRatio: { type: 'number', min: 0, max: 1, note: '未声明 = 不筛血量；声明后只标记低于该比例的目标' },
      radius: TARGET_RADIUS,
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  restore: {
    category: 'shared',
    params: {
      amount: { type: 'number', default: 0, min: 0, note: 'amount 与 maxHp × amountRatio 相加，封顶 maxHp' },
      amountRatio: { type: 'number', default: 0, min: 0 },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
  statBuff: {
    category: 'shared',
    params: {
      stat: {
        type: 'enum', required: true, default: 'damage', enum: RUNTIME_STAT_KINDS,
        note: '校验器强制必填；registry 保留 damage 兜底以防手工注入的残缺数据',
      },
      operation: { type: 'enum', required: true, default: 'mul', enum: ['add', 'mul'] },
      value: {
        type: 'number', required: true, default: 1, min: 0,
        variantDefaults: { on: 'operation', cases: { add: 0 } },
        note: 'mul 恒等元 1、add 恒等元 0；mul 时校验器要求 > 0',
      },
      duration: { type: 'number', required: true, default: 3, min: 0, note: '消耗态强制 ≤5s（R4）' },
      maxStacks: { type: 'integer', default: 1, min: 1, note: '同来源同属性的层数上限，超出时刷新最短的一层' },
      ...CHANCE,
    },
    allowedTriggers: 'any',
    supports: { equip: true, consume: true },
    emitsEvents: false,
  },
} satisfies Record<AtomName, AtomContract>;

/** 全部原子名（运行时可枚举，来源仍是 ATOM_CONTRACT 本身）。 */
export const ATOM_NAMES = Object.keys(ATOM_CONTRACT) as AtomName[];

const CONTRACT: Record<AtomName, AtomContract> = ATOM_CONTRACT;

/** 按名取契约（宽类型视图，供校验器/编辑器遍历）。 */
export function atomContract(atom: AtomName): AtomContract {
  return CONTRACT[atom];
}

export interface AtomDefaultOptions {
  /** 结算路径：消耗态落点 / passive 聚合；缺省 = 装备态触发路径。 */
  scope?: 'consume' | 'passive';
  /** variantDefaults.on 指向的同原子参数的当前取值。 */
  variant?: string;
}

function specOf(atom: AtomName, key: string): AtomParamSpec {
  const spec = CONTRACT[atom].params[key];
  if (!spec) throw new Error(`[atomContract] ${atom}.${key}: 契约未声明该参数`);
  return spec;
}

function resolveDefault(atom: AtomName, key: string, options?: AtomDefaultOptions): AtomParamDefault | undefined {
  const spec = specOf(atom, key);
  const variant = options?.variant;
  if (variant !== undefined && spec.variantDefaults && variant in spec.variantDefaults.cases) {
    return spec.variantDefaults.cases[variant];
  }
  if (options?.scope === 'consume' && spec.consumeDefault !== undefined) return spec.consumeDefault;
  if (options?.scope === 'passive' && spec.passiveDefault !== undefined) return spec.passiveDefault;
  return spec.default;
}

/** 契约数值默认值；缺失或类型不符即抛错——实现与契约漂移必须立刻可见。 */
export function atomNumberDefault(atom: AtomName, key: string, options?: AtomDefaultOptions): number {
  const value = resolveDefault(atom, key, options);
  if (typeof value !== 'number') throw new Error(`[atomContract] ${atom}.${key}: 契约缺少数值默认值`);
  return value;
}

/** 契约字符串默认值。 */
export function atomStringDefault(atom: AtomName, key: string, options?: AtomDefaultOptions): string {
  const value = resolveDefault(atom, key, options);
  if (typeof value !== 'string') throw new Error(`[atomContract] ${atom}.${key}: 契约缺少字符串默认值`);
  return value;
}

/** 契约布尔默认值。 */
export function atomBooleanDefault(atom: AtomName, key: string, options?: AtomDefaultOptions): boolean {
  const value = resolveDefault(atom, key, options);
  if (typeof value !== 'boolean') throw new Error(`[atomContract] ${atom}.${key}: 契约缺少布尔默认值`);
  return value;
}

/** 契约权重表默认值（extraDrop.starWeights）。 */
export function atomRecordDefault(atom: AtomName, key: string): Record<string, number> {
  const value = resolveDefault(atom, key);
  if (!value || typeof value !== 'object') throw new Error(`[atomContract] ${atom}.${key}: 契约缺少 record 默认值`);
  return value;
}

/** 参数的松散视图：供通用遍历（词条缩放/文案/校验）使用；返回的是同一引用，可原地改写。 */
export function effectParams(effect: { params?: object }): Record<string, unknown> {
  return (effect.params ?? {}) as Record<string, unknown>;
}

/** 嵌套效果数组（仅 allowsNestedEffects 的原子会有）。 */
export function nestedEffectsOf<T extends { params?: object }>(effect: T): unknown[] {
  const nested = effectParams(effect).effects;
  return Array.isArray(nested) ? nested : [];
}

type AssertKeysEqual<A extends string | number | symbol, B extends string | number | symbol> =
  [Exclude<A, B> | Exclude<B, A>] extends [never] ? true : never;

/**
 * 编译期双向一致性断言：每个原子的 EffectParamsMap 形状与 ATOM_CONTRACT.params 键集完全一致。
 * 任一侧新增/删除参数而另一侧没跟上，这里立刻报错（导出以避免 noUnusedLocals）。
 */
export type AtomContractMatchesEffectDef = {
  [A in AtomName]: AssertKeysEqual<
    keyof typeof ATOM_CONTRACT[A]['params'],
    keyof NonNullable<EffectParamsMap[A]>
  >;
};
