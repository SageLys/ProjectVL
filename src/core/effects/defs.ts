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
  category: Category;
  textKey: string;
  teaching: boolean;
  stars: { '3': StarTierDef; '5': StarTierDef; '6': StarTierDef };
  amplifyAxis: { description?: string; params: Record<string, string> };
  consumable: {
    placement: 'point';
    anchors: { '1': ConsumableTierDef; '3': ConsumableTierDef; '6': ConsumableTierDef };
    interpolation?: 'linear';
  };
  implementationBatch?: 1 | 2;
  designNotes?: string;
}

/** 精英 Bounty 机制配置（框架级；P3 仅落配置与索敌优先级基建，流程 P5 实装）。 */
export interface BountyConfig {
  enabled: boolean;
  enabledFromWave: number;
  spawnChancePerWave: number;
  markWindowSeconds: number;
  acceptEffects: { focusFire: boolean; enrage: { speedMul: number; hpMul: number } };
  rewards: { dropCount: number; starWeightShift: number; dropLifetimeMul: number };
}
