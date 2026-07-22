export type TunerGroup = 'waves' | 'combat' | 'enemies' | 'drops' | 'progression' | 'bounty' | 'p2';

export interface TunerParam {
  path: string;
  label: string;
  group: TunerGroup;
  waveDeferred?: boolean;
}

export const BUDGET_TUNER_PARAMS: TunerParam[] = [
  { path: 'waves.budget.waveQuota.base', label: 'Budget · 总配额基础', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.waveQuota.perWave', label: 'Budget · 总配额每波', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.targetOnScreen.base', label: 'Budget · 目标同屏基础', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.targetOnScreen.perWave', label: 'Budget · 目标同屏每波', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.checkInterval', label: 'Budget · 检查间隔', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.batchMax', label: 'Budget · 单次补怪上限', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.waveEndSprint.window', label: 'Budget · 波末窗口', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.waveEndSprint.multiplier', label: 'Budget · 波末目标倍率', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.maxAlive', label: 'Budget · 同屏硬上限', group: 'waves', waveDeferred: true },
];

export const STAGE_DIRECTOR_TUNER_PARAMS: TunerParam[] = [
  { path: 'waves.stagePlan.selectionWaves', label: '阶段导演 · 选择期波数', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.validationWaves', label: '阶段导演 · 验证期波数', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.selection.waveQuota.start', label: '选择期 · 配额起点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.selection.waveQuota.end', label: '选择期 · 配额终点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.selection.targetOnScreen.start', label: '选择期 · 同屏起点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.selection.targetOnScreen.end', label: '选择期 · 同屏终点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.selection.maxAlive', label: '选择期 · 同屏硬上限', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.build.waveQuota.start', label: '构筑期 · 配额起点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.build.waveQuota.end', label: '构筑期 · 配额终点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.build.targetOnScreen.start', label: '构筑期 · 同屏起点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.build.targetOnScreen.end', label: '构筑期 · 同屏终点', group: 'waves', waveDeferred: true },
  { path: 'waves.stagePlan.build.maxAlive', label: '构筑期 · 同屏硬上限', group: 'waves', waveDeferred: true },
  { path: 'economy.ordinaryDropRate.selectionPerMinute', label: '普通掉落 · 选择期每分钟', group: 'drops' },
  { path: 'economy.ordinaryDropRate.buildPerMinute', label: '普通掉落 · 构筑期每分钟', group: 'drops' },
  { path: 'economy.ordinaryDropRate.buildTransitionSeconds', label: '普通掉落 · 构筑过渡秒数', group: 'drops' },
  { path: 'economy.ordinaryDropRate.carryCap', label: '普通掉落 · 额度积压上限', group: 'drops' },
];

export const BOUNTY_TUNER_PARAMS: TunerParam[] = [
  { path: 'bounty.offer.enabledFromWave', label: '报价 · 起始波次', group: 'bounty' },
  { path: 'bounty.offer.checkIntervalSeconds', label: '报价 · 检查间隔（秒）', group: 'bounty' },
  { path: 'bounty.offer.baseChancePerCheck', label: '报价 · 基础概率', group: 'bounty' },
  { path: 'bounty.offer.minChancePerCheck', label: '报价 · 概率下限', group: 'bounty' },
  { path: 'bounty.offer.maxChancePerCheck', label: '报价 · 概率上限', group: 'bounty' },
  { path: 'bounty.offer.noDamageRampSeconds', label: '报价 · 无伤爬坡时长', group: 'bounty' },
  { path: 'bounty.offer.noDamageBonusMax', label: '报价 · 无伤加成上限', group: 'bounty' },
  { path: 'bounty.offer.healthyHpThreshold', label: '报价 · 健康血量阈值', group: 'bounty' },
  { path: 'bounty.offer.healthyHpBonusMax', label: '报价 · 健康血量加成', group: 'bounty' },
  { path: 'bounty.offer.recentDamagePenalty', label: '报价 · 近期受伤惩罚', group: 'bounty' },
  { path: 'bounty.offer.recentDamagePenaltySeconds', label: '报价 · 近期受伤窗口', group: 'bounty' },
  { path: 'bounty.offer.markWindowSeconds', label: '报价 · 接受窗口', group: 'bounty' },
  { path: 'bounty.offer.cooldownSeconds', label: '报价 · 冷却时间', group: 'bounty' },
  { path: 'bounty.offer.minOffersPerWave', label: '报价 · 每波保底次数', group: 'bounty' },
  { path: 'bounty.offer.maxOffersPerWave', label: '报价 · 每波上限', group: 'bounty' },
  { path: 'bounty.offer.guaranteeAtWaveProgress', label: '报价 · 保底进度阈值', group: 'bounty' },
  { path: 'bounty.offer.maxConcurrentOffers', label: '报价 · 同时存在上限', group: 'bounty' },
  { path: 'bounty.offer.maxConcurrentEncounters', label: '报价 · 未结算敌群上限', group: 'bounty' },

  { path: 'bounty.encounter.enemyCountBase', label: '敌群 · 基础数量', group: 'bounty' },
  { path: 'bounty.encounter.enemyCountPerWave', label: '敌群 · 每波追加数量', group: 'bounty' },
  { path: 'bounty.encounter.enemyCountMax', label: '敌群 · 数量上限', group: 'bounty' },
  { path: 'bounty.encounter.hpMul', label: '敌群 · 生命倍率', group: 'bounty' },
  { path: 'bounty.encounter.speedMul', label: '敌群 · 速度倍率', group: 'bounty' },
  { path: 'bounty.encounter.damageMul', label: '敌群 · 伤害倍率', group: 'bounty' },
  { path: 'bounty.encounter.spawnIntervalSeconds', label: '敌群 · 分批生成间隔', group: 'bounty' },
  { path: 'bounty.encounter.spawnSpread', label: '敌群 · 出生散布', group: 'bounty' },
  { path: 'bounty.encounter.emergencyOverrideDistance', label: '敌群 · 紧急覆盖距离', group: 'bounty' },
  { path: 'bounty.encounter.composition.normalWeight', label: '敌群 · 普通权重', group: 'bounty' },
  { path: 'bounty.encounter.composition.fastWeight', label: '敌群 · 高速权重', group: 'bounty' },
  { path: 'bounty.encounter.composition.tankWeight', label: '敌群 · 重装权重', group: 'bounty' },

  { path: 'bounty.reward.cardCount', label: '奖励 · 指定卡数量', group: 'bounty' },
  { path: 'bounty.reward.cardStarMax', label: '奖励 · 指定卡星级上限', group: 'bounty' },
  { path: 'bounty.reward.wildcardCount', label: '奖励 · 万能卡数量', group: 'bounty' },
  { path: 'bounty.reward.wildcardStarMax', label: '奖励 · 万能卡星级上限', group: 'bounty' },
  { path: 'bounty.reward.dropLifetimeSeconds', label: '奖励 · 地面寿命', group: 'bounty' },
  { path: 'bounty.reward.repeatProtection', label: '奖励 · 重复保护', group: 'bounty' },
  { path: 'bounty.rewardBias.primaryShare', label: '奖励倾向 · 主流派占比', group: 'bounty' },
  { path: 'bounty.rewardBias.secondaryShare', label: '奖励倾向 · 次流派占比', group: 'bounty' },

  { path: 'bounty.visual.offerRadius', label: '视觉 · 报价半径', group: 'bounty' },
  { path: 'bounty.visual.offerEdgeInset', label: '视觉 · 边缘内缩', group: 'bounty' },
  { path: 'bounty.visual.enemyGlowRadius', label: '视觉 · 敌群光晕半径', group: 'bounty' },
  { path: 'bounty.visual.enemyPulseSpeed', label: '视觉 · 敌群脉冲速度', group: 'bounty' },
];

export const DROP_DIRECTOR_TUNER_PARAMS: TunerParam[] = [
  { path: 'economy.normalDropTypePolicy.roleBagSize', label: '掉落导演 · 角色袋长度', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.earlyMix.discovery', label: '掉落导演 · 前期探索位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.earlyMix.build', label: '掉落导演 · 前期主线位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.earlyMix.pivot', label: '掉落导演 · 前期调整位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.lateMix.discovery', label: '掉落导演 · 后期探索位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.lateMix.build', label: '掉落导演 · 后期主线位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.lateMix.pivot', label: '掉落导演 · 后期调整位', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.bootstrapMinDiscovery', label: '掉落导演 · 启动探索保底', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.affinity.scorePerStack', label: '掉落导演 · 每层倾向分', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.affinity.scoreCap', label: '掉落导演 · 倾向分封顶', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.fullMergeOps', label: '掉落导演 · 满成熟合成数', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.fullHighestStar', label: '掉落导演 · 满成熟最高星', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.fullEquippedTypes', label: '掉落导演 · 满成熟装备数', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.mergeWeight', label: '掉落导演 · 合成成熟权重', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.starWeight', label: '掉落导演 · 星级成熟权重', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maturity.equipWeight', label: '掉落导演 · 装备成熟权重', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.topK', label: '掉落导演 · 主线候选数', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.scorePower', label: '掉落导演 · 投入分指数', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.mergeReadyMultiplier', label: '掉落导演 · 可合成倍率', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.equippedBaseBonus', label: '掉落导演 · 装备基础加分', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.equippedStarBonus', label: '掉落导演 · 装备星级加分', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.historicalMergeWeight', label: '掉落导演 · 历史合成权重', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.historicalMergeCap', label: '掉落导演 · 历史合成封顶', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.build.maxWeightRatio', label: '掉落导演 · 最大权重比', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.pivot.excludeTopK', label: '掉落导演 · 调整排除头部', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.pivot.candidateFraction', label: '掉落导演 · 调整候选比例', group: 'drops' },
  { path: 'economy.normalDropTypePolicy.maxSameTypeStreak', label: '掉落导演 · 同型连抽上限', group: 'drops' },
];

function enemyParams(type: 'normal' | 'fast' | 'tank' | 'boss', label: string): TunerParam[] {
  const prefix = `enemies.types.${type}`;
  return [
    ['hpBase', '基础 HP'], ['hpPerWave', '每波 HP'], ['speedBase', '基础速度'],
    ['speedPerWave', '每波速度'], ['damage', '突破伤害'], ['r', '半径'], ['xp', '经验'],
  ].map(([key, suffix]) => ({ path: `${prefix}.${key}`, label: `${label} · ${suffix}`, group: 'enemies' }));
}

/** §2 A/B/C/D：主区为 P0/P1，P2 统一收入折叠区。 */
export const TUNER_PARAMS: TunerParam[] = [
  { path: 'waves.enemyCountBase', label: '基础出怪数', group: 'waves', waveDeferred: true },
  { path: 'waves.enemyCountPerWave', label: '每波追加数', group: 'waves', waveDeferred: true },
  { path: 'waves.spawnInterval.base', label: '出怪间隔 · 基础', group: 'waves', waveDeferred: true },
  { path: 'waves.spawnInterval.perWave', label: '出怪间隔 · 每波缩短', group: 'waves', waveDeferred: true },
  { path: 'waves.spawnInterval.min', label: '出怪间隔 · 下限', group: 'waves', waveDeferred: true },
  { path: 'waves.firstSpawnDelay', label: '首怪延迟', group: 'waves', waveDeferred: true },
  { path: 'waves.betweenWaves', label: '波间休息', group: 'waves', waveDeferred: true },
  { path: 'waves.totalWaves', label: '总波数', group: 'waves', waveDeferred: true },
  { path: 'waves.spawnMargin', label: '出生边距', group: 'waves', waveDeferred: true },
  { path: 'waves.typeRoll.tankBase', label: '重装概率 · 基础', group: 'waves', waveDeferred: true },
  { path: 'waves.typeRoll.tankPerWave', label: '重装概率 · 每波', group: 'waves', waveDeferred: true },
  { path: 'waves.typeRoll.fastThreshold', label: '高速阈值', group: 'waves', waveDeferred: true },

  { path: 'combat.defaults.damage', label: '基础伤害', group: 'combat' },
  { path: 'combat.defaults.fireRate', label: '每秒攻击', group: 'combat' },
  { path: 'combat.defaults.range', label: '攻击射程', group: 'combat' },
  { path: 'combat.bullet.speed', label: '弹速', group: 'combat' },
  { path: 'combat.bullet.life', label: '弹丸寿命', group: 'combat' },
  { path: 'combat.bullet.spread', label: '散布（弧度）', group: 'combat' },
  { path: 'combat.hp.max', label: '心防上限', group: 'combat' },
  { path: 'combat.breakthroughDist', label: '突破线距离', group: 'combat' },
  { path: 'combat.dangerZoneWidth', label: '危险区宽度', group: 'combat' },

  { path: 'enemies.defaults.enemySpeed', label: '全局敌人速度倍率', group: 'enemies' },
  ...enemyParams('normal', '普通'),
  ...enemyParams('fast', '高速'),
  ...enemyParams('tank', '重装'),
  ...enemyParams('boss', 'Boss'),

  { path: 'economy.defaults.dropChance', label: '基础掉落率', group: 'drops' },
  { path: 'economy.defaults.dropLifetime', label: '掉落存在时间', group: 'drops' },

  { path: 'progression.xpNeedBase', label: '经验 · 首级需求', group: 'progression' },
  { path: 'progression.xpGrowth', label: '经验 · 每级增长', group: 'progression' },
  { path: 'progression.killXpMul', label: '经验 · 击破倍率', group: 'progression' },
  { path: 'progression.perkChoices', label: '升级 · 候选数量', group: 'progression' },

  { path: 'combat.bullet.radius', label: 'P2 · 弹丸半径', group: 'p2' },
  { path: 'combat.bullet.muzzleOffset', label: 'P2 · 炮口偏移', group: 'p2' },
  { path: 'combat.vfx.shootParticles', label: 'P2 · 开火粒子数', group: 'p2' },
  { path: 'combat.vfx.killParticles', label: 'P2 · 击杀粒子数', group: 'p2' },
  { path: 'combat.vfx.breakthroughParticles', label: 'P2 · 突破粒子数', group: 'p2' },
  { path: 'economy.drops.pickupRadius', label: 'P2 · 拾取半径', group: 'p2' },
  { path: 'economy.drops.chanceCap', label: 'P2 · 掉率上限', group: 'p2' },
  { path: 'economy.dropStarPolicy.star2Share', label: 'P2 · 二星掉落占比', group: 'p2' },
];

/** A3 additions stay separate so A1's original 61-field contract remains stable. */
export const ALL_TUNER_PARAMS: TunerParam[] = [
  ...TUNER_PARAMS,
  ...BUDGET_TUNER_PARAMS,
  ...STAGE_DIRECTOR_TUNER_PARAMS,
  ...BOUNTY_TUNER_PARAMS,
  ...DROP_DIRECTOR_TUNER_PARAMS,
];

export function getNumberAt(root: unknown, path: string): number {
  let value: unknown = root;
  for (const key of path.split('.')) value = (value as Record<string, unknown>)[key];
  if (typeof value !== 'number') throw new Error(`调参路径不是数值: ${path}`);
  return value;
}

export function setNumberAt(root: unknown, path: string, value: number): void {
  const keys = path.split('.');
  let target = root as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>;
  target[keys[keys.length - 1]] = value;
}

/** Preset 中的 Boss 波次统一保存为规范字符串，避免数组引用造成错误 diff。 */
export function formatBossWaves(values: readonly number[]): string {
  return [...new Set(values)].sort((a, b) => a - b).join(', ');
}

/** 兼容旧 Preset；新字段存在时优先使用新字段。 */
export function migratePresetValues(values: Record<string, number | string | boolean>): Record<string, number | string | boolean> {
  const migrated = { ...values };
  if (migrated['waves.bossWaves'] === undefined && migrated['waves.bossWave'] !== undefined) {
    migrated['waves.bossWaves'] = String(migrated['waves.bossWave']);
  }
  delete migrated['waves.bossWave'];
  return migrated;
}
