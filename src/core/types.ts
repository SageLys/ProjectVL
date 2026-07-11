// 纯规则层类型定义。core/ 内禁止出现 DOM / Canvas / 浏览器 API。（P3 重构版）
import type { EffectDef } from './effects/defs';

/** 卡牌类型：P3 过渡期为 5 种旧数值卡；P5 实装技能卡后扩展为技能 id 字符串。 */
export type CardType = 'damage' | 'rate' | 'multi' | 'range' | 'luck';
export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss';
export type GameMode = 'ready' | 'playing' | 'ended';

/** 注入式随机源：返回 [0,1)。测试可传入确定性实现。 */
export type Rng = () => number;

export interface Card {
  id: number;
  type: CardType;
  star: number;
  /** 锁定即装备（方案B）：锁定卡=生效装备，不参与自动合成、不可直接消耗。 */
  locked?: boolean;
}

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
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  type: EnemyType;
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

export interface GroundDrop {
  id: number;
  x: number;
  y: number;
  type: CardType;
  star: number;
  life: number;
  maxLife: number;
  pulse: number;
}

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
}

/** 炮台护盾：按可吸收突破次数计。 */
export interface ShieldState {
  hits: number;
  maxHits: number;
  /** 破裂后再生剩余秒数（>0 = 再生中）；null = 不再生。 */
  regenRemaining: number | null;
  regenSeconds: number | null;
}

/** 限时全局增益（如同调:合成后射速 buff）。 */
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

export interface GameState {
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
  /** 独立装备格（equipMode='slots' 时使用；lock 模式下长度 0，装备=锁定卡）。 */
  equipment: (Card | null)[];
  zones: Zone[];
  summons: Summon[];
  shield: ShieldState | null;
  buffs: Buff[];
  /** interval 装备态绑定的计时器（key = 卡id:绑定序号）。 */
  intervalClocks: Record<string, number>;
  nextCardId: number;
  nextDropId: number;
  nextEnemyId: number;
  nextZoneId: number;
  nextSummonId: number;
  spawnLeft: number;
  spawnTimer: number;
  waveClearPending: boolean;
  damageBonus: number;
  fireRateBonus: number;
  multi: number;
  shotCd: number;
  turretAngle: number;
  xp: number;
  xpNeed: number;
  level: number;
  kills: number;
  merges: number;
  /** 遥测拆分（原 uses）：consumes=消耗释放次数；equipOps=装备操作次数。 */
  consumes: number;
  equipOps: number;
  collected: number;
  expired: number;
  /** 过期转化（expiryConvert）为经验的掉落数。 */
  expiredConverted: number;
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
  | { type: 'levelUp' }
  | { type: 'gameEnd'; win: boolean }
  | { type: 'breakthrough'; damage: number }
  | { type: 'cardsFull' }
  | { type: 'collected'; cardType: CardType; merges: number }
  | { type: 'equipFull' }
  | { type: 'unequipFull' }
  | { type: 'equipRejected'; reason: 'star' | 'duplicate' }
  | { type: 'moved'; cardType: CardType; merges: number }
  | { type: 'swapped'; a: CardType; b: CardType }
  | { type: 'merged'; cardType: CardType; resultStar: number }
  | { type: 'skillConsumed'; cardType: CardType; star: number; x: number; y: number }
  | { type: 'locked'; cardType: CardType }
  | { type: 'unlocked'; cardType: CardType }
  | { type: 'lockRejected'; reason: 'star' | 'limit' | 'duplicate' | 'locked' }
  | { type: 'fed'; cardType: CardType; resultStar: number }
  | { type: 'shieldBroken' }
  | { type: 'testDrops'; cardType: CardType }
  | { type: 'perkApplied'; title: string };
