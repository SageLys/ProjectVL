import { gameConfig } from '../../data';
import type { Config, Enemy, GameEvent, GameState, Rng } from '../types';
import { totalDamage, totalFireRate, totalMulti, totalRange } from '../stats';
import { spawnParticle } from './particleSystem';
import { rollDropOnKill } from './dropSystem';
import { addXp } from './progressionSystem';

const TURRET = gameConfig.turret;
const CB = gameConfig.combat;

/** 锁定射程内最近的敌人；射程外的一律忽略。 */
export function findTarget(state: GameState, config: Config): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = Infinity;
  const range = totalRange(state, config);
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - TURRET.x, enemy.y - TURRET.y);
    if (dist <= range && dist < bestDist) { best = enemy; bestDist = dist; }
  }
  return best;
}

/** 朝目标开火：多弹丸按 spread 弧度扇形散布；迸发枪口粒子。 */
export function shoot(state: GameState, config: Config, rng: Rng, target: Enemy): void {
  const tx = TURRET.x;
  const ty = TURRET.y;
  const a = Math.atan2(target.y - ty, target.x - tx);
  state.turretAngle = a;
  const spread = CB.spread;
  const multi = totalMulti(state);
  const dmg = totalDamage(state, config);
  for (let i = 0; i < multi; i++) {
    const offset = (i - (multi - 1) / 2) * spread;
    state.bullets.push({
      x: tx + Math.cos(a) * CB.muzzleOffset,
      y: ty + Math.sin(a) * CB.muzzleOffset,
      vx: Math.cos(a + offset) * CB.bulletSpeed,
      vy: Math.sin(a + offset) * CB.bulletSpeed,
      r: CB.bulletRadius,
      life: CB.bulletLife,
      damage: dmg,
    });
  }
  for (let i = 0; i < gameConfig.vfx.shootParticles; i++) spawnParticle(state, rng, tx + Math.cos(a) * 26, ty + Math.sin(a) * 26, '#8cecff', 55);
}

/** 转向 + 射速节流开火。锁定目标则转向；冷却就绪则射击并重置冷却。 */
export function updateTurret(state: GameState, config: Config, rng: Rng, dt: number): void {
  state.shotCd -= dt;
  const target = findTarget(state, config);
  if (target) state.turretAngle = Math.atan2(target.y - TURRET.y, target.x - TURRET.x);
  if (target && state.shotCd <= 0) {
    shoot(state, config, rng, target);
    state.shotCd = 1 / totalFireRate(state, config);
  }
}

/** 击杀结算：计分、迸发粒子、掉落判定、加经验（可能触发升级）。 */
function killEnemy(state: GameState, config: Config, rng: Rng, enemy: Enemy): GameEvent[] {
  state.kills++;
  for (let i = 0; i < gameConfig.vfx.killParticles; i++) spawnParticle(state, rng, enemy.x, enemy.y, enemy.color, 150);
  rollDropOnKill(state, config, rng, enemy);
  return addXp(state, enemy.xp);
}

/** 推进子弹：位移、命中扣血、击杀结算、越界/超时移除。返回击杀衍生事件。 */
export function updateBullets(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j--) {
      const e = state.enemies[j];
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (b.r + e.r) ** 2) {
        e.hp -= b.damage;
        e.hit = 0.08;
        hit = true;
        spawnParticle(state, rng, b.x, b.y, '#d8fbff', 50);
        if (e.hp <= 0) {
          state.enemies.splice(j, 1);
          events.push(...killEnemy(state, config, rng, e));
        }
        break;
      }
    }
    if (hit || b.life <= 0 || b.x < -20 || b.x > 980 || b.y < -20 || b.y > 620) state.bullets.splice(i, 1);
  }
  return events;
}
