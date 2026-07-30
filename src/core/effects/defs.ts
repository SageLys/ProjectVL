// 技能数据模型（对应 docs/skills-schema.json v0.5.0）。
// 技能 = 数据（JSON 实例）+ 通用解释器（触发器 → 效果原子）。禁止每张卡硬编码 if。
// v0.3.0（P3）：新增 'passive' 触发器承载常驻修饰类原子（掉率/反伤/突破减免等，
// 设计表中"掉率+25%"这类无事件语义的装备态此前在 schema 中无处安放）。
// v0.4.1（固化2）：新增可选 fusionPolicy 结构位（D2 预留，运行时无效果）。
import type {
  CardAffixPoolDef, CardFusionPolicyDef, CardStatKind, EvolutionTreeDef, GodId,
} from '../../config/types';

/** RuntimeStatModifier 可承载的属性全集，也是 statBuff.stat 的合法值域。 */
export type RuntimeStatKind = CardStatKind | 'damage' | 'fireRate';

/** 效果原子五大类别。 */
export type Category = 'projectile' | 'control' | 'domain' | 'economy' | 'defense';

/** 机制标签：描述效果协同与缩放目标，与神（GodId）流派身份无关。 */
export type BuildTag = 'projectile' | 'control' | 'domain' | 'defense' | 'utility';

/** 触发器库。装备态效果绑定到其一；passive = 常驻修饰（无事件，聚合读取）。 */
export type Trigger =
  | 'onFire'
  | 'onHit'
  | 'onKill'
  | 'onWaveStart'
  | 'onBreach'
  | 'onPickup'
  | 'interval'
  | 'onMerge'
  | 'passive';

/** 效果原子（34 个，见 docs/skills-schema.json atomCatalog）。 */
export type AtomName =
  // 弹道
  | 'pierce' | 'chain' | 'split' | 'ricochet' | 'aoeOnHit' | 'beamMorph' | 'mortarMorph'
  // 控制
  | 'slow' | 'freeze' | 'stun' | 'knockback' | 'taunt' | 'vulnerable'
  // 领域
  | 'aura' | 'groundZone' | 'dot' | 'summon'
  // 经济
  | 'dropRateMul' | 'dropLifetimeMul' | 'xpMul' | 'extraDrop' | 'expiryConvert'
  | 'mergeMaterialRefund' | 'wildcardRewardBonus' | 'mergePulse'
  // 防御
  | 'shield' | 'thorns' | 'breachReduction' | 'novaOnBreak' | 'execute'
  // 共用
  | 'burstDamage' | 'focusPriority' | 'restore' | 'statBuff';

/**
 * 每个原子的参数形状。**唯一权威是 `atomContract.ts` 的 ATOM_CONTRACT**：
 * 本映射只是它的类型投影，两侧键集由 `AtomContractMatchesEffectDef` 编译期双向卡死。
 * 全部参数可选——运行时缺省值一律由契约提供（见 ATOM_CONTRACT 的 default）。
 * 写成 type 而非 interface：object literal type 才有隐式索引签名，可直接喂给通用遍历。
 */
export interface EffectParamsMap {
  // —— 弹道 ——
  pierce: { count?: number; damageRetention?: number; rampPerPierce?: number; width?: number; damageMul?: number; chance?: number };
  chain: {
    bounces?: number; damageRetention?: number; searchRange?: number; targets?: number; damageMul?: number;
    /** 每次链伤结算后直接施加状态；不会重新发送完整 onHit。 */
    spreadStatus?: 'vulnerable' | 'slow' | 'dot';
    spreadParams?: { ratio?: number; duration?: number };
    chance?: number;
  };
  split: { count?: number; damageRatio?: number; maxDepth?: number; chance?: number };
  ricochet: { bounces?: number; chance?: number };
  aoeOnHit: { radius?: number; damageRatio?: number; falloff?: number; chance?: number };
  beamMorph: { width?: number; damageRatio?: number; interval?: number; duration?: number; tickInterval?: number; chance?: number };
  mortarMorph: { radius?: number; damageRatio?: number; falloff?: number; chance?: number };
  // —— 控制 ——
  slow: { ratio?: number; duration?: number; radius?: number; chance?: number };
  freeze: { duration?: number; stacksToTrigger?: number; radius?: number; chance?: number };
  stun: { duration?: number; chance?: number; radius?: number };
  knockback: { distance?: number; collisionDamage?: number; radius?: number; chance?: number };
  taunt: { duration?: number; radius?: number; summonId?: number; priorityWeight?: number; chance?: number };
  vulnerable: { ratio?: number; duration?: number; maxStacks?: number; radius?: number; chance?: number };
  // —— 领域 ——
  aura: {
    radius?: number; radiusRatioOfRange?: number; tickInterval?: number; duration?: number;
    shape?: 'circle' | 'ring'; innerRadius?: number; color?: string; effects?: EffectDef[]; chance?: number;
  };
  groundZone: {
    radius?: number; duration?: number; tickInterval?: number;
    shape?: 'circle' | 'ring' | 'line'; innerRadius?: number; color?: string; effects?: EffectDef[]; chance?: number;
  };
  dot: { damageRatio?: number; damagePerTick?: number; tickInterval?: number; duration?: number; radius?: number; chance?: number };
  summon: {
    kind?: 'decoy' | 'mirrorTurret' | 'orbital'; count?: number; hp?: number; duration?: number;
    placement?: 'threatDirection'; distanceFromTurret?: number; tauntRadius?: number; priorityWeight?: number;
    damageRatio?: number; explode?: boolean; explodeDamageMul?: number; knockbackDistance?: number;
    respawnOnce?: boolean; replacesEarlier?: boolean; fireInterval?: number; chance?: number;
  };
  // —— 经济 ——
  dropRateMul: { mul?: number; chance?: number };
  dropLifetimeMul: { mul?: number; chance?: number };
  xpMul: { mul?: number; chance?: number };
  extraDrop: { count?: number; starWeights?: Record<string, number>; at?: 'point' | 'turret' | 'killPoint'; chance?: number };
  expiryConvert: { ratio?: number; chance?: number };
  mergeMaterialRefund: { refundChance?: number; count?: number; star?: number; scope?: 'merge' | 'feed' | 'both' };
  wildcardRewardBonus: { bonusChance?: number; count?: number; scope?: 'bounty' | 'boss' | 'both' };
  mergePulse: { damagePerMergeCount?: number; radius?: number | 'all'; chance?: number };
  // —— 防御 ——
  shield: { absorbHits?: number; regenSeconds?: number; chance?: number };
  thorns: { ratio?: number; chance?: number };
  breachReduction: { ratio?: number; chance?: number };
  novaOnBreak: { damage?: number; knockbackDistance?: number; chance?: number };
  execute: { hpThresholdRatio?: number; radius?: number; chance?: number };
  // —— 共用 ——
  burstDamage: { damageMul?: number; radius?: number; chance?: number };
  focusPriority: { priorityWeight?: number; duration?: number; hpThresholdRatio?: number; radius?: number; chance?: number };
  restore: { amount?: number; amountRatio?: number; chance?: number };
  statBuff: { stat?: RuntimeStatKind; operation?: 'add' | 'mul'; value?: number; duration?: number; maxStacks?: number; chance?: number };
}

/** 单条效果：按 atom 判别的联合类型，参数形状由 EffectParamsMap 决定。 */
export type EffectDef = { [A in AtomName]: { atom: A; params?: EffectParamsMap[A] } }[AtomName];

/** 装备态绑定：触发器 + 效果原子列表。 */
export interface BindingDef {
  trigger: Trigger;
  /**
   * interval 用 seconds；onKill 可选 requiresSource（击杀来源标签）/requiresStatus（死亡时刻状态，'frozen'|'dot'）过滤；
   * cooldownSeconds 通用于任意触发器：限制该绑定的最短再触发间隔（如冲击 5★ 破门反制每 6s 至多一次）。
   */
  triggerParams?: { seconds?: number; requiresSource?: string; requiresStatus?: string; cooldownSeconds?: number };
  effects: EffectDef[];
}

/** 星级质变锚点：3★ core、5★ dual、6★ transform。 */
export interface StarTierDef {
  tier: 'core' | 'dual' | 'transform';
  equip: BindingDef[];
}

/** 消耗态单档：落点释放，即时或 ≤5s。 */
export interface ConsumableTierDef {
  radius?: number;
  duration?: number;
  effects: EffectDef[];
}

export interface CardDef {
  id: string;
  god?: GodId;
  /** 跨全部九宫格分支不变的核心机制。 */
  identityContract: string;
  /** recipeOnly 产物专用；锚点方神。 */
  primaryGod?: GodId;
  /** recipeOnly 产物专用；仅用于存档、图鉴与遥测。 */
  sourceGods?: GodId[];
  category: Category;
  /** 机制标签（1~2 个，非空、去重）；与 category 和神身份独立，仅用于效果协同。 */
  synergyTags: BuildTag[];
  textKey: string;
  teaching: boolean;
  /** 正式卡含 3/5/6 迁移锚点；recipeOnly 终态只含 6★。 */
  stars: { '3'?: StarTierDef; '5'?: StarTierDef; '6': StarTierDef };
  amplifyAxis: { description?: string; params: Record<string, string> };
  consumable: {
    placement: 'point';
    anchors: { '1': ConsumableTierDef; '3': ConsumableTierDef; '6': ConsumableTierDef };
    interpolation?: 'linear';
  };
  evolutionTree?: EvolutionTreeDef;
  affixPool?: CardAffixPoolDef;
  /** D2 预留：卡间融合的数值词条策略。占位契约，运行时无效果（Stage 5 才实现）。 */
  fusionPolicy?: CardFusionPolicyDef;
  recipeOnly?: boolean;
  implementationBatch?: 1 | 2;
  designNotes?: string;
}

