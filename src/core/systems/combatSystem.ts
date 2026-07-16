import { cfg } from '../../config';
import type { Config, Enemy, GameEvent, GameState, Rng } from '../types';
import { totalDamage, totalFireRate, totalMulti, totalRange } from '../stats';
import { spawnParticle } from './particleSystem';
import { dealDamage, killEnemy, tryExecute } from './damageSystem';
import { fireTrigger, getModifiers } from '../effects/interpreter';
import { damageTakenMultiplier } from '../effects/statusSystem';
import { ATOMS, type EffectCtx } from '../effects/registry';

/**
 * 索敌：紧急距离内最近 > 活跃 Bounty 成员最近 > 烙印权重降序 > 射程内最近。
 */
export function findTarget(state: GameState, config: Config): Enemy | null {
  const range = totalRange(state, config);
  const t = cfg.combat.turret;
  const activeBountyIds = new Set(state.bountyEncounters
    .filter(encounter => encounter.status === 'spawning' || encounter.status === 'active')
    .map(encounter => encounter.id));
  let emergencyBest: Enemy | null = null;
  let emergencyDist = Infinity;
  let bountyBest: Enemy | null = null;
  let bountyDist = Infinity;
  let best: Enemy | null = null;
  let bestWeight = -Infinity;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - t.x, enemy.y - t.y);
    if (dist > range) continue;
    if (dist <= cfg.bounty.encounter.emergencyOverrideDistance && dist < emergencyDist) {
      emergencyBest = enemy;
      emergencyDist = dist;
    }
    if (enemy.bountyEncounterId !== undefined && activeBountyIds.has(enemy.bountyEncounterId) && dist < bountyDist) {
      bountyBest = enemy;
      bountyDist = dist;
    }
    const weight = enemy.status.brand?.weight ?? 0;
    if (weight > bestWeight || (weight === bestWeight && dist < bestDist)) {
      best = enemy;
      bestWeight = weight;
      bestDist = dist;
    }
  }
  return emergencyBest ?? bountyBest ?? best;
}

/** 朝目标开火：多弹丸扇形散布；每发触发 onFire（装备态修饰弹道/附着状态）。 */
export function shoot(state: GameState, config: Config, rng: Rng, target: Enemy): GameEvent[] {
  const events: GameEvent[] = [];
  const t = cfg.combat.turret;
  const B = cfg.combat.bullet;
  const a = Math.atan2(target.y - t.y, target.x - t.x);
  state.turretAngle = a;
  const multi = totalMulti(state);
  const dmg = totalDamage(state, config);
  const mods = getModifiers(state);

  if (mods.morph === 'mortar') {
    // 形态·榴弹：抛射至目标位置爆炸。
    const p = mods.morphParams;
    state.bullets.push({
      x: t.x + Math.cos(a) * B.muzzleOffset,
      y: t.y + Math.sin(a) * B.muzzleOffset,
      vx: Math.cos(a) * B.speed * 0.6,
      vy: Math.sin(a) * B.speed * 0.6,
      r: B.radius * 1.6,
      life: 3,
      damage: dmg * (typeof p.damageRatio === 'number' ? (p.damageRatio as number) : 1),
      kind: 'mortar',
      targetX: target.x,
      targetY: target.y,
      aoeRadius: typeof p.radius === 'number' ? (p.radius as number) : 90,
      aoeFalloff: typeof p.falloff === 'number' ? (p.falloff as number) : 0.5,
    });
  } else {
    for (let i = 0; i < multi; i++) {
      const offset = (i - (multi - 1) / 2) * B.spread;
      const bullet = {
        x: t.x + Math.cos(a) * B.muzzleOffset,
        y: t.y + Math.sin(a) * B.muzzleOffset,
        vx: Math.cos(a + offset) * B.speed,
        vy: Math.sin(a + offset) * B.speed,
        r: B.radius,
        life: B.life,
        damage: dmg,
      };
      state.bullets.push(bullet);
      events.push(...fireTrigger(state, config, rng, 'onFire', { bullet }));
    }
  }
  for (let i = 0; i < cfg.combat.vfx.shootParticles; i++) spawnParticle(state, rng, t.x + Math.cos(a) * 26, t.y + Math.sin(a) * 26, '#8cecff', 55);
  return events;
}

/**
 * 转向 + 射速节流开火。beam 换形时主炮以自身 interval 发射贯穿光束（替代普通弹）。
 */
export function updateTurret(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const t = cfg.combat.turret;
  state.shotCd -= dt;
  const target = findTarget(state, config);
  if (target) state.turretAngle = Math.atan2(target.y - t.y, target.x - t.x);

  const mods = getModifiers(state);
  if (mods.morph === 'beam') {
    const p = mods.morphParams;
    const interval = typeof p.interval === 'number' ? (p.interval as number) : 0.9;
    const clock = (state.intervalClocks['morph:beam'] ?? interval) - dt;
    if (target && clock <= 0) {
      const ctx: EffectCtx = {
        state, config, rng, events,
        origin: { x: t.x, y: t.y },
        star: 3,
        baseDamage: totalDamage(state, config),
        enemy: target,
      };
      ATOMS.beamMorph(ctx, p);
      state.intervalClocks['morph:beam'] = interval;
    } else {
      state.intervalClocks['morph:beam'] = Math.max(clock, 0);
    }
    return events;
  }

  if (target && state.shotCd <= 0) {
    events.push(...shoot(state, config, rng, target));
    state.shotCd = 1 / totalFireRate(state, config);
  }
  return events;
}

/** 命中结算：易伤乘数、附着效果（riders）、onHit 触发、处决、击杀。 */
function hitEnemy(state: GameState, config: Config, rng: Rng, bullet: { x: number; y: number; damage: number; riders?: { atom: string; params?: Record<string, unknown> }[] }, enemy: Enemy, events: GameEvent[]): boolean {
  enemy.hp -= bullet.damage * damageTakenMultiplier(enemy);
  enemy.hit = 0.08;
  spawnParticle(state, rng, bullet.x, bullet.y, '#d8fbff', 50);

  const hitPoint = { x: bullet.x, y: bullet.y };
  if (enemy.hp > 0 && bullet.riders) {
    for (const rider of bullet.riders) {
      const handler = ATOMS[rider.atom as keyof typeof ATOMS];
      if (!handler) continue;
      const ctx: EffectCtx = {
        state, config, rng, events,
        origin: hitPoint,
        star: 0,
        baseDamage: totalDamage(state, config),
        bullet: bullet as never,
        enemy,
      };
      handler(ctx, rider.params ?? {});
    }
  }
  if (state.enemies.includes(enemy)) {
    events.push(...fireTrigger(state, config, rng, 'onHit', { bullet: bullet as never, enemy, point: hitPoint }));
  }
  const mods = getModifiers(state);
  if (mods.executeThreshold > 0 && state.enemies.includes(enemy) && enemy.hp > 0) {
    events.push(...tryExecute(state, config, rng, enemy, mods.executeThreshold));
    if (!state.enemies.includes(enemy)) return true;
  }
  if (enemy.hp <= 0 && state.enemies.includes(enemy)) {
    state.enemies.splice(state.enemies.indexOf(enemy), 1);
    events.push(...killEnemy(state, config, rng, enemy));
    return true;
  }
  return enemy.hp <= 0;
}

/** mortar 落点爆炸。 */
function explodeMortar(state: GameState, config: Config, rng: Rng, b: { x: number; y: number; damage: number; aoeRadius?: number; aoeFalloff?: number }, events: GameEvent[]): void {
  const radius = b.aoeRadius ?? 90;
  const falloff = b.aoeFalloff ?? 0.5;
  for (const e of [...state.enemies]) {
    const d = Math.hypot(e.x - b.x, e.y - b.y);
    if (d > radius + e.r) continue;
    events.push(...dealDamage(state, config, rng, e, b.damage * (1 - falloff * Math.min(1, d / radius))));
  }
  for (let i = 0; i < 10; i++) spawnParticle(state, rng, b.x, b.y, '#ffb347', 140);
}

/**
 * 推进子弹：位移、穿透/弹射/榴弹、命中扣血、击杀结算、越界/超时移除。
 */
export function updateBullets(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const { width, height } = cfg.combat.canvas;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.kind === 'mortar') {
      const arrived = b.targetX != null && b.targetY != null
        && Math.hypot(b.x - b.targetX, b.y - b.targetY) < 14;
      if (arrived || b.life <= 0) {
        explodeMortar(state, config, rng, b, events);
        state.bullets.splice(i, 1);
      }
      continue;
    }

    // 场边弹射（ricochet）。
    if (b.ricochetLeft && b.ricochetLeft > 0) {
      if ((b.x < 0 && b.vx < 0) || (b.x > width && b.vx > 0)) { b.vx = -b.vx; b.ricochetLeft--; }
      if ((b.y < 0 && b.vy < 0) || (b.y > height && b.vy > 0)) { b.vy = -b.vy; b.ricochetLeft--; }
    }

    let consumed = false;
    for (const e of [...state.enemies]) {
      if (b.hitIds?.includes(e.id)) continue;
      if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 >= (b.r + e.r) ** 2) continue;
      hitEnemy(state, config, rng, b, e, events);
      if (b.pierceLeft && b.pierceLeft > 0) {
        b.pierceLeft--;
        (b.hitIds ??= []).push(e.id);
        b.damage *= (b.damageRetention ?? 0.8) * (1 + (b.rampPerPierce ?? 0));
        continue; // 穿透：不消耗子弹，继续判定下一个敌人
      }
      consumed = true;
      break;
    }
    if (consumed || b.life <= 0 || b.x < -20 || b.x > width + 20 || b.y < -20 || b.y > height + 20) {
      state.bullets.splice(i, 1);
    }
  }
  return events;
}
