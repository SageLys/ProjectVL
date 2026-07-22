// 效果运行时推进：每帧 tick 区域 / 光环 / 召唤物 / 护盾 / 增益 / 状态与 dot 结算 / interval 绑定。
// updateGame 在各系统推进后统一调用 tickEffects。
import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng, Summon, Zone } from '../types';
import { runEffects, threatDirectionSummonPosition, type EffectCtx } from './registry';
import { fireTrigger, getModifiers, tickIntervalBindings } from './interpreter';
import { tickStatusTimers, applyKnockback } from './statusSystem';
import { dealDamage } from '../systems/damageSystem';
import { spawnParticle } from '../systems/particleSystem';
import { totalDamage, totalRange } from '../stats';
import { recordCardImpact } from '../../telemetry/combatCounters';

function insideZone(zone: Zone, x: number, y: number, r: number): boolean {
  const d = Math.hypot(x - zone.x, y - zone.y);
  if (zone.shape === 'ring') return d + r >= (zone.innerRadius ?? zone.radius * 0.5) && d - r <= zone.radius;
  return d <= zone.radius + r;
}

function tickZones(state: GameState, config: Config, rng: Rng, dt: number, events: GameEvent[]): void {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const zone = state.zones[i];
    zone.remaining -= dt;
    zone.tickTimer -= dt;
    if (zone.tickTimer <= 0) {
      zone.tickTimer = zone.tickInterval;
      for (const enemy of [...state.enemies]) {
        if (!insideZone(zone, enemy.x, enemy.y, enemy.r)) continue;
        const ctx: EffectCtx = {
          state, config, rng, events,
          origin: { x: zone.x, y: zone.y },
          radius: zone.radius,
          star: 0,
          baseDamage: zone.baseDamage,
          zoneTick: true,
          enemy,
        };
        runEffects(ctx, zone.effects);
      }
    }
    if (zone.remaining <= 0) state.zones.splice(i, 1);
  }
}

/** 常驻光环（装备态 aura 修饰）：以炮台为中心周期施加内嵌效果。 */
function tickAuras(state: GameState, config: Config, rng: Rng, dt: number, events: GameEvent[]): void {
  const mods = getModifiers(state);
  const liveKeys = new Set<string>();
  for (const aura of mods.auras) {
    liveKeys.add(aura.key);
    const clock = (state.intervalClocks[aura.key] ?? aura.tickInterval) - dt;
    if (clock <= 0) {
      state.intervalClocks[aura.key] = aura.tickInterval;
      const radius = aura.radius ?? (aura.radiusRatioOfRange ?? 0.5) * totalRange(state, config);
      const t = cfg.combat.turret;
      for (const enemy of [...state.enemies]) {
        if (Math.hypot(enemy.x - t.x, enemy.y - t.y) > radius + enemy.r) continue;
        const ctx: EffectCtx = {
          state, config, rng, events,
          origin: { x: t.x, y: t.y },
          radius,
          star: aura.star,
          baseDamage: totalDamage(state, config),
          zoneTick: true,
          sourceCardType: aura.sourceCardType,
          enemy,
        };
        runEffects(ctx, aura.effects);
      }
    } else {
      state.intervalClocks[aura.key] = clock;
    }
  }
  for (const key of Object.keys(state.intervalClocks)) {
    if (key.startsWith('aura:') && !liveKeys.has(key)) delete state.intervalClocks[key];
  }
}

function explodeSummon(state: GameState, config: Config, rng: Rng, summon: Summon, events: GameEvent[]): void {
  if (!summon.explodeOnDeath) return;
  const { damage, knockbackDistance } = summon.explodeOnDeath;
  const maxRange = totalRange(state, config);
  for (const e of [...state.enemies]) {
    if (Math.hypot(e.x - summon.x, e.y - summon.y) > 120 + e.r) continue;
    applyKnockback(e, summon.x, summon.y, knockbackDistance, maxRange);
    const hpBefore = Math.max(0, e.hp);
    events.push(...dealDamage(state, config, rng, e, damage));
    recordCardImpact(state, summon.sourceCardId, hpBefore - Math.max(0, e.hp));
  }
  for (let i = 0; i < 12; i++) spawnParticle(state, rng, summon.x, summon.y, '#ffd166', 160);
}

function tickSummons(state: GameState, config: Config, rng: Rng, dt: number, events: GameEvent[]): void {
  for (let i = state.summons.length - 1; i >= 0; i--) {
    const s = state.summons[i];
    if (s.remaining != null) s.remaining -= dt;
    // 镜像炮台：按冷却向最近敌人开火（本体伤害 × damageRatio）。
    if (s.kind === 'mirrorTurret') {
      s.fireCd = (s.fireCd ?? 0) - dt;
      if (s.fireCd <= 0) {
        let best = null as null | { x: number; y: number };
        let bestDist = Infinity;
        for (const e of state.enemies) {
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d < bestDist && d <= totalRange(state, config) * 0.8) { best = e; bestDist = d; }
        }
        if (best) {
          const a = Math.atan2(best.y - s.y, best.x - s.x);
          const B = cfg.combat.bullet;
          state.bullets.push({
            x: s.x, y: s.y,
            vx: Math.cos(a) * B.speed, vy: Math.sin(a) * B.speed,
            r: B.radius, life: B.life,
            damage: totalDamage(state, config) * (s.damageRatio ?? 0.3),
            sourceCardId: s.sourceCardId,
          });
          s.fireCd = 0.7;
        }
      }
    }
    // 环绕球：绕炮台公转，接触伤害。
    if (s.kind === 'orbital') {
      s.angle = (s.angle ?? 0) + dt * 2.2;
      const t = cfg.combat.turret;
      s.x = t.x + Math.cos(s.angle) * 85;
      s.y = t.y + Math.sin(s.angle) * 85;
      s.fireCd = (s.fireCd ?? 0) - dt;
      if (s.fireCd <= 0) {
        for (const e of [...state.enemies]) {
          if (Math.hypot(e.x - s.x, e.y - s.y) <= 20 + e.r) {
            const hpBefore = Math.max(0, e.hp);
            events.push(...dealDamage(state, config, rng, e, totalDamage(state, config) * (s.damageRatio ?? 0.5)));
            recordCardImpact(state, s.sourceCardId, hpBefore - Math.max(0, e.hp));
            s.fireCd = 0.25;
            break;
          }
        }
      }
    }
    const dead = s.hp <= 0;
    const expired = s.remaining != null && s.remaining <= 0;
    if (dead || expired) {
      if (dead) state.vfx.push({ kind: 'summonEvent', x: s.x, y: s.y, event: 'destroyed', remaining: 0.4 });
      explodeSummon(state, config, rng, s, events);
      // 重生一次（decoy 5★）：只对"被摧毁"（非到期）生效，每个召唤物实例限一次。
      if (dead && s.respawnOnce && !s.respawned) {
        if (s.placement === 'threatDirection' && s.sourceCardId != null) {
          const position = threatDirectionSummonPosition(state, s.sourceCardId, s.distanceFromTurret ?? 150);
          s.x = position.x;
          s.y = position.y;
        } else {
          const { width, height } = cfg.combat.canvas;
          s.x = 40 + rng() * (width - 80);
          s.y = 40 + rng() * (height - 80);
        }
        s.hp = s.maxHp;
        s.respawned = true;
        state.vfx.push({ kind: 'summonEvent', x: s.x, y: s.y, event: 'respawn', remaining: 0.55 });
        continue;
      }
      state.summons.splice(i, 1);
    }
  }
}

function tickShield(state: GameState, dt: number): void {
  const shield = state.shield;
  if (!shield) return;
  if (shield.hits <= 0 && shield.regenRemaining != null) {
    shield.regenRemaining -= dt;
    if (shield.regenRemaining <= 0) {
      shield.hits = shield.maxHits;
      shield.regenRemaining = null;
    }
  }
}

function tickBuffs(state: GameState, dt: number): void {
  for (let i = state.buffs.length - 1; i >= 0; i--) {
    state.buffs[i].remaining -= dt;
    if (state.buffs[i].remaining <= 0) state.buffs.splice(i, 1);
  }
}

function tickVfx(state: GameState, dt: number): void {
  for (let i = state.vfx.length - 1; i >= 0; i--) {
    state.vfx[i].remaining -= dt;
    if (state.vfx[i].remaining <= 0) state.vfx.splice(i, 1);
  }
}

/** 挂敌身的 dot 结算 + 状态计时推进。 */
function tickDots(state: GameState, config: Config, rng: Rng, dt: number, events: GameEvent[]): void {
  for (const enemy of [...state.enemies]) {
    let total = 0;
    for (const dot of enemy.status.dots) if (dot.remaining > 0) total += dot.dps * dt;
    enemy.status.dots = enemy.status.dots.filter(d => d.remaining > 0);
    if (total > 0) events.push(...dealDamage(state, config, rng, enemy, total, 'dot'));
  }
  tickStatusTimers(state, dt);
}

/** 效果运行时统一推进入口。 */
export function tickEffects(state: GameState, config: Config, rng: Rng, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  events.push(...tickIntervalBindings(state, config, rng, dt));
  tickAuras(state, config, rng, dt, events);
  tickZones(state, config, rng, dt, events);
  tickSummons(state, config, rng, dt, events);
  tickShield(state, dt);
  tickBuffs(state, dt);
  tickDots(state, config, rng, dt, events);
  tickVfx(state, dt);
  return events;
}

/** 突破结算的护盾/减免/反伤钩子（enemySystem 调用）。返回 null=护盾吸收（不扣血）。 */
export function absorbBreach(state: GameState, config: Config, rng: Rng, damage: number, events: GameEvent[]): number | null {
  const mods = getModifiers(state);
  const shield = state.shield;
  if (shield && shield.hits > 0) {
    shield.hits--;
    if (shield.hits <= 0) {
      events.push({ type: 'shieldBroken' });
      if (mods.novaOnBreak) {
        const t = cfg.combat.turret;
        const maxRange = totalRange(state, config);
        for (const e of [...state.enemies]) {
          if (Math.hypot(e.x - t.x, e.y - t.y) > 220 + e.r) continue;
          applyKnockback(e, t.x, t.y, mods.novaOnBreak.knockbackDistance, maxRange);
          events.push(...dealDamage(state, config, rng, e, mods.novaOnBreak.damage));
        }
      }
      if (shield.regenSeconds != null) shield.regenRemaining = shield.regenSeconds;
    }
    return null;
  }
  return damage * (1 - mods.breachReduction);
}

export { fireTrigger, getModifiers };
