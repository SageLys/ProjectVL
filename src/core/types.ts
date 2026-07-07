// 纯规则层类型定义。core/ 内禁止出现 DOM / Canvas / 浏览器 API。

export type CardType = 'damage' | 'rate' | 'multi' | 'range' | 'luck';
export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss';
export type GameMode = 'ready' | 'playing' | 'ended';

/** 注入式随机源：返回 [0,1)。测试可传入确定性实现。 */
export type Rng = () => number;

export interface Card {
  id: number;
  type: CardType;
  star: number;
}

export interface Enemy {
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
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  damage: number;
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

/** 运行期可调参数（对应调参面板与 gameConfig.defaultConfig）。 */
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
  equipment: (Card | null)[];
  tempCards: Card[];
  nextCardId: number;
  nextDropId: number;
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
  uses: number;
  collected: number;
  expired: number;
}

/** 卡槽/装备栏归属。'temp' 仅作为拖拽/移动的目标。 */
export type SlotKind = 'cards' | 'equipment' | 'temp';

/**
 * 语义化游戏事件。表现层（toast / 弹窗 / UI 刷新）据此驱动，
 * core/ 只产出语义，不产出最终文案或触碰 DOM。
 */
export type GameEvent =
  | { type: 'tempCleared'; count: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'levelUp' }
  | { type: 'gameEnd'; win: boolean }
  | { type: 'breakthrough'; damage: number }
  | { type: 'cardsFull' }
  | { type: 'collected'; cardType: CardType; merges: number }
  | { type: 'equipFull' }
  | { type: 'unequipFull' }
  | { type: 'equipRejected' }
  | { type: 'tempInvest'; cardType: CardType; merges: number }
  | { type: 'moved'; cardType: CardType; merges: number }
  | { type: 'swapped'; a: CardType; b: CardType }
  | { type: 'testDrops'; cardType: CardType }
  | { type: 'perkApplied'; title: string };
