import { enemies as enemiesData, gameConfig, waves as wavesData } from '../../data';
import type { Config, EnemyType, GameEvent, GameState, Rng } from '../types';
import { endGame } from '../endGame';
import { spawnParticle } from './particleSystem';

const TURRET = gameConfig.turret;
const CB = gameConfig.combat;

/**
 * 敌人类型判定：roll < tankBase + wave*tankPerWave → 重装；
 * roll < fastThreshold → 高速；否则普通。第 bossWave 波最后一只强制 boss。
 */
export function determineType(wave: number, roll: number, spawnLeft: number): EnemyType {
  const tr = wavesData.typeRoll;
  let type: EnemyType = roll < tr.tankBase + wave * tr.tankPerWave ? 'tank' : roll < tr.fastThreshold ? 'fast' : 'normal';
  if (wave === wavesData.bossWave && spawnLeft === 1) type = 'boss';
  return type;
}

/** 生成一只敌人：类型判定 → 取基础值+每波成长 → 四边随机出生（边缘外 spawnMargin）。 */
export function spawnEnemy(state: GameState, rng: Rng): void {
  const roll = rng();
  const type = determineType(state.wave, roll, state.spawnLeft);
  const def = enemiesData[type];
  const hp = def.hpBase + state.wave * def.hpPerWave;
  const speed = def.speedBase + state.wave * def.speedPerWave;
  const side = Math.floor(rng() * 4);
  const margin = wavesData.spawnMargin;
  const spawn = side === 0 ? { x: 35 + rng() * 890, y: -margin }
    : side === 1 ? { x: 960 + margin, y: 35 + rng() * 530 }
    : side === 2 ? { x: 35 + rng() * 890, y: 600 + margin }
    : { x: -margin, y: 35 + rng() * 530 };
  state.enemies.push({
    x: spawn.x, y: spawn.y, type, label: def.label,
    hp, maxHp: hp, speed, r: def.r, color: def.color, damage: def.damage, xp: def.xp, hit: 0,
  });
}

/**
 * 推进敌人：向炮台移动（受 enemySpeed 缩放），进入突破距离则扣血、消失、
 * 迸发粒子并产出 breakthrough 事件；HP 归零则结束对局（失败）。
 */
export function moveEnemies(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const dx = TURRET.x - e.x;
    const dy = TURRET.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx / len) * e.speed * config.enemySpeed * dt;
    e.y += (dy / len) * e.speed * config.enemySpeed * dt;
    e.hit -= dt;
    if (Math.hypot(dx, dy) < CB.breakthroughDist) {
      state.hp -= e.damage;
      state.enemies.splice(i, 1);
      for (let k = 0; k < gameConfig.vfx.breakthroughParticles; k++) spawnParticle(state, rng, TURRET.x, TURRET.y, '#ff6677', 170);
      events.push({ type: 'breakthrough', damage: e.damage });
      if (state.hp <= 0) events.push(...endGame(state, false));
    }
  }
  return events;
}
