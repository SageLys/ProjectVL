// 纯规则层类型定义。core/ 内禁止出现 DOM / Canvas / 浏览器 API。（P3 重构版）
import type { BuildTag, EffectDef } from './effects/defs';
import type { RunSummary } from './settlement';
import type { DifficultyId } from '../config/types';

/** 卡牌类型 = 技能 id 字符串（schema: ^[a-z][a-zA-Z0-9]*$），由 skills.json 的 cards[].id 决定。 */
export type CardType = string;
export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss';
export type GameMode = 'ready' | 'playing' | 'ended';
export type WavePhase = 'regular' | 'boss' | 'between';
export type EnemySpawnKind = 'regular' | 'waveBoss' | 'bounty';
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

/** 注入式随机源：返回 [0,1)。测试可传入确定性实现。 */
export type Rng = () => number;

export interface Card {
  id: number;
  type: CardType;
  star: number;
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
  /** 易伤：受到伤害 ×(1+ratio)。 */
  vulnerable: { ratio: number; remaining: number } | null;
  /** 持续伤害（直接挂敌身的 dot；区域 dot 走 Zone tick）。 */
  dots: { dps: number; remaining: number }[];
  /** 烙印（focusPriority）：炮台索敌优先级权重。 */
  brand: { weight: number; remaining: number } | null;
  /** 嘲讽：移动目标改为坐标/召唤物。 */
  taunt: { x: number; y: number; remaining: number; summonId?: number } | null;
  /** 击退疲劳:短窗口内连续击退按 multiplier 递减;窗口过期重置。 */
  kbFatigue: { multiplier: number; remaining: number } | null;
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
  xp: number;
  hit: number;
  status: EnemyStatus;
  statMods?: { hpMul: number; speedMul: number; damageMul: number };
  bountyEncounterId?: number;
  bountyRewardType?: CardType;
}

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
  riders?: EffectDef[];
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
  bountyEncounterId?: number;
}

export type CardDropSource = 'normalKill' | 'bossKill' | 'bounty' | 'skillExtra' | 'debug';
export interface GroundCardDrop extends GroundDropBase {
  kind: 'card';
  type: CardType;
  star: number;
  source?: CardDropSource;
}
export interface GroundWildcardDrop extends GroundDropBase { kind: 'wildcard'; star: number; count: number; }
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
  /** 效果结算的伤害基准（创建时的炮台总伤）。 */
  baseDamage: number;
  color?: string;
}

/** 召唤物：诱饵图腾 / 镜像炮台 / 环绕球。 */
export interface Summon {
  id: number;
  kind: 'decoy' | 'mirrorTurret' | 'orbital';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 剩余存在秒数；undefined = 直到被摧毁。 */
  remaining?: number;
  tauntRadius?: number;
  priorityWeight?: number;
  /** 镜像炮台：本体伤害比例与开火冷却。 */
  damageRatio?: number;
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

/** 限时全局增益（如技能触发后的射速 buff）。 */
export interface Buff {
  kind: 'fireRateMul' | 'damageMul';
  mul: number;
  remaining: number;
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
  /** 玩家通过升级主动表达的流派倾向；不锁流派，只表达意图。 */
  affinity: Record<BuildTag, number>;
  /** 依次记录已选 perk id。 */
  perkHistory: string[];
  /** Incremented whenever a perk is applied, invalidating cached build-scaling totals. */
  scalingVersion: number;
  /** 只由后续 build 位消费的流派命中保底。 */
  dropPity?: { lane: BuildTag; remaining: number };
}

export interface GameState {
  difficultyId: DifficultyId;
  mode: GameMode;
  paused: boolean;
  time: number;
  hp: number;
  maxHp: number;
  wave: number;
  between: number;
  enemies: Enemy[];
  bullets: Bullet[];
  particles: Particle[];
  groundDrops: GroundDrop[];
  cards: (Card | null)[];
  /** 独立装备格；装备卡可拖到战场消耗释放，不可回到手牌。 */
  equipment: (Card | null)[];
  /** 按目标当前星级储存的万能卡数量；合法键 1..maxStar-1（当前 1..5）。独立于 cards/equipment。 */
  wildcards: WildcardInventory;
  zones: Zone[];
  summons: Summon[];
  shield: ShieldState | null;
  buffs: Buff[];
  /** interval 装备态绑定的计时器（key = 卡id:绑定序号）。 */
  intervalClocks: Record<string, number>;
  /** 任意触发器绑定的冷却截止时刻（state.time 基准；key = cd:卡id:绑定序号），供 triggerParams.cooldownSeconds 使用。 */
  cooldowns: Record<string, number>;
  nextCardId: number;
  nextDropId: number;
  nextEnemyId: number;
  nextZoneId: number;
  nextSummonId: number;
  spawnLeft: number;
  waveSpawnQuota: number;
  spawnTimer: number;
  /** DEV-visible result of the latest Budget admission check (not configuration). */
  lastSpawnCheckCount: number;
  wavePhase: WavePhase;
  waveBossId: number | null;
  waveBossSpawnedAt: number | null;
  bossRewardClaimedWave: number;
  damageBonus: number;
  fireRateBonus: number;
  multi: number;
  shotCd: number;
  turretAngle: number;
  xp: number;
  xpNeed: number;
  level: number;
  pendingLevelUps: number;
  offeredPerks: string[];
  perkStacks: Record<string, number>;
  buildState: BuildState;
  xpGainBonus: number;
  rangeBonus: number;
  kills: number;
  merges: number;
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
  | { type: 'bossRewardGranted'; wave: number; grants: Array<{ star: number; count: number }> }
  | { type: 'levelUp' }
  | { type: 'gameEnd'; win: boolean }
  | { type: 'breakthrough'; damage: number }
  | { type: 'cardsFull' }
  | { type: 'collected'; cardType: CardType; merges: number; bountyEncounterId?: number }
  | { type: 'equipFull' }
  | { type: 'equipRejected'; reason: 'star' | 'duplicate' }
  | { type: 'moved'; cardType: CardType; merges: number }
  | { type: 'swapped'; a: CardType; b: CardType }
  | { type: 'merged'; cardType: CardType; resultStar: number; resultCardId?: number }
  | { type: 'skillConsumed'; cardType: CardType; star: number; x: number; y: number }
  | { type: 'equipped'; cardType: CardType; star: number; slotIndex: number }
  | { type: 'fed'; cardType: CardType; resultStar: number; slotIndex?: number; targetCardId?: number }
  | { type: 'wildcardsGranted'; grants: Array<{ star: number; count: number }>; bountyEncounterId?: number }
  | {
      type: 'wildcardMerged';
      cardType: CardType;
      consumedStar: number;
      resultStar: number;
      targetKind: SlotKind;
      targetIndex: number;
      targetCardId: number;
    }
  | { type: 'wildcardMergeRejected'; reason: 'emptyTarget' | 'maxStar' | 'missingWildcard'; requiredStar?: number }
  | { type: 'bountyOfferSpawned'; offerId: number; rewardCardType: CardType; guaranteed: boolean }
  | { type: 'bountyOfferExpired'; offerId: number }
  | { type: 'bountyAccepted'; offerId: number; encounterId: number; rewardCardType: CardType; side: BountySide; decisionSeconds: number; memberCount: number }
  | { type: 'bountyMemberSpawned'; encounterId: number; enemyId: number }
  | { type: 'bountyCompleted'; encounterId: number; rewardCardType: CardType; clearSeconds: number }
  | { type: 'bountyFailed'; encounterId: number }
  | { type: 'bountyRewardDropped'; encounterId: number; rewardCardType: CardType }
  | { type: 'shieldBroken' }
  | { type: 'testDrops'; cardType: CardType }
  | { type: 'perkApplied'; title: string; lane: BuildTag };
