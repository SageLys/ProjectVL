// 配置层类型：游戏域 + input（T1 输入校准值）+ tuner（调参面板元数据）。
// P3 配置重组：所有可调数值经此处；variant = 对 base 的深覆盖（见 loader.ts）。
import type { BuildTag, CardDef } from '../core/effects/defs';

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

export type ValidationRewardTypePolicy = 'build' | 'pivot' | 'uniform';

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
  selectionWaves: number;
  validationWaves: number;
  selection: RegularStageConfig;
  build: RegularStageConfig;
  validation: ValidationWaveConfig[];
}

export interface OrdinaryDropRateConfig {
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
  betweenWaves: number;
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
}

export interface EnemiesConfig {
  defaults: { enemySpeed: number };
  types: Record<'normal' | 'fast' | 'tank' | 'boss', EnemyDef>;
}

export interface SkillsConfig {
  version: string;
  cards: CardDef[];
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

export type PerkStatKind = 'damagePct' | 'fireRatePct' | 'heal' | 'maxHp' | 'xpGainPct' | 'rangePct';

export interface PerkStatEffect { kind: 'stat'; stat: PerkStatKind; value: number; }

export type BuildScalingAxis =
  | 'effectDamageMul'
  | 'quantityAdd'
  | 'controlPotencyMul'
  | 'controlledDamageTakenMul'
  | 'areaScaleMul'
  | 'dotDamageMul'
  | 'defenseDurabilityMul'
  | 'retaliationMul';

export interface PerkBuildEffect {
  kind: 'buildScaling';
  targetTags: BuildTag[];
  axis: BuildScalingAxis;
  value: number;
}

export type PerkEffect = PerkStatEffect | PerkBuildEffect;

export interface PerkDef {
  id: string;
  title: string;
  desc: string;
  lane: BuildTag;
  affinityGain: number;
  effects: PerkEffect[];
  offerRole: 'route' | 'bridge' | 'utility';
  weight: number;
  maxStacks: number;
}

export interface ProgressionConfig {
  xpNeedBase: number;
  xpGrowth: number;
  killXpMul: number;
  perkChoices: number;
  perks: PerkDef[];
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
  affinity: { scorePerStack: number; scoreCap: number; pityWindow: number };
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

export interface TunerRange {
  min: number;
  max: number;
  step: number;
}

/** key 为面板参数的完整配置路径（例如 `combat.defaults.damage`）。 */
export type TunerConfig = Record<string, TunerRange>;

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
  progression: ProgressionConfig;
  economy: EconomyConfig;
  bounty: BountyConfig;
  input: InputConfig;
  tuner: TunerConfig;
}

/** variant 覆盖文件的形状：任意深度的部分覆盖。 */
export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
