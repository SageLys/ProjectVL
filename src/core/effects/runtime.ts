// 效果运行时推进：每帧 tick 区域 / 光环 / 召唤物 / 护盾 / 增益 / 状态与 dot 结算 / interval 绑定。
// updateGame 在各系统推进后统一调用 tickEffects。
import { cfg } from '../../config';
import type { Config, GameEvent, GameState, Rng, Summon, Zone } from '../types';
import { atomNumberDefault } from './atomContract';
import { runEffects, selectEffectOrigin, threatDirectionSummonPosition, type EffectCtx } from './registry';
import { fireTrigger, getModifiers, tickIntervalBindings } from './interpreter';
import { tickStatusTimers, applyKnockback } from './statusSystem';
import { dealDamage } from '../systems/damageSystem';
import { spawnParticle } from '../systems/particleSystem';
import { reconcileMaxHp, totalDamage, totalRange } from '../stats';
import { recordCardImpact } from '../../telemetry/combatCounters';

function insideZone(zone: Zone, x: number, y: number, r: number): boolean {
  if (zone.shape === 'line') {
    const startX = zone.lineStartX ?? zone.x;
    const startY = zone.lineStartY ?? zone.y;
    const dirX = zone.lineDirX ?? 1;
    const dirY = zone.lineDirY ?? 0;
    const length = zone.lineLength ?? zone.radius * 2;
    const endX = startX + dirX * length;
    const endY = startY + dirY * length;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSq > 0
      ? Math.max(0, Math.min(1, ((x - startX) * segmentX + (y - startY) * segmentY) / segmentLengthSq))
      : 0;
    const nearestX = startX + segmentX * projection;
    const nearestY = startY + segmentY * projection;
    return Math.hypot(x - nearestX, y - nearestY) <= (zone.lineWidth ?? zone.radius) / 2;
  }
  const d = Math.hypot(x - zone.x, y - zone.y);
  if (zone.shape === 'ring') return d + r >= (zone.innerRadius ?? zone.radius * 0.5) && d - r <= zone.radius;
  return d <= zone.radius + r;
}

function tickZones(state: GameState, config: Config, rng: Rng, dt: number, events: GameEvent[]): void {
  const mods = getModifiers(state);
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const zone = state.zones[i];
    zone.remaining -= dt;
    if (zone.radiusOverTime && zone.totalDuration && zone.totalDuration > 0) {
      const progress = Math.max(0, Math.min(1, 1 - zone.remaining / zone.totalDuration));
      zone.radius = zone.radiusOverTime.from + (zone.radiusOverTime.to - zone.radiusOverTime.from) * progress;
      if (zone.shape === 'line') {
        zone.lineLength = zone.radius * 2;
        zone.lineWidth = zone.radius;
      }
    }
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
          sourceCardId: zone.sourceCardId,
          sourceCardType: zone.sourceCardType,
          sourceBindingIndex: zone.sourceBindingIndex,
          enemy,
          scaleEnemy: enemy,
          dynamic: { thornsRatio: mods.thornsRatio, auraReduction: mods.breachReduction },
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
    const existing = state.effectRuntime.auraOrigins[aura.key] ?? {
      x: cfg.combat.turret.x,
      y: cfg.combat.turret.y,
      startedAt: state.time,
    };
    state.effectRuntime.auraOrigins[aura.key] = existing;
    if (aura.follow) {
      const probe: EffectCtx = {
        state, config, rng, events, origin: { x: existing.x, y: existing.y },
        star: aura.star, baseDamage: totalDamage(state, config),
      };
      const target = selectEffectOrigin(probe, aura.follow);
      const alpha = 1 - Math.pow(1 - Math.max(0, Math.min(1, aura.followLerp)), dt);
      existing.x += (target.x - existing.x) * alpha;
      existing.y += (target.y - existing.y) * alpha;
    }
    const clock = (state.intervalClocks[aura.key] ?? aura.tickInterval) - dt;
    if (clock <= 0) {
      state.intervalClocks[aura.key] = aura.tickInterval;
      const ratioOfRange = aura.radiusRatioOfRange ?? atomNumberDefault('aura', 'radiusRatioOfRange');
      let radius = aura.radius ?? ratioOfRange * totalRange(state, config);
      if (aura.radiusOverTime) {
        const progress = Math.max(0, Math.min(1, (state.time - existing.startedAt) / Math.max(Number.EPSILON, aura.duration)));
        radius = aura.radiusOverTime.from + (aura.radiusOverTime.to - aura.radiusOverTime.from) * progress;
      }
      for (const enemy of [...state.enemies]) {
        const distance = Math.hypot(enemy.x - existing.x, enemy.y - existing.y);
        if (aura.shape === 'ring') {
          if (distance + enemy.r < (aura.innerRadius ?? radius * 0.5) || distance - enemy.r > radius) continue;
        } else if (distance > radius + enemy.r) continue;
        const ctx: EffectCtx = {
          state, config, rng, events,
          origin: { x: existing.x, y: existing.y },
          radius,
          star: aura.star,
          baseDamage: totalDamage(state, config),
          zoneTick: true,
          sourceCardId: aura.sourceCardId,
          sourceCardType: aura.sourceCardType,
          sourceBindingIndex: aura.sourceBindingIndex,
          enemy,
          scaleEnemy: enemy,
          dynamic: { thornsRatio: mods.thornsRatio, auraReduction: mods.breachReduction },
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
  for (const key of Object.keys(state.effectRuntime.auraOrigins)) {
    if (!liveKeys.has(key)) delete state.effectRuntime.auraOrigins[key];
  }
}

function explodeSummon(state: GameState, config: Config, rng: Rng, summon: Summon, events: GameEvent[]): void {
  if (summon.onDeathEffects?.length) {
    runEffects({
      state, config, rng, events, origin: { x: summon.x, y: summon.y }, star: 6,
      baseDamage: summon.baseDamage ?? totalDamage(state, config), sourceCardId: summon.sourceCardId,
      sourceCardType: summon.sourceCardType, sourceBindingIndex: summon.sourceBindingIndex,
    }, summon.onDeathEffects);
  }
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
    if (s.intervalEffects?.length && s.intervalTimer != null) {
      s.intervalTimer -= dt;
      if (s.intervalTimer <= 0) {
        const interval = Math.max(0.05, s.intervalSeconds || 1);
        s.intervalTimer += interval;
        runEffects({
          state, config, rng, events, origin: { x: s.x, y: s.y }, star: 6,
          baseDamage: (s.baseDamage ?? totalDamage(state, config)) * (s.damageRatio ?? 1),
          sourceCardId: s.sourceCardId, sourceCardType: s.sourceCardType, sourceBindingIndex: s.sourceBindingIndex,
        }, s.intervalEffects);
      }
    }
    if (s.auraEffects?.length && (s.auraRadius ?? 0) > 0) {
      for (const enemy of state.enemies) {
        if (Math.hypot(enemy.x - s.x, enemy.y - s.y) > (s.auraRadius ?? 0) + enemy.r) continue;
        runEffects({
          state, config, rng, events, origin: { x: s.x, y: s.y }, star: 6,
          baseDamage: (s.baseDamage ?? totalDamage(state, config)) * (s.damageRatio ?? 1),
          sourceCardId: s.sourceCardId, sourceCardType: s.sourceCardType, sourceBindingIndex: s.sourceBindingIndex,
          enemy, scaleEnemy: enemy, zoneTick: true,
        }, s.auraEffects);
      }
    }
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
          s.fireCd = s.fireInterval;
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
            s.fireCd = s.fireInterval;
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
          const sourceKey = `${s.sourceCardType ?? 'unknown'}/${s.sourceCardId}/${s.sourceBindingIndex ?? 0}/${s.sourceEffectIndex ?? 0}`;
          const position = threatDirectionSummonPosition(state, sourceKey, s.distanceFromTurret ?? 150);
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

function tickShield(state: GameState, dt: number, events: GameEvent[]): void {
  const shield = state.shield;
  if (!shield) return;
  if (shield.hits <= 0 && shield.regenRemaining != null) {
    shield.regenRemaining -= dt;
    if (shield.regenRemaining <= 0) {
      shield.hits = shield.maxHits;
      shield.regenRemaining = null;
      const t = cfg.combat.turret;
      state.vfx.push({ kind: 'shieldRegen', x: t.x, y: t.y, remaining: 0.5 });
      events.push({ type: 'shieldRestored' });
    }
  }
}

function tickStatModifiers(state: GameState, dt: number): void {
  let maxHpChanged = false;
  for (let i = state.statModifiers.length - 1; i >= 0; i--) {
    const modifier = state.statModifiers[i];
    if (modifier.remaining === undefined) continue;
    modifier.remaining -= dt;
    if (modifier.remaining <= 0) {
      if (modifier.stat === 'maxHpAdd') maxHpChanged = true;
      state.statModifiers.splice(i, 1);
    }
  }
  if (maxHpChanged) reconcileMaxHp(state);
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
  tickShield(state, dt, events);
  tickStatModifiers(state, dt);
  tickDots(state, config, rng, dt, events);
  tickVfx(state, dt);
  return events;
}

/** 突破结算的护盾/减免/反伤钩子（enemySystem 调用）。返回 null=护盾吸收（不扣血）。 */
export function absorbBreach(state: GameState, config: Config, rng: Rng, damage: number, events: GameEvent[]): number | null {
  const mods = getModifiers(state);
  const shield = state.shield;
  const t = cfg.combat.turret;
  if (shield && shield.hits > 0) {
    shield.hits--;
    state.vfx.push({ kind: 'shieldAbsorb', x: t.x, y: t.y, remaining: 0.25 });
    if (shield.hits <= 0) {
      events.push({ type: 'shieldBroken' });
      state.vfx.push({ kind: 'shieldBreak', x: t.x, y: t.y, remaining: 0.45 });
      if (mods.novaOnBreak) {
        state.vfx.push({ kind: 'retaliationNova', x: t.x, y: t.y, radius: 220, remaining: 0.4 });
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
  if (mods.breachReduction > 0) {
    state.vfx.push({ kind: 'breachMitigated', x: t.x, y: t.y, remaining: 0.3 });
  }
  return damage * (1 - mods.breachReduction);
}

export { fireTrigger, getModifiers };
