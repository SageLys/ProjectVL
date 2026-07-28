// 配置层类型：游戏域 + input（T1 输入校准值）+ tuner（调参面板元数据）。
// P3 配置重组：所有可调数值经此处；variant = 对 base 的深覆盖（见 loader.ts）。
import type { BuildTag, CardDef } from '../core/effects/defs';
import type { BindingDef } from '../core/effects/defs';

export type RunStage = 'selection' | 'build' | 'validation';

/** Normalized curve within a stage: first wave = start, last wave = end. */
export interface StageCurve { start: number; end: number; power: number; }

export interface RegularStageConfig {
  waveQuota: StageCurve;
  targetOnScreen: StageCurve;
  checkInterval: number;
  batchMax: number;
  maxAlive: number;
  waveEndSprint: { window: number; multiplier: number };
}

export type ValidationRewardTypePolicy = 'build' | 'pivot' | 'uniform' | 'focusGod';

export type ValidationRewardSpec =
  | { kind: 'wildcard'; star: number; count: number }
  | { kind: 'card'; star: number; count: number; typePolicy: ValidationRewardTypePolicy };

export interface ValidationEnemySpec {
  type: 'normal' | 'fast' | 'tank';
  hpMul: number;
  damageMul: number;
  speedMul: number;
  ccResistOverride?: number;
  knockbackResistOverride?: number;
  reward: ValidationRewardSpec;
}

export interface ValidationWaveConfig {
  enemies: ValidationEnemySpec[];
  bossReward: ValidationRewardSpec;
}

export interface StagePlanConfig {
  enabled: boolean;
  selectionWaves: number;
  validationWaves: number;
  selection: RegularStageConfig;
  build: RegularStageConfig;
  validation: ValidationWaveConfig[];
}

export interface OrdinaryDropRateConfig {
  /** Controls only the time-based ordinary-drop cadence; it does not control the wave stage director. */
  enabled: boolean;
  selectionPerMinute: number;
  buildPerMinute: number;
  buildTransitionSeconds: number;
  carryCap: number;
  modifiersAffectTarget: boolean;
}

export interface BountyConfig {
  enabled: boolean;
  rewardBias: {
    enabled: boolean;
    primaryShare: number;
    secondaryShare: number;
    nearMergeBonus: number;
    investedBonus: number;
    droughtBonus: number;
  };
  offer: {
    enabledFromWave: number;
    checkIntervalSeconds: number;
    baseChancePerCheck: number;
    minChancePerCheck: number;
    maxChancePerCheck: number;
    noDamageRampSeconds: number;
    noDamageBonusMax: number;
    healthyHpThreshold: number;
    healthyHpBonusMax: number;
    recentDamagePenalty: number;
    recentDamagePenaltySeconds: number;
    markWindowSeconds: number;
    cooldownSeconds: number;
    minOffersPerWave: number;
    maxOffersPerWave: number;
    guaranteeAtWaveProgress: number;
    maxConcurrentOffers: number;
    maxConcurrentEncounters: number;
  };
  encounter: {
    enemyCountBase: number;
    enemyCountPerWave: number;
    enemyCountMax: number;
    hpMul: number;
    speedMul: number;
    damageMul: number;
    spawnIntervalSeconds: number;
    spawnSpread: number;
    emergencyOverrideDistance: number;
    composition: { normalWeight: number; fastWeight: number; tankWeight: number };
  };
  reward: {
    cardCount: number;
    cardStarByWave?: number[];
    cardStarBase?: number;
    cardStarUpgradeEveryWaves?: number;
    cardStarMax: number;
    wildcardCount: number;
    wildcardStarByWave?: number[];
    wildcardStarBase?: number;
    wildcardStarUpgradeEveryWaves?: number;
    wildcardStarMax: number;
    dropLifetimeSeconds: number;
    repeatProtection: number;
  };
  visual: {
    offerRadius: number;
    offerEdgeInset: number;
    enemyGlowRadius: number;
    enemyPulseSpeed: number;
    showRewardName: boolean;
  };
}

export interface CombatConfig {
  canvas: { width: number; height: number };
  turret: { x: number; y: number };
  hp: { max: number };
  defaults: { damage: number; fireRate: number; range: number };
  /** Minimum visible space between the attack circle and every canvas edge. */
  attackPreviewMargin: number;
  bullet: { speed: number; life: number; radius: number; spread: number; muzzleOffset: number };
  /** 主炮融合的爆炸预算，以及多张范围形态叠加时的固定衰减。 */
  weaponFusion: { impactShare: number; damping: number; areaMul: number };
  breakthroughDist: number;
  /** 遥测危险区在突破线外额外延伸的宽度（像素）；不参与战斗判定。 */
  dangerZoneWidth: number;
  dtCap: number;
  knockbackFatigue: { decayFactor: number; windowSeconds: number; minMultiplier: number };
  ccImmunity: { afterFreezeSeconds: number; afterStunSeconds: number };
  controlCeiling: { freezeSeconds: number; stunSeconds: number; knockbackDistance: number };
  controlBudget: { maxControlledRatio: number; minFreeAdvancers: number };
  vfx: { shootParticles: number; killParticles: number; breakthroughParticles: number };
}

export interface WavesConfig {
  totalWaves: number;
  spawnMode: 'interval' | 'budget';
  enemyCountBase: number;
  enemyCountPerWave: number;
  firstSpawnDelay: number;
  spawnInterval: { base: number; perWave: number; min: number };
  budget: {
    waveQuota: { base: number; perWave: number };
    targetOnScreen: { base: number; perWave: number };
    checkInterval: number;
    batchMax: number;
    waveEndSprint: { window: number; multiplier: number };
    maxAlive: number;
  };
  stagePlan: StagePlanConfig;
  intermission: {
    freeSeconds: {
      selection: number;
      buildEarly: number;
      buildLate: number;
      validation: number;
    };
    settleSeconds: number;
    autoReadyHighlight: boolean;
  };
  spawnMargin: number;
  typeRoll: { tankBase: number; tankPerWave: number; fastThreshold: number };
  bossWaves: number[];
  waveBoss: {
    reward: {
      schedule: Record<RunStage, number[]>;
      count: number;
    };
  };
}

export interface EnemyDef {
  label: string;
  hpBase: number;
  hpPerWave: number;
  speedBase: number;
  speedPerWave: number;
  r: number;
  color: string;
  damage: number;
  xp: number;
  sides: number;
  knockbackResist: number;
  ccResist: number;
  contactDps?: number;
}

export interface BossBehaviorConfig {
  orbitStartRangeRatio: number;
  orbitStartMaxDistance: number;
  curveStrength: number;
  contactDistance: number;
  contactExitDistance: number;
  contactWarmup: number;
  contactTickInterval: number;
  hardControlPausesDamage: boolean;
}

export interface EnemiesConfig {
  defaults: { enemySpeed: number };
  types: Record<'normal' | 'fast' | 'tank' | 'boss', EnemyDef>;
  bossBehavior: BossBehaviorConfig;
}

export interface SkillsConfig {
  version: string;
  cards: CardDef[];
}

// 神是重新设计后的流派身份；BuildTag 只保留为机制标签。
export type GodId = string;

export interface GodDef {
  id: GodId;
  textKey: string;
  anchorCardIds: string[];
  variableCardIds: string[];
  mainRosterSize: number;
  subRosterSize: number;
}

export interface GodsConfig {
  version: string;
  gods: GodDef[];
}

export type DifficultyId = 'relaxed' | 'standard' | 'hard' | 'hell';

export interface DifficultyCurve { start: number; end: number; power: number; }

export interface DifficultyProfile {
  label: string;
  description: string;
  enemy: { hp: DifficultyCurve; damage: DifficultyCurve; speed: DifficultyCurve };
  /** 可选覆盖：只作用于 type === 'boss'；缺省字段回落到 enemy 对应曲线。 */
  boss?: Partial<{ hp: DifficultyCurve; damage: DifficultyCurve; speed: DifficultyCurve }>;
}

export interface DifficultyConfig {
  defaultDifficulty: DifficultyId;
  profiles: Record<DifficultyId, DifficultyProfile>;
}

export type BuildScalingAxis =
  | 'effectDamageMul'
  | 'quantityAdd'
  | 'controlPotencyMul'
  | 'controlledDamageTakenMul'
  | 'areaScaleMul'
  | 'dotDamageMul'
  | 'defenseDurabilityMul'
  | 'retaliationMul'
  | 'dropRateMul'
  | 'dropLifetimeMul'
  | 'xpMul';

export interface RelicBuildEffect {
  kind: 'buildScaling';
  targetTags: BuildTag[];
  axis: BuildScalingAxis;
  value: number;
}

export interface RelicDef {
  id: string;
  god?: GodId;
  rarity: 'common' | 'rare' | 'epic';
  /** 文案唯一入口：`${textKey}.name` / `${textKey}.desc` 落在 texts.json（配置层不再内联文本）。 */
  textKey: string;
  targetTags: BuildTag[];
  effects: RelicBuildEffect[];
  poolInfluence?: { godWeightAdd: number; pityDrops?: number };
  maxStacks: number;
}

export interface RelicsConfig {
  version: string;
  relics: RelicDef[];
}

export interface CardRequirement {
  cardId: string;
  minStar: number;
}

export interface EvolutionRecipeDef {
  id: string;
  ingredientA: CardRequirement;
  ingredientB: CardRequirement;
  outputCardId: string;
  outputStar: number;
  allowedPhase: 'intermission';
}

export interface EvolutionRecipesConfig {
  version: string;
  recipes: EvolutionRecipeDef[];
}

export type RunBaseStatKind = 'damageAdd' | 'fireRateAdd' | 'rangeAdd' | 'multiAdd' | 'maxHpAdd' | 'heal';

/** xpGainPct is the sole percentage-based exception in wave-end growth. */
export type WaveChoiceStatKind = RunBaseStatKind | 'xpGainPct';

export interface WaveFloorRewardDef {
  id: string;
  stat: RunBaseStatKind;
  add: number;
}

export interface WaveChoiceOptionDef {
  id: string;
  stat: WaveChoiceStatKind;
  add: number;
}

export interface WaveRewardsConfig {
  version: string;
  floor: WaveFloorRewardDef[];
  choice: WaveChoiceOptionDef[];
}

export interface EvolutionOptionDef {
  id: string;
  textKey: string;
  equip: BindingDef[];
}

export interface EvolutionCheckpointDef {
  star: number;
  options: EvolutionOptionDef[];
}

export interface EvolutionSharedNodeDef {
  star: number;
  equip?: BindingDef[];
  amplify?: Record<string, string>;
}

export interface EvolutionTreeDef {
  checkpoints: EvolutionCheckpointDef[];
  sharedNodes: EvolutionSharedNodeDef[];
}

export type CardStatKind = RunBaseStatKind | BuildScalingAxis;

export interface CardAffixCandidateDef {
  stat: CardStatKind;
  weight: number;
  min: number;
  max: number;
  step: number;
  consumableDuration: number;
}

/**
 * D2 预留：卡间融合（配方进化）时数值词条如何传递。**占位契约，运行时无效果**——
 * loader / 校验器只检查类型合法，解释器与词条系统一律忽略；实现见 Stage 5。
 * 缺省（不声明本字段）时行为与今日完全一致：融合产物按自身 affixPool 重新掷点。
 */
export interface CardFusionPolicyDef {
  /** 源卡词条如何合并进产物：none=不继承（当前实际行为）。 */
  affixTransferPolicy?: 'none' | 'strongest' | 'sum' | 'average';
  /** 同属性词条冲突时的取舍。 */
  conflictResolution?: 'keepHigher' | 'keepNewer' | 'reject';
  /** 允许作为融合来源的卡 id；缺省 = 由 evolutionRecipes 决定。 */
  sourceCardIds?: string[];
}

export interface CardAffixPoolDef {
  count: number;
  candidates: CardAffixCandidateDef[];
}

export interface ProgressionConfig {
  killXpMul: number;
  relicChoices: number;
  targetRelics: { min: number; max: number };
  xpThresholds: number[];
  rarityByRelicIndex: Array<Partial<Record<RelicDef['rarity'], number>>>;
  settlement: {
    winBonus: number;
    perWaveCleared: number;
    perKill: number;
    hpRatioBonusMax: number;
    perEquippedStarSquared: number;
    wildcardStarValue: Record<string, number>;
  };
}

export interface NormalDropTypePolicyConfig {
  enabled: boolean;
  roleBagSize: number;
  earlyMix: { discovery: number; build: number; pivot: number };
  lateMix: { discovery: number; build: number; pivot: number };
  bootstrapMinDiscovery: number;
  bootstrapForcedDrops: number;
  godAffinity: { scorePerStack: number; scoreCap: number };
  maturity: {
    fullMergeOps: number;
    fullHighestStar: number;
    fullEquippedTypes: number;
    mergeWeight: number;
    starWeight: number;
    equipWeight: number;
  };
  build: {
    topK: number;
    scorePower: number;
    mergeReadyMultiplier: number;
    equippedBaseBonus: number;
    equippedStarBonus: number;
    historicalMergeWeight: number;
    historicalMergeCap: number;
    maxWeightRatio: number;
  };
  pivot: { excludeTopK: number; candidateFraction: number };
  maxSameTypeStreak: number;
}

export interface EconomyConfig {
  maxStar: number;
  mergeCopies: number;
  mergeCopiesWhenTwoCopyDisabled: number;
  equipThreshold: number;
  handSlots: number;
  equipSlots: number;
  equipIrreversible: false;
  unequipPolicy: 'consume';
  equipSwappable: boolean;
  inRunSlotExpansion: boolean;
  equipDistinctTypes: boolean;
  feedEquipped: boolean;
  placeholderAssumptions: {
    twoCopyMerge: boolean;
    normalDropsOnlyOneStar: boolean;
    feedEquipped: boolean;
    distinctEquippedTypes: boolean;
  };
  dropStarPolicy: { normal: number; bountyBossMax: number; star2Share: number };
  drops: { pickupRadius: number; chanceCap: number };
  defaults: { dropChance: number; dropLifetime: number };
  normalDropTypePolicy: NormalDropTypePolicyConfig;
  ordinaryDropRate: OrdinaryDropRateConfig;
}

export type TunerGroup = 'waves' | 'combat' | 'enemies' | 'drops' | 'progression' | 'bounty' | 'p2';

/** 控件形态：number=滑杆、boolean=复选、enum=下拉、text=自由文本（当前仅 Boss 波次列表）。 */
export type TunerParamType = 'number' | 'boolean' | 'enum' | 'text';

/**
 * 调参元数据的**唯一来源**（范围 + 标签键 + 分组 + 生效策略 + 控件形态合一）。
 * 迁移前分散在 tuner.json（min/max/step）、ui/tunerSchema.ts（label/group/waveDeferred）
 * 与 ui/tunerPanel.ts（专用控件的内联 HTML）三处。
 */
export interface TunerParamMeta {
  /** 完整配置路径，例如 `combat.defaults.damage`；同时是本表的主键。 */
  path: string;
  type: TunerParamType;
  /** texts.json 中的文案键（`tuner.params.<path>`）。 */
  labelKey: string;
  group: TunerGroup;
  min?: number;
  max?: number;
  step?: number;
  /** waveDeferred = 战斗中改动排队到下一波生效。 */
  applyPolicy: 'immediate' | 'waveDeferred';
  /** 预留：单位标注（数值标定阶段填写，当前一律缺省）。 */
  unit?: string;
  /** type='enum' 的候选值。 */
  options?: readonly string[];
  /** false = 已声明范围但当前不在面板暴露；缺省视为 true。 */
  exposed?: boolean;
}

export interface TunerConfig {
  version: string;
  params: TunerParamMeta[];
}

export type ConfirmStyle = 'bubble' | 'hold-ring';
export type HoldOrDbl = 'double-tap' | 'long-press';

export interface InputConfig {
  tapMaxPx: number;
  tapMaxMs: number;
  reticleOffsetY: number;
  confirmStyle: ConfirmStyle;
  holdOrDbl: HoldOrDbl;
}

export interface GameConfig {
  combat: CombatConfig;
  waves: WavesConfig;
  enemies: EnemiesConfig;
  difficulty: DifficultyConfig;
  skills: SkillsConfig;
  gods: GodsConfig;
  relics: RelicsConfig;
  evolutionRecipes: EvolutionRecipesConfig;
  waveRewards: WaveRewardsConfig;
  progression: ProgressionConfig;
  economy: EconomyConfig;
  bounty: BountyConfig;
  input: InputConfig;
  tuner: TunerConfig;
}

/** variant 覆盖文件的形状：任意深度的部分覆盖。 */
export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
