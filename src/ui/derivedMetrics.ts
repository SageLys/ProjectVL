import type { GameConfig } from '../config';
import type { Config, EnemyType } from '../core/types';

const TYPES: EnemyType[] = ['normal', 'fast', 'tank', 'boss'];

export interface DerivedCell {
  hitRate: number;
  ttk: number;
  entryWalk: number;
  insideWalk: number;
  killDepth: number;
  onScreen: number;
}

export interface DerivedMetrics {
  cells: Record<EnemyType, DerivedCell[]>;
  waveDurations: number[];
  totalDuration: number;
  dropsPerMinute: number;
}

function spawnDistance(config: GameConfig): number {
  const { width, height } = config.combat.canvas;
  const { x, y } = config.combat.turret;
  const m = config.waves.spawnMargin;
  const points = [[width / 2, -m], [width + m, height / 2], [width / 2, height + m], [-m, height / 2]];
  return points.reduce((sum, [px, py]) => sum + Math.hypot(px - x, py - y), 0) / points.length;
}

/**
 * §2-H 的透明估算模型。散布视为 [-spread,+spread] 均匀角误差，命中率为
 * min(1, 敌半径 / (射程 × tan(spread)))；spread=0 时命中率为 1。
 */
export function deriveMetrics(game: GameConfig, runtime: Config): DerivedMetrics {
  const distance = spawnDistance(game);
  const cells = {} as Record<EnemyType, DerivedCell[]>;
  for (const type of TYPES) {
    const def = game.enemies.types[type];
    cells[type] = [1, 2, 3].map(wave => {
      const hp = def.hpBase + wave * def.hpPerWave;
      const speed = (def.speedBase + wave * def.speedPerWave) * runtime.enemySpeed;
      const spreadWidth = runtime.range * Math.tan(game.combat.bullet.spread);
      const hitRate = spreadWidth <= 0 ? 1 : Math.min(1, def.r / spreadWidth);
      const ttk = hp / Math.max(0.0001, runtime.damage * runtime.fireRate * hitRate);
      const entryWalk = Math.max(0, distance - runtime.range) / Math.max(0.0001, speed);
      const breachWalk = Math.max(0, runtime.range - game.combat.breakthroughDist) / Math.max(0.0001, speed);
      const insideWalk = Math.min(ttk, breachWalk);
      const killDepth = runtime.range - speed * ttk;
      const interval = Math.max(game.waves.spawnInterval.min, game.waves.spawnInterval.base - wave * game.waves.spawnInterval.perWave);
      const budgetTarget = game.waves.budget.targetOnScreen.base + wave * game.waves.budget.targetOnScreen.perWave;
      const onScreen = game.waves.spawnMode === 'budget'
        ? Math.min(game.waves.budget.maxAlive, budgetTarget)
        : (entryWalk + ttk) / Math.max(0.0001, interval);
      return { hitRate, ttk, entryWalk, insideWalk, killDepth, onScreen };
    });
  }

  const waveDurations = Array.from({ length: game.waves.totalWaves }, (_, index) => {
    const wave = index + 1;
    const interval = Math.max(game.waves.spawnInterval.min, game.waves.spawnInterval.base - wave * game.waves.spawnInterval.perWave);
    const count = game.waves.enemyCountBase + wave * game.waves.enemyCountPerWave;
    const tailTypes = game.waves.bossWaves.includes(wave) ? TYPES : TYPES.filter(type => type !== 'boss');
    const tail = Math.max(...tailTypes.map(type => {
      const def = game.enemies.types[type];
      const hp = def.hpBase + wave * def.hpPerWave;
      const speed = (def.speedBase + wave * def.speedPerWave) * runtime.enemySpeed;
      const spreadWidth = runtime.range * Math.tan(game.combat.bullet.spread);
      const hit = spreadWidth <= 0 ? 1 : Math.min(1, def.r / spreadWidth);
      return Math.max(0, distance - runtime.range) / speed + hp / (runtime.damage * runtime.fireRate * hit);
    }));
    const spawnDuration = game.waves.spawnMode === 'budget'
      ? Math.max(0, Math.ceil(count / Math.max(1, game.waves.budget.batchMax)) - 1) * game.waves.budget.checkInterval
      : Math.max(0, count - 1) * interval;
    return game.waves.firstSpawnDelay + spawnDuration + tail;
  });
  const totalDuration = waveDurations.reduce((sum, seconds) => sum + seconds, 0)
    + Math.max(0, game.waves.totalWaves - 1) * game.waves.betweenWaves;

  const normalWave1 = cells.normal[0];
  const dropsPerMinute = 60 * runtime.dropChance / Math.max(0.0001, normalWave1.ttk);
  return { cells, waveDurations, totalDuration, dropsPerMinute };
}
