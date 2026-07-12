// 技能数据模型（对应 docs/skills-schema.json v0.4.0）。
// 技能 = 数据（JSON 实例）+ 通用解释器（触发器 → 效果原子）。禁止每张卡硬编码 if。
// v0.3.0（P3）：新增 'passive' 触发器承载常驻修饰类原子（掉率/反伤/突破减免等，
// 设计表中"掉率+25%"这类无事件语义的装备态此前在 schema 中无处安放）。

/** 效果原子五大类别。 */
export type Category = 'projectile' | 'control' | 'domain' | 'economy' | 'defense';

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

/** 效果原子（31 个，见 docs/P2_技能体系框架与首批卡牌设计表.md §2）。 */
export type AtomName =
  // 弹道
  | 'pierce' | 'chain' | 'split' | 'ricochet' | 'aoeOnHit' | 'beamMorph' | 'mortarMorph'
  // 控制
  | 'slow' | 'freeze' | 'stun' | 'knockback' | 'taunt' | 'vulnerable'
  // 领域
  | 'aura' | 'groundZone' | 'dot' | 'summon'
  // 经济
  | 'dropRateMul' | 'dropLifetimeMul' | 'xpMul' | 'extraDrop' | 'expiryConvert' | 'mergeRule' | 'mergePulse'
  // 防御
  | 'shield' | 'thorns' | 'breachReduction' | 'novaOnBreak' | 'execute'
  // 共用
  | 'burstDamage' | 'focusPriority';

/** 单条效果：原子 + 参数。参数键名约定见 skills-schema atomCatalog；数值占位，P4 标定。 */
export interface EffectDef {
  atom: AtomName;
  params?: Record<string, unknown>;
}

/** 装备态绑定：触发器 + 效果原子列表。 */
export interface BindingDef {
  trigger: Trigger;
  triggerParams?: { seconds?: number };
  effects: EffectDef[];
}

/** 星级质变层：2★=core 机制成形，3★=transform 形态变换。 */
export interface StarTierDef {
  tier: 'core' | 'transform';
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
  category: Category;
  textKey: string;
  teaching: boolean;
  /** 仅 2★/3★ 有装备态（入装门槛 2★，1★=素材/即时消耗）。legacy 占位卡可缺省。 */
  stars?: { '2': StarTierDef; '3': StarTierDef };
  consumable: {
    placement: 'point';
    byStar: { '1': ConsumableTierDef; '2': ConsumableTierDef; '3': ConsumableTierDef };
  };
  implementationBatch?: 1 | 2;
  /** P3 过渡期：5 种旧数值卡的占位消耗态（装备态仍走旧数值加成路径），P5 替换。 */
  legacyPlaceholder?: boolean;
  designNotes?: string;
}

/** 精英 Bounty 机制配置：可选接单、集火狂暴，以及“肥而急”赏金。 */
export interface BountyConfig {
  enabled: boolean;
  enabledFromWave: number;
  spawnChancePerWave: number;
  markWindowSeconds: number;
  /** 敌人视觉半径外的额外点击热区，供 T1 手机实测回填。 */
  hitRadiusPadding: number;
  acceptEffects: { focusFire: boolean; enrage: { speedMul: number; hpMul: number } };
  rewards: { dropCount: number; starWeightShift: number; dropLifetimeMul: number };
}
