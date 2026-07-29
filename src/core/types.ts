// 纯规则层类型定义。core/ 内禁止出现 DOM / Canvas / 浏览器 API。（P3 重构版）
import type { BuildTag, EffectDef, RuntimeStatKind } from './effects/defs';
import type { RunSummary } from './settlement';
import type { CardStatKind, DifficultyId, GodId, RunBaseStatKind, WaveChoiceStatKind } from '../config/types';
import type { ValidationRewardSpec, ValidationRewardTypePolicy } from '../config/types';

/** 卡牌类型 = 技能 id 字符串（schema: ^[a-z][a-zA-Z0-9]*$），由 skills.json 的 cards[].id 决定。 */
export type CardType = string;
export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss';
export type GameMode = 'ready' | 'playing' | 'ended';
export type WavePhase = 'regular' | 'boss' | 'between';
export type EnemySpawnKind = 'regular' | 'waveBoss' | 'bounty' | 'validationElite';
export type BountySide = 'top' | 'right' | 'bottom' | 'left';

export interface BountyOffer {
  id: number;
  rewardCardType: CardType;
  rewardCardStar: number;
  rewardCardCount: number;
  wildcardStar: number;
  wildcardCount: number;
  side: BountySide;
  x: number;
  y: number;
  remaining: number;
  guaranteed: boolean;
  createdAt: number;
}

export interface BountyEncounter {
  id: number;
  offerId: number;
  rewardCardType: CardType;
  rewardCardStar: number;
  rewardCardCount: number;
  wildcardStar: number;
  wildcardCount: number;
  side: BountySide;
  status: 'spawning' | 'active' | 'completed' | 'failed';
  memberIds: number[];
  pendingSpawnCount: number;
  spawnTimer: number;
  guaranteed: boolean;
  acceptedAt: number;
  hpAtAccept: number;
  lastKillX: number;
  lastKillY: number;
}

export interface BountyDirectorState {
  offersThisWave: number;
  acceptedThisWave: number;
  completedThisWave: number;
  checkTimer: number;
  cooldownRemaining: number;
  lastHpLossAt: number;
  rewardBag: CardType[];
  lastRewardType: CardType | null;
  /** Whether the deterministic minimum-offer guarantee fired this wave. */
  guaranteedThisWave: boolean;
}

export type NormalDropRole = 'discovery' | 'build' | 'pivot';

export interface CardTypeRunStats {
  /** Number of times this type appeared from a normal enemy kill. */
  ordinaryShown: number;
  /** Number of appearances across every tracked drop source. */
  totalShown: number;
  collected: number;
  mergeOps: number;
  /** Highest star reached historically during the current run. */
  highestStarReached: number;
  /** ordinaryDropCount value when this type last appeared from a normal kill. */
  lastOrdinaryShownAt: number;
}

export interface NormalDropDirectorState {
  roleBag: NormalDropRole[];
  recentTypes: CardType[];
  ordinaryDropCount: number;
  typeStats: Record<CardType, CardTypeRunStats>;
}

export interface OrdinaryDropBudgetState {
  credit: number;
  activeRegularSeconds: number;
  shownThisWave: number;
  eligibleKillsThisWave: number;
  /** Effective regular-combat seconds elapsed since the build stage began. */
  buildStageSeconds: number;
}

/** 注入式随机源：返回 [0,1)。测试可传入确定性实现。 */
export type Rng = () => number;

export interface CardAffixRoll {
  stat: CardStatKind;
  value: number;
  consumableDuration: number;
}

export interface Card {
  id: number;
  type: CardType;
  star: number;
  evolutionPath?: string[];
  /** Checkpoint merge product waiting for this card's branch choice. */
  provisional?: boolean;
  affixes?: CardAffixRoll[];
}

export interface CardRef {
  slotKind: 'cards' | 'equipment';
  index: number;
  cardId: number;
}

export type RunDecision =
  | { kind: 'godDraft'; wave: number; candidates: GodId[]; role: 'main' | 'sub' }
  | { kind: 'godFocus'; wave: number; candidates: GodId[] }
  | { kind: 'evolutionBranch'; cardType: CardType; checkpointStar: number; options: string[]; provisionalCardId: number }
  | { kind: 'recipeEvolution'; recipeId: string }
  | { kind: 'relic'; relicIndex: number; options: string[] }
  | { kind: 'waveBaseReward'; wave: number; candidates: string[]; capped: string[] };

export interface DecisionQueueState {
  current: RunDecision | null;
  pending: RunDecision[];
}

export interface GodPoolState {
  mainGod: GodId | null;
  subGods: GodId[];
  focusGod: GodId | null;
  runRoster: CardType[];
  rosterByGod: Record<GodId, CardType[]>;
  offerDrought: Record<GodId, number>;
  bootstrapQueue: CardType[];
  bootstrapDropsRemaining: number;
  activePool: CardType[];
  previousActivePool: CardType[];
  activePoolHistory: CardType[];
  activePoolWave: number;
  lastDecisionAfterWave: number;
  offerRosterPreviews: Record<GodId, CardType[]>;
}

export interface RunBaseStats {
  damageAdd: number;
  fireRateAdd: number;
  rangeAdd: number;
  multiAdd: number;
}

export interface WaveRewardGrant {
  id: string;
  stat: RunBaseStatKind;
  add: number;
}

export type IntermissionStep = 'settle' | 'decide' | 'free';

export interface IntermissionState {
  active: boolean;
  afterWave: number;
  step: IntermissionStep;
  settleRemaining: number;
  freeRemaining: number;
  readyConfirmed: boolean;
  rewardsGranted: WaveRewardGrant[];
}

export type WildcardInventory = Record<number, number>;

/** 敌人身上的状态效果（效果解释器写入，各系统读取；冲突仲裁见 effects/statusSystem）。 */
export interface EnemyStatus {
  /** 减速：取最强 ratio，刷新剩余时长。 */
  slow: { ratio: number; remaining: number } | null;
  /** 冻结剩余秒数（>0 = 不可动；抑制击退）。 */
  frozen: number;
  /** 冻结层数（frost 2★ 修饰：叠满触发冻结）。 */
  freezeStacks: number;
  /** 眩晕剩余秒数（>0 = 不可动）。 */
  stunned: number;
  /** 解控免疫窗：冻结/眩晕结束后一小段时间内免疫再次硬控，期间冻结层不累积。 */
  ccImmune: number;
  /** 易伤：受到伤害 ×(1+ratio)。 */
  vulnerable: { ratio: number; remaining: number } | null;
  /** 持续伤害（直接挂敌身的 dot；区域 dot 走 Zone tick）。 */
  dots: { dps: number; remaining: number }[];
  /** 烙印（focusPriority）：炮台索敌优先级权重。 */
  brand: { weight: number; remaining: number } | null;
  /** 嘲讽候选集：由 activeTaunt 统一仲裁移动目标。 */
  taunt: TauntCandidate[];
  /** 击退疲劳:短窗口内连续击退按 multiplier 递减;窗口过期重置。 */
  kbFatigue: { multiplier: number; remaining: number } | null;
}

export interface PendingMergeRefund {
  cardType: CardType;
  star: number;
  count: number;
}

export interface TauntCandidate {
  sourceKey: string;
  priorityWeight: number;
  x: number;
  y: number;
  summonId?: number;
  remaining: number;
}

export interface BossRuntimeState {
  phase: 'approach' | 'contact';
  orbitDirection: -1 | 1;
  contactTickRemaining: number;
  contactAngle: number;
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  type: EnemyType;
  spawnKind: EnemySpawnKind;
  label: string;
  hp: number;
  maxHp: number;
  speed: number;
  r: number;
  color: string;
  damage: number;
  /** Difficulty-adjusted contact damage per second. Only populated for wave Bosses. */
  contactDps?: number;
  xp: number;
  hit: number;
  status: EnemyStatus;
  statMods?: { hpMul: number; speedMul: number; damageMul: number };
  bountyEncounterId?: number;
  bountyRewardType?: CardType;
  ccResistOverride?: number;
  knockbackResistOverride?: number;
  validationReward?: ValidationRewardSpec;
  /** Presentation-only memory used to emit a pulse when the arbitrated taunt source changes. */
  tauntVfxSourceKey?: string;
  bossRuntime?: BossRuntimeState;
}

/** EffectDef 是判别联合，故用交叉类型扩展而非 interface extends。 */
export type AttackRider = EffectDef & {
  /** Equipment card that attached this rider, for DEV attribution only. */
  sourceCardId?: number;
};

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  damage: number;
  /** 弹种：normal=直射；mortar=抛射至落点爆炸；fragment=分裂片（不再二次分裂）。 */
  kind?: 'normal' | 'mortar' | 'fragment';
  /** 剩余穿透数。 */
  pierceLeft?: number;
  /** 穿透/连锁伤害保留比。 */
  damageRetention?: number;
  /** 每穿透一个的伤害递增比。 */
  rampPerPierce?: number;
  /** 已命中敌人 id（穿透弹防重复命中）。 */
  hitIds?: number[];
  /** 命中时施加的附着效果（onFire 装备态写入，如减速/冻结层/击退）。 */
  riders?: AttackRider[];
  /** mortar 落点。 */
  targetX?: number;
  targetY?: number;
  /** mortar 爆炸参数。 */
  aoeRadius?: number;
  aoeFalloff?: number;
  /** 剩余场边反弹次数（ricochet）。 */
  ricochetLeft?: number;
  /** 分裂代数（split 原子用，0=原弹）；配合 split 的 maxDepth 参数防止子弹片再分裂形成指数级增殖。 */
  splitDepth?: number;
  /** 统一攻击实例；普通弹/榴弹/分裂片与光束共享同一命中与触发语义。 */
  attack?: AttackInstance;
  /** 原子生成的分裂片延迟到下一帧进入 beginAttack/onFire。 */
  pendingOnFire?: boolean;
  /** 0..1 visual flight progress for mortar arc rendering. */
  flightProgress?: number;
  /** DEV attribution for projectiles emitted by an equipment summon. */
  sourceCardId?: number;
}

export type AttackDelivery = 'projectile' | 'line' | 'lob';

export interface WeaponImpactSpec {
  kind: 'aoe';
  sourceCardId?: number;
  sourceCardType: CardType;
  sourceStar: number;
  damageRatio: number;
  radius: number;
  falloff: number;
}

/** 每次开火（或每道持续光束）只有一个实例，命中去重与 riders 均挂在这里。 */
export interface AttackInstance {
  attackId: number;
  delivery: AttackDelivery;
  /** 开火时快照的炮台基础伤害，供 riders 与 legacy fallback 使用。 */
  baseDamage: number;
  /** 按 delivery 分配的单次范围形态预算；不改变 baseDamage 的 legacy 语义。 */
  impactBudget: number;
  damage: number;
  riders: AttackRider[];
  hitIds: number[];
  impacts: WeaponImpactSpec[];
  sourceStar: number;
  /** Card owning the delivery axis; ordinary turret shots have no source card. */
  sourceCardId?: number;
}

/** 真持续光束运行时实体；表现层在后续任务中读取这些数据绘制。 */
export interface BeamEntity extends AttackInstance {
  angle: number;
  width: number;
  range: number;
  remaining: number;
  duration: number;
  tickTimer: number;
  tickInterval: number;
  damagePerTick: number;
}

/** Pure output channel: combat rules may append and age VFX, but never branch on them. */
export type CombatVfx =
  | { kind: 'mortarTarget'; x: number; y: number; radius: number; remaining: number }
  | { kind: 'mortarImpact'; x: number; y: number; radius: number; remaining: number }
  | { kind: 'tauntPulse'; enemyId: number; remaining: number }
  | { kind: 'summonEvent'; x: number; y: number; event: 'hit' | 'destroyed' | 'respawn'; remaining: number }
  | { kind: 'shieldAbsorb'; x: number; y: number; remaining: number }
  | { kind: 'shieldBreak'; x: number; y: number; remaining: number }
  | { kind: 'shieldRegen'; x: number; y: number; remaining: number }
  | { kind: 'thornsReflect'; x: number; y: number; enemyId: number; remaining: number }
  | { kind: 'retaliationNova'; x: number; y: number; radius: number; remaining: number }
  | { kind: 'breachMitigated'; x: number; y: number; remaining: number };

export interface PerCardCombatTelemetry {
  triggers: number;
  hits: number;
  damage: number;
  suppressedByFusion?: number;
}

export interface CombatTelemetryState {
  wave: number;
  perCard: Record<number, PerCardCombatTelemetry>;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface GroundDropBase {
  id: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  pulse: number;
  source?: CardDropSource;
  bountyEncounterId?: number;
  secure?: boolean;
  /** Validation reward pickup that must be collected before its wave can finish. */
  validationRewardWave?: number;
  validationTypePolicy?: ValidationRewardTypePolicy;
}

export type CardDropSource = 'normalKill' | 'bossKill' | 'bounty' | 'skillExtra' | 'debug' | 'validationElite';
export interface GroundCardDrop extends GroundDropBase {
  kind: 'card';
  type: CardType;
  star: number;
}
export interface GroundWildcardDrop extends GroundDropBase {
  kind: 'wildcard';
  star: number;
  count: number;
  /** Set only for the wave Boss reward so phase progression can wait for this drop. */
  bossRewardWave?: number;
}
export type GroundDrop = GroundCardDrop | GroundWildcardDrop;

/** 地面区域（groundZone/aura 消耗态落点化）：周期对区域内敌人施加内嵌效果。 */
export interface Zone {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** 环带内径（shape=ring 时生效）。 */
  innerRadius?: number;
  shape: 'circle' | 'ring';
  remaining: number;
  tickInterval: number;
  tickTimer: number;
  effects: EffectDef[];
  sourceCardId?: number;
  sourceCardType?: CardType;
  sourceBindingIndex?: number;
  /** 效果结算的伤害基准（创建时的炮台总伤）。 */
  baseDamage: number;
  color?: string;
}

/** 召唤物：诱饵图腾 / 镜像炮台 / 环绕球。 */
export interface Summon {
  id: number;
  kind: 'decoy' | 'mirrorTurret' | 'orbital';
  /** 装备态召唤物来源；无来源表示消耗态/其他临时召唤物，仍走自身 duration。 */
  sourceCardId?: number;
  sourceCardType?: CardType;
  sourceBindingIndex?: number;
  sourceEffectIndex?: number;
  /** 装备态重生/换波刷新复用的放置策略。 */
  placement?: 'threatDirection';
  distanceFromTurret?: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 剩余存在秒数；undefined = 直到被摧毁。 */
  remaining?: number;
  tauntRadius?: number;
  priorityWeight?: number;
  /** 镜像炮台/环绕球：本体伤害比例、配置冷却与当前冷却。 */
  damageRatio?: number;
  fireInterval: number;
  fireCd?: number;
  /** 环绕球公转角。 */
  angle?: number;
  /** 被摧毁/到期时爆炸（decoy 2★ 修饰）。 */
  explodeOnDeath?: { damage: number; knockbackDistance: number } | null;
  /** 被摧毁时在新位置重生一次（decoy 5★ 修饰）；respawned 标记该次重生已用掉。 */
  respawnOnce?: boolean;
  respawned?: boolean;
}

/** 炮台护盾：按可吸收突破次数计。 */
export interface ShieldState {
  hits: number;
  maxHits: number;
  /** 破裂后再生剩余秒数（>0 = 再生中）；null = 不再生。 */
  regenRemaining: number | null;
  regenSeconds: number | null;
}

/** Generic runtime stat modifier. Consumable affixes always set remaining. */
export interface RuntimeStatModifier {
  sourceId: string;
  stat: RuntimeStatKind;
  operation: 'add' | 'mul';
  value: number;
  remaining?: number;
}

/** 运行期可调参数（对应调参面板；由 cfg 各域 defaults 组装）。 */
export interface Config {
  damage: number;
  fireRate: number;
  range: number;
  dropChance: number;
  dropLifetime: number;
  enemySpeed: number;
}

export interface BuildState {
  /** BuildTag affinity is retained as a read-only compatibility snapshot for one release. */
  affinity: Record<BuildTag, number>;
  /** Relic routing affinity is god-scoped; neutral relics never increment it. */
  godAffinity: Record<GodId, number>;
  /** Relics in selection order. */
  relicHistory: string[];
  /** Incremented whenever a relic is applied, invalidating cached build-scaling totals. */
  scalingVersion: number;
  /** Forces a card from the selected god within this many build-role drops. */
  dropPity?: { god: GodId; remaining: number };
}

export interface RunBuildState {
  cardAffixRolls: Record<CardType, CardAffixRoll[]>;
}

export interface GameState {
  difficultyId: DifficultyId;
  mode: GameMode;
  paused: boolean;
  time: number;
  hp: number;
  /** Permanent maximum HP: initial config plus run-wide permanent rewards. */
  baseMaxHp: number;
  /** Derived cache. Only reconcileMaxHp should update this value. */
  maxHp: number;
  wave: number;
  decisions: DecisionQueueState;
  /** Run-scoped build data; evolution routes themselves are stored per card instance. */
  runBuild: RunBuildState;
  godPool: GodPoolState;
  intermission: IntermissionState;
  enemies: Enemy[];
  bullets: Bullet[];
  beams: BeamEntity[];
  vfx: CombatVfx[];
  particles: Particle[];
  groundDrops: GroundDrop[];
  cards: (Card | null)[];
  /** 合成返还先进入此队列，待当前自动合并循环稳定后再发牌，避免循环中途重入。 */
  pendingMergeRefunds: PendingMergeRefund[];
  /** 独立装备格；装备卡可拖到战场消耗释放，不可回到手牌。 */
  equipment: (Card | null)[];
  /** 按目标当前星级储存的万能卡数量；合法键 1..maxStar-1（当前 1..5）。独立于 cards/equipment。 */
  wildcards: WildcardInventory;
  zones: Zone[];
  summons: Summon[];
  shield: ShieldState | null;
  statModifiers: RuntimeStatModifier[];
  /** interval 装备态绑定的计时器（key = 卡id:绑定序号）。 */
  intervalClocks: Record<string, number>;
  /** 任意触发器绑定的冷却截止时刻（state.time 基准；key = cd:卡id:绑定序号），供 triggerParams.cooldownSeconds 使用。 */
  cooldowns: Record<string, number>;
  nextCardId: number;
  nextDropId: number;
  nextEnemyId: number;
  nextZoneId: number;
  nextSummonId: number;
  nextAttackId: number;
  /** Per-wave DEV counters. Core writes plain data; the HUD is an optional reader. */
  combatTelemetry: CombatTelemetryState;
  spawnLeft: number;
  waveSpawnQuota: number;
  spawnTimer: number;
  /** DEV-visible result of the latest Budget admission check (not configuration). */
  lastSpawnCheckCount: number;
  wavePhase: WavePhase;
  waveBossId: number | null;
  waveBossSpawnedAt: number | null;
  bossRewardClaimedWave: number;
  runBaseStats: RunBaseStats;
  /** Highest wave whose automatic base rewards were settled. Persist this with the run. */
  waveRewardsClaimedWave: number;
  /** Highest wave whose base-reward choice was offered. Persist this with the run. */
  waveChoiceOfferedWave: number;
  /** Legacy perk-only additive damage source; removed with stat perks in C4. */
  damageBonus: number;
  /** Legacy perk-only additive fire-rate source; removed with stat perks in C4. */
  fireRateBonus: number;
  /** Legacy base projectile count; C2 wave growth is stored in runBaseStats.multiAdd. */
  multi: number;
  shotCd: number;
  turretAngle: number;
  xp: number;
  xpNeed: number;
  level: number;
  relicStacks: Record<string, number>;
  buildState: BuildState;
  xpGainBonus: number;
  /** Legacy perk percentage source; C2 wave growth is pixel-based runBaseStats.rangeAdd. */
  rangeBonus: number;
  kills: number;
  merges: number;
  /** Fixed recipes completed during this run, in completion order. */
  completedRecipes: string[];
  /** 遥测拆分（原 uses）：consumes=消耗释放次数；equipOps=装备操作次数。 */
  consumes: number;
  equipOps: number;
  /** H6 观察项：装备尝试耗时与取消/拒绝（误触代理）次数。 */
  equipTelemetry: { durationsMs: number[]; cancels: number; rejects: number };
  collected: number;
  expired: number;
  bountyOffers: BountyOffer[];
  bountyEncounters: BountyEncounter[];
  bountyDirector: BountyDirectorState;
  normalDropDirector: NormalDropDirectorState;
  ordinaryDrop: OrdinaryDropBudgetState;
  nextBountyOfferId: number;
  nextBountyEncounterId: number;
  runSummary: RunSummary | null;
}

/** 卡槽/装备栏归属。临时栏已随 P0-3/P0-6 移除。 */
export type SlotKind = 'cards' | 'equipment';

/**
 * 语义化游戏事件。表现层（toast / 弹窗 / UI 刷新）据此驱动，
 * core/ 只产出语义，不产出最终文案或触碰 DOM。
 * 同时是效果解释器的触发器总线载体（onWaveStart/onBreach/onPickup/onMerge 等）。
 */
export type GameEvent =
  | { type: 'waveStart'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'waveBossSpawned'; wave: number }
  | { type: 'decisionOffered'; kind: RunDecision['kind'] }
  | { type: 'decisionResolved'; kind: RunDecision['kind']; choice: string }
  | { type: 'godOffer'; wave: number; role: 'main' | 'sub' | 'focus'; candidates: GodId[] }
  | { type: 'godSelected'; wave: number; role: 'main' | 'sub' | 'focus'; god: GodId }
  | { type: 'runRosterCreated'; cardTypes: CardType[] }
  | { type: 'activePoolCreated'; wave: number; focusGod: GodId | null; cardTypes: CardType[] }
  | { type: 'intermissionReady'; wave: number; automatic: boolean }
  | { type: 'waveRewardsGranted'; wave: number; granted: WaveRewardGrant[] }
  | { type: 'waveBaseRewardOffered'; wave: number; candidates: string[] }
  | { type: 'waveBaseRewardChosen'; wave: number; stat: WaveChoiceStatKind; add: number }
  | { type: 'bossRewardGranted'; wave: number; grants: Array<{ star: number; count: number }> }
  | { type: 'levelUp' }
  | { type: 'relicOffered'; relicIndex: number; options: string[] }
  // 只带 id：显示名属皮肤层，由 ui/relicMeta 依 textKey 解析（core 不得依赖 texts）。
  | { type: 'relicSelected'; relicId: string; rarity: 'common' | 'rare' | 'epic'; god?: GodId }
  | { type: 'evolutionBranchOffered'; cardType: CardType; checkpointStar: number; options: string[]; provisionalCardId: number }
  | { type: 'evolutionBranchSelected'; cardType: CardType; checkpointStar: number; optionId: string; provisionalCardId: number }
  | { type: 'recipeAvailable'; recipeIds: string[] }
  | { type: 'recipeCompleted'; recipeId: string; outputCardType: CardType; outputStar: number }
  | { type: 'recipeRejected'; recipeId: string; reason: 'phase' | 'materials' | 'slots' }
  | { type: 'affixRolled'; cardType: CardType; affixes: CardAffixRoll[] }
  | { type: 'gameEnd'; win: boolean }
  | { type: 'breakthrough'; damage: number }
  | { type: 'bossContactStarted'; enemyId: number }
  | { type: 'bossContactDamage'; enemyId: number; damage: number }
  | { type: 'bossContactEnded'; enemyId: number }
  | { type: 'cardsFull'; dropId?: number; source?: CardDropSource; star?: number; secure?: boolean }
  | { type: 'collected'; cardType: CardType; merges: number; bountyEncounterId?: number; dropId?: number; source?: CardDropSource; star?: number; secure?: boolean; validationRewardWave?: number; validationTypePolicy?: ValidationRewardTypePolicy }
  | { type: 'equipFull' }
  | { type: 'equipRejected'; reason: 'star' | 'duplicate' | 'provisional' }
  | { type: 'moved'; cardType: CardType; merges: number }
  | { type: 'swapped'; a: CardType; b: CardType }
  | { type: 'merged'; cardType: CardType; resultStar: number; resultCardId?: number }
  | { type: 'mergeRefunded'; cardType: CardType; star: number; granted: number; lost: number }
  | { type: 'skillConsumed'; cardType: CardType; star: number; x: number; y: number }
  | { type: 'equipped'; cardType: CardType; star: number; slotIndex: number }
  | { type: 'fed'; cardType: CardType; resultStar: number; slotIndex?: number; targetCardId?: number }
  | { type: 'wildcardsGranted'; grants: Array<{ star: number; count: number }>; bountyEncounterId?: number; dropId?: number; source?: CardDropSource; star?: number; secure?: boolean; validationRewardWave?: number }
  | { type: 'dropExpired'; dropId: number; source?: CardDropSource; star: number; secure?: boolean; validationRewardWave?: number }
  | {
      type: 'wildcardMerged';
      cardType: CardType;
      consumedStar: number;
      resultStar: number;
      targetKind: SlotKind;
      targetIndex: number;
      targetCardId: number;
    }
  | { type: 'wildcardMergeRejected'; reason: 'emptyTarget' | 'maxStar' | 'missingWildcard' | 'provisional'; requiredStar?: number }
  | { type: 'bountyOfferSpawned'; offerId: number; rewardCardType: CardType; guaranteed: boolean }
  | { type: 'bountyOfferExpired'; offerId: number }
  | { type: 'bountyAccepted'; offerId: number; encounterId: number; rewardCardType: CardType; side: BountySide; decisionSeconds: number; memberCount: number }
  | { type: 'bountyMemberSpawned'; encounterId: number; enemyId: number }
  | { type: 'bountyCompleted'; encounterId: number; rewardCardType: CardType; clearSeconds: number }
  | { type: 'bountyFailed'; encounterId: number }
  | { type: 'bountyRewardDropped'; encounterId: number; rewardCardType: CardType }
  | { type: 'shieldBroken' }
  | { type: 'shieldRestored' }
  | { type: 'testDrops'; cardType: CardType };
