// 配置层类型：六个域（combat/waves/enemies/skills/progression/economy）+ tuner（调参面板元数据）。
// P3 配置重组：所有可调数值经此处；variant = 对 base 的深覆盖（见 loader.ts）。
import type { CardDef, BountyConfig } from '../core/effects/defs';

export interface CombatConfig {
  canvas: { width: number; height: number };
  turret: { x: number; y: number };
  hp: { max: number };
  defaults: { damage: number; fireRate: number; range: number };
  bullet: { speed: number; life: number; radius: number; spread: number; muzzleOffset: number };
  breakthroughDist: number;
  dtCap: number;
  vfx: { shootParticles: number; killParticles: number; breakthroughParticles: number };
}

export interface WavesConfig {
  totalWaves: number;
  enemyCountBase: number;
  enemyCountPerWave: number;
  firstSpawnDelay: number;
  spawnInterval: { base: number; perWave: number; min: number };
  betweenWaves: number;
  spawnMargin: number;
  typeRoll: { tankBase: number; tankPerWave: number; fastThreshold: number };
  bossWave: number;
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
}

export interface EnemiesConfig {
  defaults: { enemySpeed: number };
  types: Record<'normal' | 'fast' | 'tank' | 'boss', EnemyDef>;
}

export interface LegacyCardMeta {
  name: string;
  color: string;
  icon: string;
  desc: string;
}

export interface SkillsConfig {
  version: string;
  legacy: {
    starScale: number[];
    types: Record<string, LegacyCardMeta>;
    effects: {
      damagePerScale: number;
      ratePerScale: number;
      rangePerScale: number;
      luckPerScale: number;
      multiStar1DamagePerScale: number;
    };
  };
  cards: CardDef[];
  mechanisms: { bounty: BountyConfig };
}

export interface PerkDef {
  id: string;
  title: string;
  desc: string;
  kind: 'damagePct' | 'fireRatePct' | 'heal';
  value: number;
}

export interface ProgressionConfig {
  xpNeedBase: number;
  xpGrowth: number;
  perks: PerkDef[];
}

/** 装备操作模式：lock=锁定即装备（方案B，基座默认）；slots=独立装备格（方案A，variant）。 */
export type EquipMode = 'lock' | 'slots';

export interface EconomyConfig {
  maxStar: number;
  mergeCopies: number;
  equipThreshold: number;
  equipMode: EquipMode;
  handSlots: number;
  equipSlots: number;
  maxLocked: number;
  inRunSlotExpansion: boolean;
  equipDistinctTypes: boolean;
  feedEquipped: boolean;
  dropStarPolicy: { normal: number; bountyBossMax: number; star2Share: number };
  drops: { pickupRadius: number; chanceCap: number };
  defaults: { dropChance: number; dropLifetime: number };
}

export interface TunerRange {
  min: number;
  max: number;
  step: number;
}

export type TunerConfig = Record<'damage' | 'fireRate' | 'range' | 'dropChance' | 'dropLifetime' | 'enemySpeed', TunerRange>;

export interface GameConfig {
  combat: CombatConfig;
  waves: WavesConfig;
  enemies: EnemiesConfig;
  skills: SkillsConfig;
  progression: ProgressionConfig;
  economy: EconomyConfig;
  tuner: TunerConfig;
}

/** variant 覆盖文件的形状：任意深度的部分覆盖。 */
export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
