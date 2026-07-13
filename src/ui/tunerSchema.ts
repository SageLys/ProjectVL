export type TunerGroup = 'waves' | 'combat' | 'enemies' | 'drops' | 'p2';

export interface TunerParam {
  path: string;
  label: string;
  group: TunerGroup;
  waveDeferred?: boolean;
}

export const BUDGET_TUNER_PARAMS: TunerParam[] = [
  { path: 'waves.budget.targetOnScreen.base', label: 'Budget · 目标同屏基础', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.targetOnScreen.perWave', label: 'Budget · 目标同屏每波', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.checkInterval', label: 'Budget · 检查间隔', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.batchMax', label: 'Budget · 单次补怪上限', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.waveEndSprint.window', label: 'Budget · 波末窗口', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.waveEndSprint.multiplier', label: 'Budget · 波末目标倍率', group: 'waves', waveDeferred: true },
  { path: 'waves.budget.maxAlive', label: 'Budget · 同屏硬上限', group: 'waves', waveDeferred: true },
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
export const ALL_TUNER_PARAMS: TunerParam[] = [...TUNER_PARAMS, ...BUDGET_TUNER_PARAMS];

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
export function migratePresetValues(values: Record<string, number | string>): Record<string, number | string> {
  const migrated = { ...values };
  if (migrated['waves.bossWaves'] === undefined && migrated['waves.bossWave'] !== undefined) {
    migrated['waves.bossWaves'] = String(migrated['waves.bossWave']);
  }
  delete migrated['waves.bossWave'];
  return migrated;
}
